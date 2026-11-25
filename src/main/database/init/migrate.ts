import type { Database } from '../types'
import { DDL, SCHEMA_VERSION } from './sql'
import { DEFAULT_WORKSPACE } from './data'

/**
 * 初始化数据
 */
function initData(database: Database): void {
  const now = Date.now()
  // 初始化工作区
  const insertWorkspace = database.prepare(
    `INSERT INTO hy_workspace(id, title, sort_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  )
  for (const [id, title, sortIndex] of DEFAULT_WORKSPACE) {
    insertWorkspace.run(id, title, sortIndex, now, now)
  }

  // 初始化默认分组：每个工作区一条，收该工作区下未分组的对话
  const insertDefaultGroup = database.prepare(`
  INSERT INTO hy_group
    (id, workspace_id, title, path, default_flag, open_status, sort_index, created_at, updated_at)
  VALUES (?, ?, '未分组', NULL, 1, 1, 0, ?, ?)
  ON CONFLICT (id) DO NOTHING
`)

  for (const [workspaceId] of DEFAULT_WORKSPACE) {
    insertDefaultGroup.run(`${workspaceId}:ungrouped`, workspaceId, now, now)
  }
}

/** 数据库构建 */
export default function migrate(database: Database): void {
  // 读取数据库版本
  const storedVersion = readSchemaVersion(database)

  // 如果数据库版本不一致,则删除旧数据库
  if (storedVersion !== undefined && storedVersion !== SCHEMA_VERSION) {
    console.warn(
      `[database] schema 版本不一致（库内 ${storedVersion}，代码 ${SCHEMA_VERSION}）：删除全部表并重建，旧数据不再保留`
    )
    database.exec(`
    DROP TABLE IF EXISTS hy_conversation;
    DROP TABLE IF EXISTS hy_group;
    DROP TABLE IF EXISTS hy_workspace;
    DROP TABLE IF EXISTS hy_meta;
    `)
  }

  // 建表语句都是 IF NOT EXISTS，重建后照常执行
  database.exec(DDL)

  // 版本号：全新库没有记录，或刚被重建（表被清空），都要写入当前版本；
  // 注意重建后不能走 UPDATE——那张表已经被 DROP 重建过，里面是空的。
  if (storedVersion !== SCHEMA_VERSION) {
    database
      .prepare(
        `INSERT INTO hy_meta(key, value) VALUES('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(String(SCHEMA_VERSION))
  }

  // 初始化数据
  initData(database)
}

/** 获取数据库版本 */
function readSchemaVersion(database: Database): number | undefined {
  try {
    const row = database.prepare(`SELECT value FROM hy_meta WHERE key = 'schema_version'`).get() as
      { value: string } | undefined
    if (row === undefined) return undefined
    const parsed = Number.parseInt(row.value, 10)
    return Number.isNaN(parsed) ? undefined : parsed
  } catch {
    // hy_meta 还不存在 = 全新库
    return undefined
  }
}
