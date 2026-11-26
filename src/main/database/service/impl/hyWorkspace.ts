import type { DatabaseRepository } from '../types'
import type { Database } from '../../types'
import { toWorkspace } from './converter'
import type { Row } from './converter'

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
      const rows = database.prepare('SELECT * FROM hy_workspace ORDER BY sort_index ASC').all()
      return rows.map((r) => toWorkspace(r as Row))
    }
  }
}
