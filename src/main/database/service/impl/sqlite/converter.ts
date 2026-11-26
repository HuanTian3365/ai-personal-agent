import type { HYEConversationExpand } from '@shared/types/hyExpand'
import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'

/** 数据库行是 unknown 系类型，统一别名后逐字段断言 */
export type Row = Record<string, unknown>

/** 转换行数据为 HYWorkspace（第一层：工作区） */
export function toWorkspace(row: Row): HYWorkspace {
  return {
    id: row.id as HYWorkspace['id'],
    title: row.title as string,
    sortIndex: row.sort_index as number
  }
}

/** 转换行数据为 HYGroup（第二层：分组，含默认分组） */
export function toGroup(row: Row): HYGroup {
  return {
    id: row.id as HYGroup['id'],
    workspaceId: row.workspace_id as HYGroup['workspaceId'],
    title: row.title as string,
    path: (row.path ?? null) as string | null,
    defaultFlag: !!row.default_flag,
    openStatus: !!row.open_status,
    sortIndex: row.sort_index as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }
}

/** 转换行数据为 HYConversation（第三层：对话） */
export function toConversation(row: Row): HYConversation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as HYConversation['workspaceId'],
    groupId: (row.group_id ?? null) as string | null,
    title: (row.title as string) || '新的对话',
    sortIndex: row.sort_index as number,
    expand: JSON.parse((row.expand as string) || '{}') as HYEConversationExpand,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }
}
