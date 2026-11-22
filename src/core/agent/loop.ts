import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import type { BaseMessage, ToolMessage } from '@langchain/core/messages'
import { parseContent, parseReasoning } from '@core/utils/parseStream'
import { createDebugLog } from '@core/utils/log'
import { getConversationTitle } from '../utils/title'
import { MessageEventSend } from '@shared/types/newMessageService'
import { AgentEvent } from '@shared/types/newEvent'
import init from './init'
import createEmitter from './emitter'
import { MessageUsage } from '@shared/types/newMessages'

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
}
export async function sendMessage({
  conversationId,
  message,
  messageId,
  emit,
  signal
}: Props): Promise<void> {
  // 初始化依赖数据
  const { model, loopConfig, isAborted, historyMessage, userMessage } = await init({
    conversationId,
    signal,
    message,
    messageId
  })
  // 注册事件机
  const emitter = createEmitter(emit, conversationId)
  // 初始化标题
  getConversationTitle(historyMessage.length === 0, conversationId, userMessage, emit)
  // 初始化调试日志
  const debugLog = createDebugLog(conversationId)
  // 启动轮
  emitter.turnStart(messageId, message)

  /** ====================  巴拉巴拉一大堆,不知道干啥用,回头整理  ==================== */
  // 当前这次模型调用的 id（= chunk.id）：给块定位，也用来判断「换调用了」
  let callId: string | undefined
  /** 这次调用的用量：只在收尾 chunk 上有，攒着给 assistant-end */
  let callUsage: MessageUsage | undefined
  /** 本次调用已流出的内容：只给「中断补写」用，换调用时清空 */
  let reply = ''
  let reasoning = ''
  /** 本次调用是否已经开过思考块 / 正文块 */
  let reasoningStarted = false
  let assistantStarted = false
  /** 已经发过 tool-args 的调用 id（messages 流和 updates 里可能各出现一次） */
  const toolArgsSent = new Set<string>()
  /** 已经落进 checkpoint 的调用 id（updates 里出现过完整 AIMessage） */
  const savedCalls = new Set<string>()

  try {
    // messages:流式数据(token) updates:每一步产生的节点
    // 这样不仅能拿到流数据,数据成块后也能拿到
    const stream = await model.stream(
      { messages: [userMessage] },
      { ...loopConfig, streamMode: ['messages', 'updates'], recursionLimit: Infinity }
    )
    for await (const item of stream) {
      // 数组streamMode下,每一项是[模式名,负载]
      const [mode, payload] = item as unknown as [string, unknown]
      // updates 节点(一个消息节点,例如AIMessage,ToolMessage,HumanMessage)
      if (mode === 'updates') {
        emitToolEvents(payload)
        continue
      }
      // messages 消息流
      if (mode === 'messages') {
        emitMessageEvent(payload)
        continue
      }
    }
    // 流走完：收起最后一次调用
    // 还有没落盘的调用吗？有的话它的半截内容只存在内存里
    const pendingAfterStream = callId !== undefined && !savedCalls.has(callId)
    closeCall()
    // 流结束但用户已点停止
    if (isAborted()) {
      await emitAborted(pendingAfterStream)
      return
    }
    // 结束本轮
    emitter.turnEnd(messageId, 'done')
  } catch (err) {
    debugLog.debugLogError(err)
    // 中断时这次调用还在流式输出、且没落盘 → 半截内容只存在内存里，要补写
    const pendingOnAbort = callId !== undefined && !savedCalls.has(callId)
    closeCall()
    // 用户在loop时点击停止导致报错
    if (isAborted()) {
      await emitAborted(pendingOnAbort)
      return
    }
    // 真错误,即非停止错误,可能来源于模型或者其他奇怪的地方
    emitter.blockAdd(messageId, {
      type: 'error',
      id: randomUUID(),
      message: err instanceof Error ? err.message : String(err),
      source: 'model'
    })
    // 结束本轮
    emitter.turnEnd(messageId, 'done')
    throw err
  } finally {
    await debugLog.debugLogFlush()
  }
  /**
   * 中断事件处理
   *
   * 内容已经落进 checkpoint 时（比如中断发生在工具执行期间），只补一条空消息打上
   * aborted 标记。再把手里的 reply / reasoning 写一遍，历史里就会出现两份一模一样的
   * 思考和正文——那些内容 checkpoint 里已经有了
   */
  async function emitAborted(pending: boolean): Promise<void> {
    const aborted = new AIMessage({
      content: pending ? reply : '',
      additional_kwargs: {
        status: 'aborted',
        ...(pending && reasoning !== '' ? { reasoning_content: reasoning } : {})
      }
    })
    try {
      // 把中断信息写入到checkpoint
      await model.updateState({ configurable: loopConfig.configurable }, { messages: [aborted] })
    } catch (err) {
      console.error('[loop] 写入 aborted 消息失败:', err instanceof Error ? err.message : err)
    }
    emitter.turnEnd(messageId, 'aborted')
  }

  /** ====================  巴拉巴拉一大堆,不知道干啥用,回头整理  ==================== */
  // 流式数据处理
  function emitMessageEvent(payload: unknown): void {
    const [messageChunk] = payload as [BaseMessage | undefined, unknown]
    if (messageChunk === undefined) return
    if (messageChunk.type === 'tool') return

    // chunk.id 变了 = 换了一次模型调用：先把上一次的块收尾，再从这次重新开始
    if (messageChunk.id !== undefined && messageChunk.id !== callId) {
      closeCall()
      callId = messageChunk.id
      reply = ''
      reasoning = ''
    }

    const think = parseReasoning(messageChunk)
    const delta = parseContent(messageChunk.content)

    reasoning += think
    reply += delta

    // 用量只在收尾 chunk 上出现，先攒着，等这块收尾时带给 assistant-end
    const usage = (messageChunk as AIMessage).usage_metadata
    if (usage !== undefined) {
      callUsage = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.input_token_details?.cache_read ?? 0,
        cacheWriteTokens: usage.input_token_details?.cache_creation ?? 0,
        totalTokens: usage.total_tokens
      }
    }

    if (callId === undefined) return

    if (think !== '') {
      if (!reasoningStarted) {
        emitter.reasoningStart(messageId, callId)
        reasoningStarted = true
      }
      emitter.reasoningDelta(messageId, callId, think)
    }

    if (delta !== '') {
      if (!assistantStarted) {
        // 正文来了：思考先收尾，前端会把思考并进助手块
        if (reasoningStarted) emitter.reasoningEnd(messageId, callId)
        emitter.assistantStart(messageId, callId)
        assistantStarted = true
      }
      emitter.assistantDelta(messageId, callId, delta)
    }
  }

  /** 收掉当前这次模型调用开的块 */
  function closeCall(): void {
    if (callId === undefined) return
    if (assistantStarted) {
      emitter.assistantEnd(messageId, callId, callUsage)
    } else if (reasoningStarted) {
      emitter.reasoningEnd(messageId, callId)
    }
    callId = undefined
    callUsage = undefined
    reasoningStarted = false
    assistantStarted = false
  }

  /** 从 updates 流里挑出「模型要调工具」和「工具跑完了」，推给界面 */
  function emitToolEvents(updates: unknown): void {
    if (updates === null || typeof updates !== 'object') return

    for (const nodeUpdate of Object.values(updates as Record<string, unknown>)) {
      if (nodeUpdate === null || typeof nodeUpdate !== 'object') continue
      const produced = (nodeUpdate as { messages?: BaseMessage[] }).messages
      if (!Array.isArray(produced)) continue

      for (const message of produced) {
        // 这次调用的完整消息出现了 = 它的内容已经落盘，中断时不用再补写一遍
        if (message.type === 'ai' && message.id !== undefined) savedCalls.add(message.id)
        // 模型这一轮要求调哪些工具。参数只有这里才是完整对象，分片拼不出来
        const toolCalls = (message as AIMessage).tool_calls ?? []
        if (toolCalls.length > 0) {
          // 模型决定调工具 = 这次模型调用已经说完，正文/思考块先收尾
          closeCall()
        }
        for (const call of toolCalls) {
          if (call.id === undefined) continue
          emitter.toolStart(messageId, call.id, call.name)
          if (toolArgsSent.has(call.id)) continue
          toolArgsSent.add(call.id)
          emitter.toolArgs(
            messageId,
            call.id,
            (call.args ?? null) as Record<string, unknown> | null
          )
        }

        // 工具跑完：ToolNode 把结果作为一条 tool 消息追加进 state
        if (message.type === 'tool') {
          const toolMessage = message as ToolMessage
          emitter.toolEnd(
            messageId,
            toolMessage.tool_call_id ?? '',
            toolMessage.status === 'error' ? 'error' : 'done',
            parseContent(toolMessage.content)
          )
        }
      }
    }
  }
}
