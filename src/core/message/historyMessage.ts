import type { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
import { getChatGraph } from '@core/graph/chat'
import type { ContentBlock, MTool, TurnMessage } from '@shared/types/message'
import { parseContent, parseReasoning } from './parseStream'
import { debugContent } from '@main/utils/debug'

/** 读一个会话的全部历史消息 */
export async function getHistoryMessage(conversationId: string): Promise<TurnMessage[]> {
  const graph = getChatGraph()
  // 根据会话ID获取最新快照
  const snapshot = await graph.getState({ configurable: { thread_id: conversationId } })
  // 读取快照消息
  const messages = snapshot.values?.messages ?? []
  return parseLangChainMessage(messages)
}

/**
 * 将checkpoint的消息转成界面消息
 *
 * 规则:一条非插入的用户消息开一轮,插入的用户消息.思考.工具.正文都归进当前轮
 *
 * 按顺序落在items里,工具结果不单独成块,按tool_call_id填回对应调用
 */
function parseLangChainMessage(messages: BaseMessage[]): TurnMessage[] {
  /** 所有轮消息 */
  const result: TurnMessage[] = []
  /** 获取当前轮(最新轮) */
  const currentTurn = (): TurnMessage | undefined => result[result.length - 1]

  messages.forEach((msg, index) => {
    debugContent(msg)
    const id = msg.id ?? `msg-${index}`
    /** ====================  用户消息|插入消息  ==================== */
    if (msg.type === 'human') {
      const insertFlag = msg.hyCustom?.insertFlag === true
      insertTurn({
        id,
        type: 'user',
        content: parseContent(msg.content),
        // 只有插入才带expandInfo,普通发起不带
        ...(insertFlag ? { expandInfo: { insertFlag: true } } : {})
      })
      return
    }
    /** ====================  助手消息|思考内容  ==================== */
    if (msg.type === 'ai') {
      const ai = msg as AIMessage
      const text = parseContent(msg.content)
      const reasoning = parseReasoning(msg)
      const toolCalls = ai.tool_calls ?? []
      // 会话是否被中断,中断的话视为此轮被中断
      const aborted = msg.hyCustom?.aborted === true
      if (aborted) {
        const turn = currentTurn()
        if (turn !== undefined) turn.status = 'aborted'
      }

      if (text !== '') {
        insertTurn({
          id,
          type: 'assistant',
          content: text,
          // 没有思考就不带这个字段
          ...(reasoning === ''
            ? {}
            : { reasoning: { id, type: 'reasoning', content: reasoning, status: 'done' } })
        })
      } else if (reasoning !== '') {
        // 有思考,没正文,思考单独成块
        insertTurn({ id, type: 'reasoning', content: reasoning, status: 'done' })
      } else if (!aborted && toolCalls.length === 0) {
        // 空响应:既没正文也没思考也没工具调用,兜底成错误块
        // 被中断的那条正常就是空的,不算错误
        insertTurn({
          id,
          type: 'error',
          message: '这条消息没有内容（既没正文、也没思考、也没工具调用）。',
          source: 'model'
        })
      }

      // 处理ai发起的工具调用,每个发起调用作为一个工具块,工具结果按id回填
      toolCalls.forEach((call, callIndex) => {
        insertTurn({
          id: call.id || `tool-${index}-${callIndex}`,
          type: 'tool',
          name: call.name,
          // 模型不提供这次调用的说明，先留空
          description: '',
          args: (call.args ?? null) as Record<string, unknown> | null,
          result: null,
          // 结果还没回填,先记成正在跑;ToolMessage 到了再改成 done / error
          status: 'running'
        } as MTool)
      })
      return
    }

    /** ====================  工具结果:按tool_call_id填回对应的块  ==================== */
    if (msg.type === 'tool') {
      const toolMessage = msg as ToolMessage
      const target = findToolBlock(toolMessage.tool_call_id)
      if (target !== undefined) {
        target.result = parseContent(toolMessage.content)
        target.status = toolMessage.status === 'error' ? 'error' : 'done'
      }
      return
    }

    /** ====================  系统内容  ==================== */
    if (msg.type === 'system') {
      insertTurn({ id, type: 'system', content: parseContent(msg.content) })
      return
    }

    /** ====================  未知消息  ==================== */
    insertTurn({ id, type: 'unknown', rawType: 'BaseMessage', raw: msg })
  })

  // 最后一轮也要收尾
  finalizeCurrentTurn()

  return result

  /**
   * 结束当前轮
   *
   * 没等到结果的工具块说明工具没跑完就断了(比如中断),标成 error,
   * 别让历史里显示成「已完成、结果为空」
   */
  function finalizeCurrentTurn(): void {
    const turn = currentTurn()
    if (turn === undefined) return
    for (const item of turn.items) {
      if (item.type === 'tool' && item.status === 'running') item.status = 'error'
    }
  }

  /**
   * 根据ID寻找工具块,用于工具结果回填
   */
  function findToolBlock(toolCallId: string): MTool | undefined {
    for (let i = result.length - 1; i >= 0; i -= 1) {
      const turn = result[i]
      if (turn === undefined) continue
      for (let j = turn.items.length - 1; j >= 0; j -= 1) {
        const item = turn.items[j]
        if (item !== undefined && item.type === 'tool' && item.id === toolCallId) return item
      }
    }
    return undefined
  }

  /** 轮消息构建 */
  function insertTurn(content: ContentBlock): void {
    // 第一个消息或者一条非插入的用户消息->开新的一轮
    if (
      result.length === 0 ||
      (content.type === 'user' && content.expandInfo?.insertFlag !== true)
    ) {
      // 开新轮之前先把上一轮收尾
      finalizeCurrentTurn()
      result.push({
        id: content.id,
        user: null,
        items: [],
        status: 'done',
        // TODO:累加用量
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0
        },
        // TODO: 未来实现
        startTime: 0,
        endTime: 0
      })
    }
    // 获取当前轮
    const turn = currentTurn()
    if (turn === undefined) return
    // 插入用户消息
    if (content.type === 'user' && content.expandInfo?.insertFlag !== true) {
      turn.user = content
    }
    // 插入ai消息
    else {
      turn.items.push(content)
    }
  }
}
