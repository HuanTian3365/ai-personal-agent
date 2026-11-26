import { ChatGraph, getChatGraph, toRunnableConfig } from '@core/graph/chat'
import buildHumanMessage from '@core/message/buildHumanMessage'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { MessageUsage } from '@shared/types/message'
import type { MessageEventSend } from '@shared/types/message'
import { BaseMessage, HumanMessage } from 'langchain'

interface InitProps {
  /** 会话ID */
  conversationId: string
  /** 发送的消息 */
  message: MessageEventSend
  /** 消息ID,main侧生成 */
  messageId: string
  /** 是否中断 */
  signal?: AbortSignal
}
export interface InitResult {
  /** 模型实例 */
  model: ChatGraph
  /** 本轮运行时配置 */
  loopConfig: LangGraphRunnableConfig
  /** 用户是否中断了对话 */
  isAborted: () => boolean
  /** 历史消息 */
  historyMessage: BaseMessage[]
  /** 用户消息 */
  userMessage: HumanMessage
}
/**
 * 初始化函数,这里负责把loop需要的参数一次性提供出来,这里不做逻辑处理,只负责产出数据
 */
export async function init({
  conversationId,
  signal,
  message,
  messageId
}: InitProps): Promise<InitResult> {
  /** ====================  初始化模型  ==================== */
  const model = getChatGraph()
  /** ====================  本轮运行时配置  ==================== */
  const loopConfig = toRunnableConfig({ threadId: conversationId, signal })
  /** ====================  用户是否中断了对话  ==================== */
  const isAborted = (): boolean => signal?.aborted === true
  /** ====================  历史消息  ==================== */
  const historyMessage = (await model.getState(loopConfig)).values?.messages ?? []
  /** ====================  用户消息  ==================== */
  const userMessage = buildHumanMessage(message, messageId)
  return {
    model,
    loopConfig,
    isAborted,
    historyMessage,
    userMessage
  }
}

export interface BlockState {
  /** 当前消息id */
  id: string | undefined
  /** 当前消息是否正在思考 */
  isReasoning: boolean
  /** 当前消息是否正在回复 */
  isAssistant: boolean
  /** 正在思考的内容 */
  reasoning: string
  /** 正在回复的文本 */
  replying: string
}
export function initBlockState(): BlockState {
  return {
    id: undefined,
    isReasoning: false,
    isAssistant: false,
    reasoning: '',
    replying: ''
  }
}
/** 空用量 | 一轮一个 不跟块状态走 */
export function initUsage(): MessageUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0
  }
}
