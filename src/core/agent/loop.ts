import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import { ChatMessage } from '@langchain/core/messages'
import { ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { parseContent, parseReasoning } from '@core/message/parseStream'
import { addUsage } from '@core/utils/usage'
import { getConversationTitle } from './title'
import type { MessageEventSend } from '@shared/types/message'
import type { AgentEvent } from '@shared/types/agentEvent'
import type { MessageUsage } from '@shared/types/message'
import { init, initBlockState, initUsage } from './init'
import type { BlockState, InitResult } from './init'
import createEmitter from './emitter'

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
  /** ====================  初始化  ==================== */
  // 初始化依赖数据
  const { model, loopConfig, isAborted, userMessage }: InitResult = await init({
    conversationId,
    signal,
    message,
    messageId
  })
  // 注册事件机
  const emitter = createEmitter(emit, conversationId)
  // 生成标题 | 判据由它自己读库里的 title 是否为空,不看有没有历史
  getConversationTitle(conversationId, userMessage, emitter.title)
  // 启动轮
  emitter.turnStart(messageId, message)

  // 当前消息信息 | 换调用时整体替换成新状态
  // id=轮中消息的ID(不是轮ID) reasoning/replying=已流出内容 服务于emitAborted回填 只在换调用时清
  let blockState: BlockState = initBlockState()
  // 本轮用量 | 一次模型调用累加一次 不跟块状态走 否则换调用时会被清掉
  let turnUsage: MessageUsage = initUsage()

  /** 当前正在调用ToolMessage的id(发起调用) */
  const toolArgsSent = new Set<string>()
  /** 当前已经收到ToolMessage的id(调用完成) */
  const toolResults = new Set<string>()
  /** 已经落到checkpoint的消息id */
  const savedBlocks = new Set<string>()

  /** ====================  循环轮  ==================== */
  try {
    // 两种模式,messages:流式数据块,updates:流式完成后组成的消息
    // 前者拼出正文与思考,后者才拿得到完整的tool_calls与工具结果
    const stream = await model.stream(
      { messages: [userMessage] },
      { ...loopConfig, streamMode: ['messages', 'updates'], recursionLimit: Infinity }
    )
    for await (const item of stream) {
      // 数组streamMode下,每一项是[模式名,负载]
      const [mode, payload] = item as unknown as [string, unknown]

      // messages:流式数据处理
      if (mode === 'messages') {
        emitBlockEvent(payload)
        continue
      }
      // updates:消息处理
      if (mode === 'updates') {
        emitMessageEvent(payload)
        continue
      }
    }

    // 存在正在输出的消息且它还没落地 | 必须在closeBlock前算 closeBlock会清掉id
    const pending = blockState.id !== undefined && !savedBlocks.has(blockState.id)
    // 清除消息状态,发收尾事件
    closeBlock()
    // 数据走完但用户已点停止
    if (isAborted()) {
      await emitAborted(pending)
      return
    }
    // 结束本轮
    emitter.turnEnd(messageId, 'done', turnUsage)
  } catch (err) {
    // 存在正在输出的消息且它还没落地 | 必须在closeBlock前算 closeBlock会清掉id
    const pending = blockState.id !== undefined && !savedBlocks.has(blockState.id)
    // 清除消息状态,发收尾事件
    closeBlock()
    // 用户在loop时点击停止导致报错
    if (isAborted()) {
      await emitAborted(pending)
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
    emitter.turnEnd(messageId, 'done', turnUsage)
    throw err
  }

  /** ====================  辅助函数  ==================== */

  /**
   * 中断事件处理
   *
   * 内容已经落进checkpoint时(比如中断发生在工具执行期间)只补一条空消息打上aborted标记,防止重复落地
   * 当块还没拼成消息就中断时,checkpoint没有落当前进度(它只在块拼成完整消息时才落 这里只是拼到一半的消息),所以这里直接把当前进度给落进去
   *
   * @param pending 中断时这次调用还在流式输出,且没落盘->半截内容只存在内存里,要补写
   */
  async function emitAborted(pending: boolean): Promise<void> {
    const aborted = new AIMessage({
      content: pending ? blockState.replying : '',
      additional_kwargs: {
        // reasoning_content是provider格式 原样留在这里
        ...(pending && blockState.reasoning !== ''
          ? { reasoning_content: blockState.reasoning }
          : {})
      }
    })
    // 中断标记是业务字段 走hy_custom 跟消息一起落进hy_message
    aborted.HYEMessageCustom = { aborted: true }

    // 已经发起,但没等到结果的工具调用各补一条error的ToolMessage
    // 否则checkpoint里会留下孤立的tool_calls下一轮请求会被严格实现的provider拒绝
    const orphans: ToolMessage[] = []
    for (const callId of toolArgsSent) {
      if (toolResults.has(callId)) continue
      orphans.push(
        new ToolMessage({
          tool_call_id: callId,
          content: 'System:用户中断了会话',
          status: 'error'
        })
      )
    }
    // 中断说明走 tips | ChatMessage(role:user) 不占 system 层级 不会覆盖人格
    // 落库后跟 aborted 标记一起进 checkpoint 下一轮模型能看到 界面也投影成 tips 块
    const tips = new ChatMessage({
      id: randomUUID(),
      role: 'user',
      content: '（用户中断了上一轮对话，该条回复的内容不是完整内容）'
    })
    tips.HYEMessageCustom = { tipsIsHide: true }

    try {
      // 顺序必须是 先补齐的 ToolMessage 再 aborted 标记 最后 tips 反过来就对不上了
      await model.updateState(
        { configurable: loopConfig.configurable },
        { messages: [...orphans, aborted, tips] }
      )
    } catch (err) {
      console.error('[loop] 写入 aborted 消息失败:', err instanceof Error ? err.message : err)
    }
    emitter.turnEnd(messageId, 'aborted', turnUsage)
  }

  /** 清除当前消息状态,发它对应的end事件 */
  function closeBlock(): void {
    const { id } = blockState
    if (id === undefined) return
    // 思考与正文是两条线 各自收尾 不互斥
    // 同一条消息可能思考->正文->思考 收尾时两个状态会同时为真
    if (blockState.isReasoning) {
      emitter.reasoningEnd(messageId, id)
    }
    if (blockState.isAssistant) {
      emitter.assistantEnd(messageId, id)
    }
    // 只清块自身的状态 | reasoning/replying要留给emitAborted补写 换调用时才整体替换
    blockState.id = undefined
    blockState.isReasoning = false
    blockState.isAssistant = false
  }

  /**
   * 流式消息处理
   *
   * 这里主要处理思考和内容的流式输出
   */
  function emitBlockEvent(payload: unknown): void {
    // 取出这一条块
    const [messageChunk] = payload as [BaseMessage | undefined, unknown]
    if (messageChunk === undefined) return
    // 排除工具消息,工具链路由updates驱动,这里放进来会误判成新消息而换块
    if (messageChunk.type === 'tool') return
    // 排除插队进来的用户消息(插队消息也会走流): 它在点插队时已经推过一块了
    // 放进来会被当成模型正文 界面上就会把用户的话重复渲染一遍
    if (messageChunk.type === 'human') return

    // 这条块的消息ID与当前不一致时 视为上条消息结束了 整体换新状态
    if (messageChunk.id !== undefined && messageChunk.id !== blockState.id) {
      closeBlock()
      blockState = initBlockState()
      blockState.id = messageChunk.id
    }
    // 当前没有消息直接退出
    const blockId = blockState.id
    if (blockId === undefined) return

    // 获取思考内容
    const think = parseReasoning(messageChunk)
    blockState.reasoning += think
    // 获取正文内容
    const delta = parseContent(messageChunk.content)
    blockState.replying += delta

    // 思考处理
    if (think !== '') {
      // 如果当前为非思考状态,改成思考状态,并发起事件
      if (!blockState.isReasoning) {
        emitter.reasoningStart(messageId, blockId)
        blockState.isReasoning = true
      }
      // 发送思考块内容
      emitter.reasoningDelta(messageId, blockId, think)
    }

    // 内容处理
    if (delta !== '') {
      // 正文出现即关闭思考段 | 同一条消息后面可能再思考 置回false让下一段能重新start
      if (blockState.isReasoning) {
        emitter.reasoningEnd(messageId, blockId)
        blockState.isReasoning = false
      }
      // 如果当前为非内容状态,改成内容状态,并发起事件
      if (!blockState.isAssistant) {
        emitter.assistantStart(messageId, blockId)
        blockState.isAssistant = true
      }
      emitter.assistantDelta(messageId, blockId, delta)
    }
  }

  /**
   * 消息处理
   *
   * 这里主要处理不依赖流式的消息事件
   */
  function emitMessageEvent(updates: unknown): void {
    if (updates === null || typeof updates !== 'object') return

    /**
     * 取本轮新增的消息
     *
     * updates形如 {"<节点名>": {"messages": [...]}} | 节点名是model或tools 也可能会出现其他key
     * 节点名不写死 所以用Object.values取值 得到 [{messages: [...]}]
     * 注意nodeUpdate是节点增量对象 不是消息本身
     * nodeUpdate.messages才是消息数组 数组里每一项才是单条消息
     */
    for (const nodeUpdate of Object.values(updates as Record<string, unknown>)) {
      // 忽略非法内容
      if (nodeUpdate === null || typeof nodeUpdate !== 'object') continue

      // 提取出这次产生的消息(可能是多条:模型一条AIMessage发了3个tool_calls,然后一次返回3条ToolMessage)
      const blocks = (nodeUpdate as { messages?: BaseMessage[] }).messages
      if (!Array.isArray(blocks)) continue

      // 遍历消息列表
      for (const block of blocks) {
        /**
         * block是一条消息 | 可能是AIMessage / AIMessageChunk / ToolMessage / HumanMessage / RemoveMessage
         * 这里按消息类型(type)分派:现在做 记savedBlocks | 收尾正在流的调用 | 发工具start/args/end
         * 以后消息级的活都挂这里:用量统计 模型名与供应商 插入消息 RemoveMessage
         */

        // 标记这次模型调用已经写进checkpoint了,好让中断时判断要不要补写内容
        // 顺带记用量:同一条消息可能重复投递,只在首次见到时加,否则会翻倍
        if (block.type === 'ai' && block.id !== undefined) {
          if (!savedBlocks.has(block.id)) {
            turnUsage = addUsage(turnUsage, (block as AIMessage).usage_metadata)
          }
          savedBlocks.add(block.id)
        }

        // 判断是否跟工具相关并作出行动
        emeToolAction(block)
      }
    }

    /**
     * 工具事件监听
     *
     * 判断这条消息是否为模型发起工具|工具回复,并作出相应回复
     */
    function emeToolAction(block: BaseMessage): void {
      // 获取模型要调用的工具
      const toolCalls = (block as AIMessage).tool_calls ?? []
      // 模型决定调工具=这次模型调用已经说完,正文/思考消息先收尾
      if (toolCalls.length > 0) {
        closeBlock()
      }

      // 获取调用的工具列表
      for (const call of toolCalls) {
        if (call.id === undefined) continue

        // 如果该工具ID已经被记录了,说明工具事件已经发送了,跳过
        if (toolArgsSent.has(call.id)) continue
        // 记录本次调用的工具
        toolArgsSent.add(call.id)

        // 发起工具事件
        emitter.toolStart(messageId, call.id, call.name)
        emitter.toolArgs(messageId, call.id, (call.args ?? null) as Record<string, unknown> | null)
      }

      // 工具跑完发送结束事件
      if (block.type === 'tool') {
        const toolMessage = block as ToolMessage
        const callId = toolMessage.tool_call_id ?? ''
        // 记录这个工具已经运行完成
        if (callId !== '') toolResults.add(callId)
        emitter.toolEnd(
          messageId,
          callId,
          toolMessage.status === 'error' ? 'error' : 'done',
          parseContent(toolMessage.content)
        )
      }
    }
  }
}
