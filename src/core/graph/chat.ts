/**
 * 对话图 | 只讲图长什么样: 有哪些节点 怎么连 编译成单例
 *
 * START > model > (要调工具? tools > model : END)
 * 模型那一轮如果返回了tool_calls 就走tools节点把工具真的跑掉
 * 结果作为ToolMessage追加进messages 再回到model让它接着说话
 * 工具消息一样落在checkpoint里 所以「回退到某一步重新生成」对它同样成立
 *
 * 节点实现在nodes.ts | 图状态在state.ts | checkpointer在checkpoint.ts
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { tools } from '../tools'
import { ChatState } from './state'
import { getCheckpointStore } from './checkpoint'
import { callModel, getInsertSource, threadIdOf } from './nodes'

/**
 * model之后往哪走
 *
 * 有tool_calls -> 跑工具
 * 没有 但还有没被领走的插队消息 -> 回model再跑一步 本轮不结束
 * 都没有 -> 收尾
 *
 * 终止性靠「插队消息一被取走就打上已领取标记」保证: 取完 hasUnclaimed 就是 false
 * 不靠轮次上限 见 docs/开发计划/04.未实现-排队与插队/V1/01.开发.md §3.8
 */
function routeAfterModel(state: typeof ChatState.State, config: LangGraphRunnableConfig): string {
  if (toolsCondition(state) === 'tools') return 'tools'
  const threadId = threadIdOf(config)
  if (threadId !== null && getInsertSource(threadId)?.hasUnclaimed() === true) return 'model'
  return END
}

// 返回类型由StateGraph的泛型递归推导(节点名会进类型参数) 手写一遍不现实
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createChatGraph() {
  return (
    new StateGraph(ChatState)
      .addNode('model', callModel)
      .addNode('tools', new ToolNode(tools))
      .addEdge(START, 'model')
      // 工具/续轮/收尾三选一: 见 routeAfterModel
      .addConditionalEdges('model', routeAfterModel, ['tools', 'model', END])
      .addEdge('tools', 'model')
      .compile({ checkpointer: getCheckpointStore() })
  )
}

/** 编译后的对话图类型 */
export type ChatGraph = ReturnType<typeof createChatGraph>

let compiled: ChatGraph | null = null

/** 取编译好的对话图(单例) 必须先把checkpointer打开 */
export function getChatGraph(): ChatGraph {
  if (compiled === null) compiled = createChatGraph()
  return compiled
}

/** 每轮调用时传给graph的配置 */
export interface TurnConfig {
  /** 会话id 即checkpointer的thread_id */
  threadId: string
  /** 中断信号 透传给模型请求 */
  signal?: AbortSignal
}

/** 把TurnConfig翻译成LangGraph的RunnableConfig */
export function toRunnableConfig(turn: TurnConfig): LangGraphRunnableConfig {
  return {
    configurable: {
      thread_id: turn.threadId
    },
    signal: turn.signal
  }
}
