/**
 * 图节点实现 | 一个节点就是「读state > 干活 > 返回增量」
 *
 * 现在只有model一个 | 工具节点直接用LangGraph预置的ToolNode 在图那边挂上(见chat.ts)
 * 图怎么连 单例 运行时配置都在chat.ts | 这里只管单个节点里干什么
 */
import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { getModelWithTools } from '@core/llm/model'
import { ChatState } from './state'

/** 一条等着插进当前轮的用户输入(界面上的「插队」) */
export interface InsertInput {
  /** 消息id: 界面那张气泡和落库后的那条用同一个 */
  id: string
  text: string
}

/**
 * 一轮的插入来源 | main每轮开始注册 结束注销
 *
 * 三个回调都不碰队列本体: core只知道「取」「放回」「还有没有」 不知道队列长什么样
 */
export interface InsertSource {
  /** 取走这一刻待插入的消息 | 取走后不再参与续轮判断 */
  take: () => InsertInput[]
  /** 本轮失败或中断 把刚取走的放回待领取 */
  release: () => void
  /** 还有没有未领取的 | 条件边用它决定本轮要不要继续 */
  hasUnclaimed: () => boolean
}

/**
 * 会话 > 插入来源
 *
 * 不塞进config.configurable: 那一层会跟着checkpoint一起写库 函数不是能序列化的东西
 * main每轮开始注册 结束注销 节点按thread_id反查
 */
const insertSources = new Map<string, InsertSource>()

/** 注册一轮的插入来源 返回注销函数 */
export function setInsertSource(threadId: string, source: InsertSource): () => void {
  insertSources.set(threadId, source)
  return (): void => {
    if (insertSources.get(threadId) === source) insertSources.delete(threadId)
  }
}

/** 按thread_id取插入来源 | 节点与条件边共用 */
export function getInsertSource(threadId: string): InsertSource | undefined {
  return insertSources.get(threadId)
}

/** 从运行时配置里取会话id | 没有返回null */
export function threadIdOf(config: LangGraphRunnableConfig): string | null {
  const threadId = config.configurable?.thread_id
  return typeof threadId === 'string' ? threadId : null
}

/**
 * model节点 | 调一次模型 把结果作为state增量交回去
 *
 * 模型那一轮如果返回了tool_calls 图会接着走tools节点(条件边判断在chat.ts)
 * 工具结果作为ToolMessage追加进messages 再回到这里让它接着说
 *
 * 节点里必须把config传给模型: token级的流靠config里的callback冒泡上来
 * 不传的话streamMode:'messages'收不到任何delta
 */
export async function callModel(
  state: typeof ChatState.State,
  config: LangGraphRunnableConfig
): Promise<{ messages: BaseMessage[] }> {
  const model = await getModelWithTools()
  // 每一步开头先看有没有「插队」的消息 它们要成为这一步的输入
  // 已经生成到一半的那段文字不会被改写 插队只能等这个边界(和DSH的step边界是同一种语义)
  // 只有在这里(真的被本轮领取)才打insertFlag: 它跟消息一起落进hy_custom
  // 重开对话时投影还认得出「这是插进来的」
  const threadId = threadIdOf(config)
  const source = threadId === null ? undefined : getInsertSource(threadId)
  const inserts = (source?.take() ?? []).map((item) => {
    const message = new HumanMessage({ content: item.text, id: item.id })
    // 插入标记是业务字段 走hy_custom 不塞additional_kwargs
    message.HYEMessageCustom = { insertFlag: true }
    return message
  })
  const messages = inserts.length === 0 ? state.messages : [...state.messages, ...inserts]
  let response: BaseMessage
  try {
    response = await model.invoke(messages, config)
  } catch (error: unknown) {
    // 这一步没跑成 把刚领走的插队消息放回 否则它们既不在队列里也没落库
    if (inserts.length > 0) source?.release()
    throw error
  }
  // 插队消息跟着响应一起返回 reducer会把它们按顺序追加进messages
  // 这样它们是真的落在checkpoint里 重开对话照样看得到
  return { messages: [...inserts, response] }
}
