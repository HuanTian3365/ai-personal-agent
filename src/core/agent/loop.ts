import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import type { BaseMessage, ToolMessage } from '@langchain/core/messages'
import { parseContent, parseReasoning } from '@core/message/parseStream'
import { getConversationTitle } from './title'
import type { MessageEventSend } from '@shared/types/messageService'
import type { AgentEvent } from '@shared/types/agentEvent'
import { init, initBlockState } from './init'
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
  const { model, loopConfig, isAborted, historyMessage, userMessage }: InitResult = await init({
    conversationId,
    signal,
    message,
    messageId
  })
  // 注册事件机
  const emitter = createEmitter(emit, conversationId)
  // 初始化标题
  getConversationTitle(historyMessage.length === 0, conversationId, userMessage, emitter.title)
  // 启动轮
  emitter.turnStart(messageId, message)

  // 当前消息信息 | 换调用时整体替换成新状态
  // id=轮中消息的ID(不是轮ID) usage=只在收尾块上出现 攒着给assistant-end
  // reasoning/replying=已流出内容 服务于emitAborted回填 只在换调用时清
  let blockState: BlockState = initBlockState()

  /** 当前正在调用的工具id */
  const toolArgsSent = new Set<string>()
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
    emitter.turnEnd(messageId, 'done', blockState.usage)
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
    emitter.turnEnd(messageId, 'done', blockState.usage)
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
    aborted.hyCustom = { aborted: true }
    try {
      // 把中断信息写入到消息表
      await model.updateState({ configurable: loopConfig.configurable }, { messages: [aborted] })
    } catch (err) {
      console.error('[loop] 写入 aborted 消息失败:', err instanceof Error ? err.message : err)
    }
    emitter.turnEnd(messageId, 'aborted', blockState.usage)
  }

  /** 清除当前消息状态,发它对应的end事件 */
  function closeBlock(): void {
    const { id } = blockState
    if (id === undefined) return
    // 如果有正文消息,触发assistant-end事件
    if (blockState.isAssistant) {
      emitter.assistantEnd(messageId, id)
    }
    // 如果有思考消息,触发reasoning-end事件
    else if (blockState.isReasoning) {
      emitter.reasoningEnd(messageId, id)
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
      // 如果存在思考状态,则关闭思考状态,然后开启内容状态
      if (!blockState.isAssistant) {
        if (blockState.isReasoning) emitter.reasoningEnd(messageId, blockId)
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
          if (!savedBlocks.has(block.id)) addUsage((block as AIMessage).usage_metadata)
          savedBlocks.add(block.id)
        }

        // 判断是否跟工具相关并作出行动
        emeToolAction(block)
      }
    }

    /** 累加一次模型调用的用量 | 只用 usage_metadata */
    function addUsage(usage: AIMessage['usage_metadata']): void {
      if (usage === undefined) return
      const details = usage.input_token_details
      blockState.usage = {
        inputTokens: blockState.usage.inputTokens + usage.input_tokens,
        outputTokens: blockState.usage.outputTokens + usage.output_tokens,
        cacheReadTokens: blockState.usage.cacheReadTokens + (details?.cache_read ?? 0),
        cacheWriteTokens: blockState.usage.cacheWriteTokens + (details?.cache_creation ?? 0),
        totalTokens: blockState.usage.totalTokens + usage.total_tokens
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
