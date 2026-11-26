import { randomUUID } from 'node:crypto'
import type { DatabaseRepository } from '../types'
import { DEFAULT_WORKSPACE_ID } from '../../init/data'
import type { Database } from '../../types'
import { toConversation } from './converter'
import type { Row } from './converter'
import { nextConversationSortIndex, unexpected } from './utils'
import { parseJson } from '@main/utils/parse'

/** 会话层的方法集合 */
type ConversationMethods = Pick<
  DatabaseRepository,
  | 'listConversations'
  | 'createConversation'
  | 'updateConversationTitle'
  | 'getConversation'
  | 'readExpand'
  | 'updateExpand'
>

/**
 * 会话层 | hy_conversation 的读写方法
 *
 * expand 是会话级业务扩展 JSON 第一层 key 声明职责
 * readExpand 单独同步返回: 调用方拿到就要立刻分支 不能等一轮事件循环
 *
 * 列表与新建/单查走Result | 标题回写与expand读写还被core和queue用着 下一批一起改
 */
export function createConversationMethods(database: Database): ConversationMethods {
  return {
    /** 会话列表 */
    async listConversations() {
      try {
        const rows = database
          .prepare('SELECT * FROM hy_conversation ORDER BY group_id ASC, sort_index DESC')
          .all()
        return { success: true, data: rows.map((r) => toConversation(r as Row)) }
      } catch (err) {
        return { success: false, error: unexpected('读取会话', err) }
      }
    },
    /** 新建会话 */
    async createConversation(groupId) {
      try {
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

        return {
          success: true,
          data: {
            id,
            workspaceId,
            groupId,
            title,
            sortIndex,
            expand: {},
            createdAt: now,
            updatedAt: now
          }
        }
      } catch (err) {
        return { success: false, error: unexpected('新建会话', err) }
      }
    },
    /** 更新会话标题 | TODO(待实现): core侧调用 下一批跟着agent域一起改成Result */
    async updateConversationTitle(id, title) {
      // 顺手更新 updated_at：标题变了说明对话有新内容，侧栏排序会用到
      database
        .prepare('UPDATE hy_conversation SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, Date.now(), id)
    },

    /** 会话信息 */
    async getConversation(id: string) {
      try {
        const row = database.prepare('SELECT * FROM hy_conversation WHERE id = ?').get(id) as
          Row | undefined
        // 查不到不是失败 | data为null 界面自己决定显示什么
        return { success: true, data: row === undefined ? null : toConversation(row) }
      } catch (err) {
        return { success: false, error: unexpected('读取会话信息', err) }
      }
    },
    /** 读会话级业务扩展 JSON | TODO(待实现): 同步方法 调用方在queue.ts 下一批一起改 */
    readExpand(id) {
      const row = database.prepare('SELECT expand FROM hy_conversation WHERE id = ?').get(id) as
        | {
            expand: string
          }
        | undefined
      return row === undefined ? {} : parseJson(row.expand)
    },
    /** 按职责合并写会话级业务扩展 | 只覆盖 scope 这一层 | TODO(待实现): 同上 */
    async updateExpand(id, scope, patch) {
      const row = database.prepare('SELECT expand FROM hy_conversation WHERE id = ?').get(id) as
        | {
            expand: string
          }
        | undefined
      if (row === undefined) return
      const current = parseJson(row.expand)
      const layer = current[scope]
      const merged =
        layer !== null && typeof layer === 'object' && !Array.isArray(layer)
          ? { ...(layer as Record<string, unknown>), ...patch }
          : patch
      database
        .prepare('UPDATE hy_conversation SET expand = ? WHERE id = ?')
        .run(JSON.stringify({ ...current, [scope]: merged }), id)
    }
  }
}
