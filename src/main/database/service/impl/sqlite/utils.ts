import type { Database } from '../../../types'

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

/**
 * 解析一个 JSON 对象文本
 *
 * 库里的 expand 是自由 JSON 解析失败或不是对象一律当空对象 不让脏数据把整条链路带崩
 */
export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
