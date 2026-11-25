// ── 生命周期 ──
/** 初始化 core：main 开完库调这一次 */
export { disposeCore, initCore } from './index'

// ── 对话 ──
/** 跑一轮对话：main/runtime/drive.ts */
export { sendMessage } from './agent/loop'
/** 注册一轮的插入来源：main/runtime/drive.ts */
export { setInsertSource } from './graph/nodes'
/** 插入消息与插入来源的形状：main/runtime/drive.ts */
export type { InsertInput, InsertSource } from './graph/nodes'
/** 读某对话的历史消息（从 checkpoint 投影）：main/ipc/conversation.ts */
export { getHistoryMessage } from './message/historyMessage'
