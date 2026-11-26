import { randomUUID } from 'node:crypto'
import type { DatabaseRepository } from '../types'
import { DEFAULT_WORKSPACE_ID } from '../../init/data'
import type { Database } from '../../types'
import { toConversation } from './converter'
import type { Row } from './converter'
import { nextConversationSortIndex } from './utils'
import { parseJson } from '@main/utils/parse'
import { errorText } from '@main/utils/error'

/** 会话层的方法集合 */
type ConversationMethods = Pick<
  DatabaseRepository,
  | 'conversationList'
  | 'conversationCreate'
  | 'conversationUpdateTitle'
  | 'conversationInfo'
  | 'conversationReadExpand'
  | 'conversationUpdateExpand'
>

/**
 * 会话层 | hy_conversation 的读写方法
 *
 * expand 是会话级业务扩展 JSON 第一层 key 声明职责
 *
 * 失败一律走Result不throw | 业务失败给用户能读的文案 意外异常走errorText
 * 数据库本身同步 方法不包Promise
 */
export function createConversationMethods(database: Database): ConversationMethods {
  return {
    /** 会话列表 */
    conversationList() {
      try {
        const rows = database
          .prepare('SELECT * FROM hy_conversation ORDER BY group_id ASC, sort_index DESC')
          .all()
        return { success: true, data: rows.map((r) => toConversation(r as Row)) }
      } catch (err) {
        return { success: false, error: errorText('读取会话', err) }
      }
    },
    /** 新建会话 */
    conversationCreate(request) {
      try {
        const groupId = request.groupId
        // workspaceId 从所属分组继承；未分组对话落到缺省工作区
        let workspaceId: string = DEFAULT_WORKSPACE_ID
        if (groupId !== null) {
          const group = database
            .prepare('SELECT workspace_id FROM hy_group WHERE id = ?')
            .get(groupId) as { workspace_id: string } | undefined
          if (group === undefined) return { success: false, error: `分组不存在：${groupId}` }
          workspaceId = group.workspace_id
        }

        const now = Date.now()
        const id = randomUUID()
        const title = ''
        const sortIndex = nextConversationSortIndex(database, groupId)

        database
          .prepare(
            `INSERT INTO hy_conversation(id, workspace_id, group_id, title, sort_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(id, workspaceId, groupId, title, sortIndex, now, now)

        // 只回调用方用得上的两个字段 | 列表是重拉的 整行传出去没人读
        return { success: true, data: { id, workspaceId } }
      } catch (err) {
        return { success: false, error: errorText('新建会话', err) }
      }
    },
    /** 更新会话标题 | 顺手更新 updated_at 侧栏按它排「最近更新」 */
    conversationUpdateTitle(request) {
      try {
        const info = database
          .prepare('UPDATE hy_conversation SET title = ?, updated_at = ? WHERE id = ?')
          .run(request.title, Date.now(), request.id)
        if (info.changes === 0) return { success: false, error: '会话不存在' }
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('更新对话标题', err) }
      }
    },
    /** 会话信息 */
    conversationInfo(request) {
      try {
        const row = database
          .prepare('SELECT * FROM hy_conversation WHERE id = ?')
          .get(request.id) as Row | undefined
        // 查不到不是失败 | data为null 界面自己决定显示什么
        return { success: true, data: row === undefined ? null : toConversation(row) }
      } catch (err) {
        return { success: false, error: errorText('读取会话信息', err) }
      }
    },
    /** 读会话级业务扩展 JSON | 没写过或会话不存在都给空对象 调用方按缺省处理 */
    conversationReadExpand(request) {
      try {
        const row = database
          .prepare('SELECT expand FROM hy_conversation WHERE id = ?')
          .get(request.id) as
          | {
              expand: string
            }
          | undefined
        return { success: true, data: row === undefined ? {} : parseJson(row.expand) }
      } catch (err) {
        return { success: false, error: errorText('读取会话扩展', err) }
      }
    },
    /** 按职责合并写会话级业务扩展 | 只覆盖 scope 这一层 */
    conversationUpdateExpand(request) {
      try {
        const row = database
          .prepare('SELECT expand FROM hy_conversation WHERE id = ?')
          .get(request.id) as
          | {
              expand: string
            }
          | undefined
        // 会话不在了就不该静默成功 队列写不进去要让人知道
        if (row === undefined) return { success: false, error: '会话不存在' }
        const current = parseJson(row.expand)
        const layer = current[request.scope]
        const merged =
          layer !== null && typeof layer === 'object' && !Array.isArray(layer)
            ? { ...(layer as Record<string, unknown>), ...request.patch }
            : request.patch
        database
          .prepare('UPDATE hy_conversation SET expand = ? WHERE id = ?')
          .run(JSON.stringify({ ...current, [request.scope]: merged }), request.id)
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('更新会话扩展', err) }
      }
    }
  }
}
