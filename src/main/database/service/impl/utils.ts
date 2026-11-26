import type { Database } from '../../types'

/**
 * 组内新对话的 sort_index
 * 取当前最小值 -1，插到最前；
 * 空组为 0 */
export function nextConversationSortIndex(database: Database, groupId: string | null): number {
  const sql =
    groupId === null
      ? 'SELECT COALESCE(MIN(sort_index) - 1, 0) AS n FROM hy_conversation WHERE group_id IS NULL'
      : 'SELECT COALESCE(MIN(sort_index) - 1, 0) AS n FROM hy_conversation WHERE group_id = ?'
  const stmt = database.prepare(sql)
  const row = (groupId === null ? stmt.get() : stmt.get(groupId)) as { n: number }
  return row.n
}
