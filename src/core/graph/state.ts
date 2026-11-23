import { Annotation, MessagesAnnotation } from '@langchain/langgraph'

/**
 * 图的状态 | 节点之间传递的就是这个对象
 *
 * 目前只有一个通道messages | 用LangGraph预置的reducer: 节点返回的消息会追加进数组
 * 而不是覆盖 这正是「对话历史」该有的语义 也是RemoveMessage(压缩时替换历史)能工作的前提
 *
 * 以后要加的通道(摘要 待办 当前计划)都挂在Annotation.Root里
 * 它们会跟着checkpoint一起被快照 天然支持「回退到某一步」
 * 注意: 加通道时loop侧只认messages 别把新通道的值当消息处理
 */
export const ChatState = Annotation.Root({
  messages: MessagesAnnotation.spec.messages
})
