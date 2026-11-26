import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { DatabaseRepository } from '../../types'
import { DEFAULT_WORKSPACE_ID } from '../../../init/data'
import type { Database } from '../../../types'
import { toConversation, toGroup, toWorkspace } from './converter'
import type { Row } from './converter'
import { nextConversationSortIndex } from './utils'
import { parseJson } from '@main/utils/parse'

/**
 * 基于 better-sqlite3 的存储实现。
 * 数据库行 → 项目对象的转换全在 converter.ts，这里只写 SQL 和业务规则。
 *
 * 列表三层：hy_workspace（工作区）→ hy_group（分组）→ hy_conversation（对话）。
 */
export function createSqliteRepository(database: Database): DatabaseRepository {
  return {
    /** ====================  工作区  ==================== */
    /** 工作区列表 */
    async listWorkspaces() {
      const rows = database.prepare('SELECT * FROM hy_workspace ORDER BY sort_index ASC').all()
      return rows.map((r) => toWorkspace(r as Row))
    },

    /** ====================  分组  ==================== */
    /** 分组列表 */
    async listGroups() {
      // 组内按 sort_index 排；跨工作区的先后由渲染层按工作区顺序重排，这里只保证同工作区内有序
      const rows = database
        .prepare('SELECT * FROM hy_group ORDER BY workspace_id ASC, sort_index ASC')
        .all()
      return rows.map((r) => toGroup(r as Row))
    },
    /** 新建分组 */
    async createGroup(input) {
      const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID
      const titleInput = (input.title ?? '').trim()

      // 1) 工作区必须存在（不再默默落到缺省工作区）
      const workspace = database
        .prepare('SELECT id FROM hy_workspace WHERE id = ?')
        .get(workspaceId)
      if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)

      // 2) 带路径就校验目录并规范化；不带路径 real 保持 null
      const rawPath = input.path ?? null
      let real: string | null = null
      if (rawPath !== null && rawPath.trim() !== '') {
        try {
          real = await realpath(rawPath)
        } catch {
          throw new Error(`文件夹不存在或无法访问：${rawPath}`)
        }
        if (!(await stat(real)).isDirectory()) throw new Error(`不是目录：${real}`)

        const existing = database.prepare('SELECT * FROM hy_group WHERE path = ?').get(real) as
          Row | undefined
        if (existing !== undefined) return toGroup(existing)
      }

      // 3) 标题：带路径可留空取目录名；不带路径必填
      const title = real === null ? titleInput : titleInput || basename(real) || real
      if (title === '') throw new Error('不选择文件夹时，分组名称必填')

      const { n: sortIndex } = database
        .prepare(
          'SELECT COALESCE(MAX(sort_index), -1) + 1 AS n FROM hy_group WHERE workspace_id = ? AND default_flag = 0'
        )
        .get(workspaceId) as { n: number }

      const now = Date.now()
      const id = randomUUID()

      database
        .prepare(
          `INSERT INTO hy_group(id, workspace_id, title, path, default_flag, open_status, sort_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)`
        )
        .run(id, workspaceId, title, real, sortIndex, now, now)

      return toGroup(database.prepare('SELECT * FROM hy_group WHERE id = ?').get(id) as Row)
    },
    /** 分组展开|收起 */
    async setGroupOpen(id, open) {
      database.prepare('UPDATE hy_group SET open_status = ? WHERE id = ?').run(open ? 1 : 0, id)
    },
    /** ====================  会话  ==================== */
    /** 会话列表 */
    async listConversations() {
      const rows = database
        .prepare('SELECT * FROM hy_conversation ORDER BY group_id ASC, sort_index ASC')
        .all()
      return rows.map((r) => toConversation(r as Row))
    },
    /** 新建会话 */

    async createConversation(groupId) {
      // workspaceId 从所属分组继承；未分组对话落到缺省工作区
      let workspaceId: string = DEFAULT_WORKSPACE_ID
      if (groupId !== null) {
        const group = database
          .prepare('SELECT workspace_id FROM hy_group WHERE id = ?')
          .get(groupId) as { workspace_id: string } | undefined
        if (group === undefined) throw new Error(`分组不存在：${groupId}`)
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
        id,
        workspaceId,
        groupId,
        title,
        sortIndex,
        expand: {},
        createdAt: now,
        updatedAt: now
      }
    },
    /** 更新会话标题 */
    async updateConversationTitle(id, title) {
      // 顺手更新 updated_at：标题变了说明对话有新内容，侧栏排序会用到
      database
        .prepare('UPDATE hy_conversation SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, Date.now(), id)
    },

    /** 会话信息 */
    async getConversation(id: string) {
      const row = database.prepare('SELECT * FROM hy_conversation WHERE id = ?').get(id) as
        Row | undefined
      return row === undefined ? null : toConversation(row)
    },
    /** 读会话级业务扩展 JSON */
    readExpand(id) {
      const row = database.prepare('SELECT expand FROM hy_conversation WHERE id = ?').get(id) as
        | {
            expand: string
          }
        | undefined
      return row === undefined ? {} : parseJson(row.expand)
    },
    /** 按职责合并写会话级业务扩展 | 只覆盖 scope 这一层 */
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
