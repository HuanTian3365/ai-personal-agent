// ── 生命周期 ──
/** 初始化 core：main 开完库调这一次 */
export { disposeCore, initCore } from './index'

// ── 对话 ──
/** 跑一轮对话：main/ipc/agent.ts */
export { sendMessage } from './agent/loop'
/** 插入消息的形状：main/ipc/agent.ts */
export type { InsertInput } from './graph/nodes'
/** 读某对话的历史消息（从 checkpoint 投影）：main/ipc/conversation.ts */
export { getHistoryMessage } from './message/historyMessage'
