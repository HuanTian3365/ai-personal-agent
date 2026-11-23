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
import { getCheckpointStore } from '@core/langchain/checkpoint'
import { callModel } from './nodes'

// 返回类型由StateGraph的泛型递归推导(节点名会进类型参数) 手写一遍不现实
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createChatGraph() {
  return (
    new StateGraph(ChatState)
      .addNode('model', callModel)
      .addNode('tools', new ToolNode(tools))
      .addEdge(START, 'model')
      // toolsCondition看最后一条消息里有没有tool_calls: 有就去跑工具 没有就收尾
      .addConditionalEdges('model', toolsCondition, ['tools', END])
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
