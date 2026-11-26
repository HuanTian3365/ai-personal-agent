import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { DatabaseRepository } from '../types'
import { DEFAULT_WORKSPACE_ID } from '../../init/data'
import type { Database } from '../../types'
import { toGroup } from './converter'
import type { Row } from './converter'
import { nextGroupSortIndex } from './utils'

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
): Pick<
  DatabaseRepository,
  'listGroups' | 'createGroup' | 'setGroupOpen' | 'groupDelete' | 'groupRename'
> {
  return {
    /** 分组列表 */
    async listGroups() {
      // 给出的数据按sort_index从大到小排列,大的(新创建的)在前
      const rows = database
        .prepare('SELECT * FROM hy_group ORDER BY workspace_id ASC, sort_index DESC')
        .all()
      return rows.map((r) => toGroup(r as Row))
    },
    /** 新建分组 */
    async createGroup(input) {
      const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID

      // 工作区是否存在
      const workspace = database
        .prepare('SELECT id FROM hy_workspace WHERE id = ?')
        .get(workspaceId)
      if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)

      // 判断路径是否有效
      const rawPath = input.path
      let real: string | null = null
      if (rawPath !== null) {
        try {
          real = await realpath(rawPath)
        } catch {
          throw new Error(`文件夹不存在或无法访问：${rawPath}`)
        }
        if (!(await stat(real)).isDirectory()) throw new Error(`不是目录：${real}`)
        // 如果路径已经注册
        const existing = database.prepare('SELECT * FROM hy_group WHERE path = ?').get(real) as
          Row | undefined
        if (existing !== undefined) throw new Error(`路径已存在,名称: ${toGroup(existing).title}`)
      }

      // 判断标题是否有效
      const title = real === null ? input.title : input.title || basename(real) || real
      if (title === '') throw new Error('不选择文件夹时，分组名称必填')

      // 获取序号
      const sortIndex = nextGroupSortIndex(database, workspaceId)

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
    /** 删除分组 */
    async groupDelete(id) {
      const row = database.prepare('SELECT default_flag FROM hy_group WHERE id = ?').get(id) as
        | {
            default_flag: number
          }
        | undefined
      // id不存在与已删两次都落到这里 不报成功免得界面以为删掉了
      if (row === undefined) return { success: false, error: '分组不存在' }
      // 界面已对默认分组隐藏入口 后端仍拦一道 渲染层递过来的参数一律当不可信
      if (row.default_flag === 1) return { success: false, error: '默认分组不可删除' }
      // 组内会话的group_id由外键ON DELETE SET NULL自动落到未分组 文件夹与消息一律不动
      database.prepare('DELETE FROM hy_group WHERE id = ?').run(id)
      return { success: true, data: undefined }
    },
    /** 重命名分组 */
    async groupRename(input) {
      database.prepare('UPDATE hy_group SET title = ? WHERE id = ?').run(input.title, input.id)
      return {
        success: true,
        data: undefined
      }
    }
  }
}
