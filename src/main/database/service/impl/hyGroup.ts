import { randomUUID } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { DatabaseRepository } from '../types'
import { DEFAULT_WORKSPACE_ID } from '../../init/data'
import type { Database } from '../../types'
import { toGroup } from './converter'
import type { Row } from './converter'
import { nextGroupSortIndex } from './utils'
import { validPath } from '@main/lib/file'
import { errorText } from '@main/utils/error'

/**
 * 分组层 | hy_group 的读写方法
 *
 * 三种形态共用这张表(见 docs/规范与定义/02):
 * - 绑目录分组: default_flag=0 且 path 非空
 * - 纯命名分组: default_flag=0 且 path 为 null
 * - 默认分组:   default_flag=1 且 path 恒为 null
 *
 * 所以 path 可以为空 判形态只看 default_flag 不要拿 path IS NULL 反推
 *
 * 失败一律走Result不throw | 业务失败给用户能读的文案 意外异常走errorText
 * 数据库本身同步 方法不包Promise | fs用的是判断类同步API 拿到结果立刻分支
 */
export function createGroupMethods(
  database: Database
): Pick<
  DatabaseRepository,
  'groupList' | 'groupCreate' | 'groupExpand' | 'groupDelete' | 'groupRename'
> {
  return {
    /** 分组列表 */
    groupList() {
      try {
        // 给出的数据按sort_index从大到小排列,大的(新创建的)在前
        const rows = database
          .prepare('SELECT * FROM hy_group ORDER BY workspace_id ASC, sort_index DESC')
          .all()
        return { success: true, data: rows.map((r) => toGroup(r as Row)) }
      } catch (err) {
        return { success: false, error: errorText('读取分组', err) }
      }
    },
    /** 新建分组 */
    groupCreate(input) {
      try {
        const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID

        // 工作区是否存在
        const workspace = database
          .prepare('SELECT id FROM hy_workspace WHERE id = ?')
          .get(workspaceId)
        if (workspace === undefined)
          return { success: false, error: `工作区不存在：${workspaceId}` }

        // 判断路径是否有效 | 同步实现: 结果要立刻分支 不等事件循环
        const rawPath = input.path
        let real: string | null = null
        if (rawPath !== null) {
          if (!validPath(rawPath)) {
            return { success: false, error: `文件夹不存在或无法访问：${rawPath}` }
          }
          try {
            // 存库与判重都用规范化后的路径 否则同一个目录换个写法就能登记两次
            real = realpathSync(rawPath)
            if (!statSync(real).isDirectory()) return { success: false, error: `不是目录：${real}` }
          } catch {
            // validPath与realpathSync之间目录被删了
            return { success: false, error: `文件夹无法访问：${rawPath}` }
          }
          // 如果路径已经注册
          const existing = database.prepare('SELECT * FROM hy_group WHERE path = ?').get(real) as
            Row | undefined
          if (existing !== undefined) {
            return { success: false, error: `路径已存在,名称: ${toGroup(existing).title}` }
          }
        }

        // 判断标题是否有效
        const title = real === null ? input.title : input.title || basename(real) || real
        if (title === '') return { success: false, error: '不选择文件夹时，分组名称必填' }

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

        // 不返回新行 调用方要列表自己重拉 | 返回没人读等于白查一次
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('新建分组', err) }
      }
    },
    /** 分组展开|收起 */
    groupExpand(input) {
      try {
        const info = database
          .prepare('UPDATE hy_group SET open_status = ? WHERE id = ?')
          .run(input.open ? 1 : 0, input.id)
        // 影响0行说明id不存在 不报成功免得界面以为改下去了
        if (info.changes === 0) return { success: false, error: '分组不存在' }
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('改分组展开状态', err) }
      }
    },
    /** 删除分组 */
    groupDelete(input) {
      try {
        const row = database
          .prepare('SELECT default_flag FROM hy_group WHERE id = ?')
          .get(input.id) as
          | {
              default_flag: number
            }
          | undefined
        // id不存在与已删两次都落到这里 不报成功免得界面以为删掉了
        if (row === undefined) return { success: false, error: '分组不存在' }
        // 界面已对默认分组隐藏入口 后端仍拦一道 渲染层递过来的参数一律当不可信
        if (row.default_flag === 1) return { success: false, error: '默认分组不可删除' }
        // 组内会话的group_id由外键ON DELETE SET NULL自动落到未分组 文件夹与消息一律不动
        database.prepare('DELETE FROM hy_group WHERE id = ?').run(input.id)
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('删除分组', err) }
      }
    },
    /** 重命名分组 */
    groupRename(input) {
      try {
        const info = database
          .prepare('UPDATE hy_group SET title = ? WHERE id = ?')
          .run(input.title, input.id)
        // 影响0行说明id不存在
        if (info.changes === 0) return { success: false, error: '分组不存在' }
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: errorText('重命名分组', err) }
      }
    }
  }
}
