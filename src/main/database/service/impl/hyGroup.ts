import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { DatabaseRepository } from '../types'
import { DEFAULT_WORKSPACE_ID } from '../../init/data'
import type { Database } from '../../types'
import { toGroup } from './converter'
import type { Row } from './converter'

/**
 * 分组层 | hy_group 的读写方法
 *
 * 三种形态共用这张表(见 docs/规范与定义/02):
 * - 绑目录分组: default_flag=0 且 path 非空
 * - 纯命名分组: default_flag=0 且 path 为 null
 * - 默认分组:   default_flag=1 且 path 恒为 null
 *
 * 所以 path 可以为空 判形态只看 default_flag 不要拿 path IS NULL 反推
 */
export function createGroupMethods(
  database: Database
): Pick<DatabaseRepository, 'listGroups' | 'createGroup' | 'setGroupOpen'> {
  return {
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
    }
  }
}
