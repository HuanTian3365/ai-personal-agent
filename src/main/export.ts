// ── 数据库 ──
/** 开库 / 关库：业务表与 LangGraph 的 checkpoint 表共用同一个文件、同一个连接 */
export { closeDatabase, openDatabase } from './database'
/** 取业务仓储 / 取原始连接 */
export { getDatabase, getRepository } from './database'
export type { DatabaseRepository } from './database/service/types'
export type { Database } from './database/types'

// ── IPC ──
/** 把所有 IPC handler 挂到 ipcMain 上 */
export { default as mount } from './ipc'
