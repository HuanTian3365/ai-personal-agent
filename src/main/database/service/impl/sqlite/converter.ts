import type { Conversation, Group, Workspace } from '@shared/types/conversation'

/** 数据库行是 unknown 系类型，统一别名后逐字段断言 */
export type Row = Record<string, unknown>

/** 转换行数据为 Workspace（第一层：工作区） */
export function toWorkspace(row: Row): Workspace {
  return {
    id: row.id as Workspace['id'],
    title: row.title as string,
    sortIndex: row.sort_index as number
  }
}

/** 转换行数据为 Group（第二层：分组，含默认分组） */
export function toGroup(row: Row): Group {
  return {
    id: row.id as Group['id'],
    workspaceId: row.workspace_id as Group['workspaceId'],
    title: row.title as string,
    path: (row.path ?? null) as string | null,
    defaultFlag: !!row.default_flag,
    openStatus: !!row.open_status,
    sortIndex: row.sort_index as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }
}

/** 转换行数据为 Conversation（第三层：对话） */
export function toConversation(row: Row): Conversation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as Conversation['workspaceId'],
    groupId: (row.group_id ?? null) as string | null,
    title: (row.title as string) || '新的对话',
    sortIndex: row.sort_index as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }
}
