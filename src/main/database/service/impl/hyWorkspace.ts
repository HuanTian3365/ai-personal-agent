import type { DatabaseRepository } from '../types'
import type { Database } from '../../types'
import { toWorkspace } from './converter'
import type { Row } from './converter'
import { unexpected } from './utils'

/**
 * 工作区层 | hy_workspace 的读方法
 *
 * 只有列表没有单查: 侧栏一次取全量 再在渲染层拼三层树
 */
export function createWorkspaceMethods(
  database: Database
): Pick<DatabaseRepository, 'listWorkspaces'> {
  return {
    /** 工作区列表 */
    async listWorkspaces() {
      try {
        const rows = database.prepare('SELECT * FROM hy_workspace ORDER BY sort_index ASC').all()
        return { success: true, data: rows.map((r) => toWorkspace(r as Row)) }
      } catch (err) {
        return { success: false, error: unexpected('读取工作区', err) }
      }
    }
  }
}
