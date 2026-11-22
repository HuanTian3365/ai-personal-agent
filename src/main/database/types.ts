import type BetterSqlite3 from 'better-sqlite3'

/**
 * 数据库连接类型。
 *
 * 全项目只有一个 SQLite 文件、一个连接（见 `database/index.ts` 的 `openDatabase`）。
 * 业务表和 LangGraph 的 checkpoint 表都在里面，所以类型统一从这里取，
 * 不要在别处再 `import 'node:sqlite'`——项目已经不用内置的那个驱动了。
 */
export type Database = BetterSqlite3.Database
