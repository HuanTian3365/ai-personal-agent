import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import migrate from './init/migrate'
import { createSqliteRepository } from './service/impl/sqlite'
import type { DatabaseRepository } from './service/types'
import type { Database } from './types'

/** 数据库实例 */
let database: Database | null = null

/** 存储层实例 */
let store: DatabaseRepository | null = null

/**
 * 打开数据库并确保结构就绪。
 *
 * 业务表（`hy_workspace` / `hy_group` / `hy_conversation` …）和 LangGraph 的
 * checkpoint 表共用这一个文件、这一个连接：列表和消息本来就是同一个库里的东西，
 * 拆成两个文件只会让「按最后一条消息排序对话」这类查询做不了。
 *
 * 用 `await import()` 而不是顶层 import：`better-sqlite3` 是原生模块，
 * 只能按 Electron 的 ABI 编译，纯 Node 下加载会直接崩；core 的其余部分
 * （纯函数、`pnpm test`）要能脱离 Electron 单独跑。
 */
export async function openDatabase(databasePath: string): Promise<Database> {
  if (database !== null) return database

  mkdirSync(dirname(databasePath), { recursive: true })
  const { default: BetterSqlite3 } = await import('better-sqlite3')
  const instance = new BetterSqlite3(databasePath)

  // WAL：读写不互斥，主进程流式写入时不挡渲染层查询
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  instance.pragma('busy_timeout = 5000')

  migrate(instance)

  database = instance
  store = createSqliteRepository(instance)
  return database
}

/**
 * 取连接。
 * 给需要自己写 SQL 的地方用（目前只有 checkpointer：它的表由 LangGraph 自己建）。
 */
export function getDatabase(): Database {
  if (database === null) throw new Error('数据库尚未初始化：请先在 main 中调用 openDatabase()')
  return database
}

/** 关闭数据库 */
export function closeDatabase(): void {
  if (database === null) return
  database.close()
  database = null
  store = null
}

/** 获取数据库操作实例 */
export function getRepository(): DatabaseRepository {
  if (store === null) throw new Error('数据库尚未初始化：请先在 main 中调用 openDatabase()')
  return store
}
