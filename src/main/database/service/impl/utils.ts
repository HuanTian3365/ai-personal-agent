import type { Database } from '../../types'

/**
 * 组内新对话的 sort_index
 * 取当前最大值 +1 插到最前 | 列表按 sort_index 倒序读 越大的越靠前
 * 空组为 0
 */
export function nextConversationSortIndex(database: Database, groupId: string | null): number {
  const sql =
    groupId === null
      ? 'SELECT COALESCE(MAX(sort_index), -1) + 1 AS n FROM hy_conversation WHERE group_id IS NULL'
      : 'SELECT COALESCE(MAX(sort_index), -1) + 1 AS n FROM hy_conversation WHERE group_id = ?'
  const stmt = database.prepare(sql)
  const row = (groupId === null ? stmt.get() : stmt.get(groupId)) as { n: number }
  return row.n
}

/**
 * 工作区内新分组的 sort_index
 * 该工作区所有分组取最大序号+1 | 不过滤default_flag: 默认分组占着0
 * 所以普通分组从1起 天然和默认分组错开一格 不会并列
 * 列表倒序读 序号最大的显示在最前
 */
export function nextGroupSortIndex(database: Database, workspaceId: string): number {
  const row = database
    .prepare('SELECT COALESCE(MAX(sort_index), -1) + 1 AS n FROM hy_group WHERE workspace_id = ?')
    .get(workspaceId) as { n: number }
  return row.n
}
