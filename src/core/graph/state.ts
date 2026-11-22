import { Annotation, MessagesAnnotation } from '@langchain/langgraph'

/**
 * 对话图的状态。
 *
 * `messages` 直接用 LangGraph 预置的 reducer：
 * 节点返回的消息会**追加**到现有数组，而不是覆盖——这正是「对话历史」该有的语义，
 * 也是 `RemoveMessage`（压缩时替换历史）能工作的前提。
 *
 * 现在只有 messages 一个通道。以后要加的东西（摘要、待办、当前计划）都挂在这里，
 * 它们会跟着 checkpoint 一起被快照，天然支持「回退到某一步」。
 */
export const ChatState = Annotation.Root({
  messages: MessagesAnnotation.spec.messages
})
