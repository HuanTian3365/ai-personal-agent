import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { getModelWithTools } from '@core/llm/model'
import { tools } from '../tools'
import { ChatState } from './state'
import { getCheckpointStore } from './saver'

/** 一条等着插进当前轮的用户输入（界面上的「插入」） */
export interface InsertInput {
  /** 消息 id：main 生成，界面那张气泡和落库后的那条用同一个 */
  id: string
  text: string
}

/**
 * 会话 → 取插入消息的函数。
 *
 * 不塞进 `config.configurable`：那一层会跟着 checkpoint 一起写库，函数不是能序列化的东西。
 * main 每轮开始注册、结束注销，节点按 thread_id 反查。
 */
const insertSources = new Map<string, () => InsertInput[]>()

/** 注册一轮的插入消息来源，返回注销函数 */
export function setInsertSource(threadId: string, take: () => InsertInput[]): () => void {
  insertSources.set(threadId, take)
  return (): void => {
    if (insertSources.get(threadId) === take) insertSources.delete(threadId)
  }
}

/** 节点里把这一刻待插入的消息取走（取走即从队里删掉） */
function takeInserts(config: LangGraphRunnableConfig): InsertInput[] {
  const threadId = config.configurable?.thread_id
  if (typeof threadId !== 'string') return []
  return insertSources.get(threadId)?.() ?? []
}

/**
 * 对话图：`START → model → (要调工具？tools → model : END)`。
 *
 * 模型那一轮如果返回了 tool_calls，就走 tools 节点真的把工具跑掉，
 * 结果作为 ToolMessage 追加进 messages，再回到 model 让它接着说话。
 * 工具消息一样落在 checkpoint 里，所以「回退到某一步重新生成」对它同样成立。
 *
 * 节点里必须把 config 传给模型：token 级的流是靠 config 里的 callback 冒泡上来的，
 * 不传的话 `streamMode: 'messages'` 收不到任何 delta。
 */
async function callModel(
  state: typeof ChatState.State,
  config: LangGraphRunnableConfig
): Promise<{ messages: BaseMessage[] }> {
  const model = await getModelWithTools()
  // 每一步开头先看有没有「插入」的消息：它们要成为这一步的输入。
  // 已经生成到一半的那段文字不会被改写，插入只能等这个边界——和 DSH 的 step 边界是同一种语义。
  // 只有在这里（真的被本轮领取）才写 `insertFlag`：它跟消息一起落进 checkpoint，
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
  // 不覆盖 response.id：LangGraph 的 messages 流靠 message.id 判断「这条是不是已经推过」，
  // 换掉它会让末尾那条完整消息失去去重依据，被当成新消息再推一遍
  const response = await model.invoke(messages, config)
  // 插入的消息跟着响应一起返回，reducer 会把它们按顺序追加进 messages：
  // 这样它们是真的落在 checkpoint 里，重开对话照样看得到
  return { messages: [...inserts, response] }
}

// 返回类型由 StateGraph 的泛型递归推导（节点名会进类型参数），手写一遍不现实
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createChatGraph() {
  return (
    new StateGraph(ChatState)
      .addNode('model', callModel)
      .addNode('tools', new ToolNode(tools))
      .addEdge(START, 'model')
      // toolsCondition 看最后一条消息里有没有 tool_calls：有就去跑工具，没有就收尾
      .addConditionalEdges('model', toolsCondition, ['tools', END])
      .addEdge('tools', 'model')
      .compile({ checkpointer: getCheckpointStore() })
  )
}

/** 编译后的对话图类型 */
export type ChatGraph = ReturnType<typeof createChatGraph>

let compiled: ChatGraph | null = null

/** 取编译好的对话图（单例）。必须先把 checkpointer 打开 */
export function getChatGraph(): ChatGraph {
  if (compiled === null) compiled = createChatGraph()
  return compiled
}

/** 每轮调用时传给 graph 的配置 */
export interface TurnConfig {
  /** 会话 id，即 checkpointer 的 thread_id */
  threadId: string
  /** 中断信号，透传给模型请求 */
  signal?: AbortSignal
}

/** 把 TurnConfig 翻译成 LangGraph 的 RunnableConfig */ export function toRunnableConfig(
  turn: TurnConfig
): LangGraphRunnableConfig {
  return {
    configurable: {
      thread_id: turn.threadId
    },
    signal: turn.signal
  }
}
