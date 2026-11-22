import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage, ToolMessage } from '@langchain/core/messages'
import { parseContent, parseReasoning } from '@core/utils/parseStream'
import { toChatMessage, toMergedAssistantView } from '@core/utils/mappingMessage'
import { getChatGraph, setInsertSource, toRunnableConfig } from '@core/graph/chat'
import type { InsertInput } from '@core/graph/chat'
import { createDebugLog } from '@core/utils/log'
import { getConversationTitle } from '../utils/title'
import { MessageEventSend } from '@shared/types/newMessageService'
import buildHumanMessage from '@core/message/buildHumanMessage'
import { debugContent } from '@main/utils/debug'
import { AgentEvent } from '@shared/types/newEvent'

interface Props {
  /** 会话ID */
  conversationId: string
  /** 发送的消息 */
  message: MessageEventSend
  /** 消息ID,main侧生成 */
  messageId: string
  /** 回调函数 */
  emit: (event: AgentEvent) => void
  /** 是否中断 */
  signal?: AbortSignal
  /** 这一步边界上要插入的消息来源；main 传过来，core 不去碰队列本身 */
  takeInserts?: () => InsertInput[]
}
export async function sendMessage({
  conversationId,
  message,
  messageId,
  emit,
  signal
}: Props): Promise<void> {
  /** ====================  新的  ==================== */
  // 模型
  const graph = getChatGraph()
  // 配置(框架使用)
  const config = toRunnableConfig({ threadId: conversationId, signal })
  // 用户是否中断对话
  const isAborted = (): boolean => signal?.aborted === true
  // 获取历史消息
  const history = ((await graph.getState(config)).values?.messages ?? []) as BaseMessage[]
  // 初始化标题 TODO:支持MUser类型
  getConversationTitle(history.length === 0, conversationId, message.content || '', emit)
  // 初始化调试日志
  const debugLog = createDebugLog(conversationId)
  // 用户输入。这里是「发起」，不带插入标记；插入标记只在真正插进本轮的那条上写
  const userMessage = buildHumanMessage(message, messageId)
  // 输出内容
  let reply = ''
  // 思考内容
  let reasoning = ''
  // 已经推过 tool-start 的调用 id：updates 里同一轮可能重复出现，只推一次
  const announcedTools = new Set<string>()

  // 界面回推自己的消息
  emit({ type: 'turn-start', conversationId, message: toChatMessage(userMessage) })
  // 声明agent开始调用
  emit({ type: 'assistant-start', conversationId })

  try {
    // 两种流一起开：messages 给逐字的正文增量；updates 给每个节点的完整产出——
    // 工具调用与结果只有 updates 里是完整的（流里的 tool_call_chunks 是分片 JSON）
    const stream = await graph.stream(
      { messages: [userMessage] },
      { ...config, streamMode: ['messages', 'updates'], recursionLimit: Infinity }
    )

    for await (const item of stream) {
      // 数组 streamMode 下，每一项是 [模式名, 负载]
      const [mode, payload] = item as unknown as [string, unknown]

      debugContent(mode, mode === 'messages' ? payload[0] : payload)

      if (mode === 'updates') {
        emitToolEvents(payload)
        continue
      }
      if (mode !== 'messages') continue

      const [messageChunk] = payload as [BaseMessage | undefined, unknown]
      if (messageChunk === undefined) continue
      // 工具结果也会从 messages 流里冒出来（role 是 tool）。它的内容已经由 tool-end
      // 事件推给界面了，这里再当正文拼一遍，就会先显示一段未格式化的原文、
      // 收尾时又被工具块替换掉——同一份内容出现两次
      if (messageChunk.getType() === 'tool') continue
      // 「插入」的消息也会作为完整消息从流里冒出来，界面那边 main 已经单独推过一条；
      // 这里再当正文拼一遍，会把用户的话塞进助手气泡
      if (messageChunk.getType() === 'human') continue

      // 获取思考内容和返回值
      const think = parseReasoning(messageChunk)
      const delta = parseContent(messageChunk.content)

      // 组装输出
      reasoning += think
      reply += delta

      // console.debug('\n======\n思考:', reasoning, '\n内容:', reply)
      // 界面回推：思考和正文分开推，界面才能一边流式显示思考、一边排正文。
      // 下面两处「测试用」的等待：觉得流式太快就解开注释（毫秒数自己调），不用就注释着
      if (think !== '') {
        emit({ type: 'reasoning-delta', conversationId, text: think })
      }
      if (delta !== '') {
        emit({ type: 'assistant-delta', conversationId, text: delta })
      }
      await new Promise((resolve) => setTimeout(resolve, 15))
    }

    // 流结束但用户已点停止：节点没跑完，checkpoint 里没有这条，要手动补 aborted
    if (isAborted()) {
      await emitAborted()
      return
    }

    // 从checkpoint取出输出内容,这里拿到的输出必定是最终的输出
    const after = await graph.getState({ configurable: config.configurable })
    const produced = (after.values?.messages ?? []) as BaseMessage[]
    // 这一轮新增的消息：带工具调用时是好几条（AI 要工具 → tool 结果 → AI 正文），
    // 界面上一次调用只该占一行，所以合并成一条气泡再推。
    // 中途插入过消息的话，界面里前面几段已经各自收尾了，这里只合并最后一段
    const merged = toMergedAssistantView(produced.slice(segmentStart(produced)))
    // 兜底：图没落 checkpoint 时用流里攒的正文自己拼一条
    const fallback = new AIMessage({
      content: reply,
      id: randomUUID(),
      additional_kwargs: reasoning === '' ? {} : { reasoning_content: reasoning }
    })
    const lastMessage = produced[produced.length - 1] ?? fallback
    // 界面回推
    emit({
      type: 'assistant-end',
      conversationId,
      message: merged ?? toChatMessage(lastMessage)
    })

    // 记录 provider 原样字段：出问题时能直接看出模型到底返回了什么
    debugLog.debugLogStep(lastMessage)
  } catch (err) {
    debugLog.debugLogError(err)
    if (isAborted()) {
      await emitAborted()
      return
    }
    // 真错误：图没写 checkpoint，界面那条占位气泡要收掉，否则一直转
    emit({
      type: 'assistant-end',
      conversationId,
      message: toChatMessage(
        new AIMessage({
          content: [{ type: 'text', text: '' }],
          id: randomUUID(),
          additional_kwargs: {
            status: 'error',
            error_message: err instanceof Error ? err.message : String(err)
          }
        })
      )
    })
    throw err
  } finally {
    // 整轮结束后把原始输出写入log文件
    await debugLog.debugLogFlush()
  }

  /** 「最后一段」在 produced 里的起点：最后一次插入之后；没插入过就是本轮开头 */
  function segmentStart(produced: BaseMessage[]): number {
    const lastInsert = inserted[inserted.length - 1]
    if (lastInsert === undefined) return history.length
    const at = produced.findIndex((message) => message.id === lastInsert.id)
    return at === -1 ? history.length : at + 1
  }

  /** 从 updates 流里挑出「模型要调工具」和「工具跑完了」，推给界面 */
  function emitToolEvents(updates: unknown): void {
    if (updates === null || typeof updates !== 'object') return

    for (const nodeUpdate of Object.values(updates as Record<string, unknown>)) {
      if (nodeUpdate === null || typeof nodeUpdate !== 'object') continue
      const produced = (nodeUpdate as { messages?: BaseMessage[] }).messages
      if (!Array.isArray(produced)) continue

      for (const message of produced) {
        // 模型这一轮要求调哪些工具
        for (const call of (message as AIMessage).tool_calls ?? []) {
          if (call.id === undefined || announcedTools.has(call.id)) continue
          announcedTools.add(call.id)
          emit({
            type: 'tool-start',
            conversationId,
            id: call.id,
            name: call.name,
            args: call.args
          })
        }

        // 工具跑完：ToolNode 把结果作为一条 tool 消息追加进 state
        if (message.getType() === 'tool') {
          const toolMessage = message as ToolMessage
          emit({
            type: 'tool-end',
            conversationId,
            id: toolMessage.tool_call_id,
            name: toolMessage.name ?? 'tool',
            result: parseContent(toolMessage.content),
            status: toolMessage.status === 'error' ? 'error' : 'done'
          })
        }
      }
    }
  }

  // 中断事件处理
  async function emitAborted(): Promise<void> {
    // 中断时节点还没跑完，state 里没有这条 assistant——手动补一条带半截内容的
    const aborted = new AIMessage({
      content: reply,
      additional_kwargs: { status: 'aborted', reasoning_content: reasoning }
    })
    // 已经点过「插入」、界面也显示出来了、图却还没跑到那一步的消息：一并补进 checkpoint，
    // 否则刷新一下它们就从对话里消失了。它们仍是插入，所以照样带 insertFlag
    const stragglers = (takeInserts?.() ?? []).map(
      (item) =>
        new HumanMessage({
          content: item.text,
          id: item.id,
          additional_kwargs: { insertFlag: true }
        })
    )
    try {
      // 注意只传 configurable：config.signal 此刻已经是 aborted 的状态，
      // 带着它 writeState 会立刻被 Runnable 层拒掉，半截内容就丢了
      await graph.updateState(
        { configurable: config.configurable },
        { messages: [aborted, ...stragglers] }
      )
    } catch (err) {
      console.error('[loop] 写入 aborted 消息失败:', err instanceof Error ? err.message : err)
    }
    emit({ type: 'assistant-end', conversationId, message: toChatMessage(aborted) })
  }
}
