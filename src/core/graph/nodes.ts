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

/** 一条等着插进当前轮的用户输入(界面上的「插入」) */
export interface InsertInput {
  /** 消息id: main生成 界面那张气泡和落库后的那条用同一个 */
  id: string
  text: string
}

/**
 * 会话 > 取插入消息的函数
 *
 * 不塞进config.configurable: 那一层会跟着checkpoint一起写库 函数不是能序列化的东西
 * main每轮开始注册 结束注销 节点按thread_id反查
 */
const insertSources = new Map<string, () => InsertInput[]>()

/** 注册一轮的插入消息来源 返回注销函数 */
export function setInsertSource(threadId: string, take: () => InsertInput[]): () => void {
  insertSources.set(threadId, take)
  return (): void => {
    if (insertSources.get(threadId) === take) insertSources.delete(threadId)
  }
}

/** 节点里把这一刻待插入的消息取走(取走即从队里删掉) */
function takeInserts(config: LangGraphRunnableConfig): InsertInput[] {
  const threadId = config.configurable?.thread_id
  if (typeof threadId !== 'string') return []
  return insertSources.get(threadId)?.() ?? []
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
  // 每一步开头先看有没有「插入」的消息 它们要成为这一步的输入
  // 已经生成到一半的那段文字不会被改写 插入只能等这个边界(和DSH的step边界是同一种语义)
  // 只有在这里(真的被本轮领取)才写insertFlag: 它跟消息一起落进checkpoint
  // 重开对话时投影还认得出「这是插入的」
  const inserts = takeInserts(config).map(
    (item) =>
      new HumanMessage({
        content: item.text,
        id: item.id,
        additional_kwargs: { insertFlag: true }
      })
  )
  const messages = inserts.length === 0 ? state.messages : [...state.messages, ...inserts]
  // 不覆盖response.id: LangGraph的messages流靠message.id判断「这条是不是已经推过」
  // 换掉它会让末尾那条完整消息失去去重依据 被当成新消息再推一遍
  const response = await model.invoke(messages, config)
  // 插入的消息跟着响应一起返回 reducer会把它们按顺序追加进messages
  // 这样它们是真的落在checkpoint里 重开对话照样看得到
  return { messages: [...inserts, response] }
}
