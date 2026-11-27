import type { DatabaseRepository } from '../types'
import type { Database } from '../../types'
import { errorText } from '@main/utils/error'

/**
 * 消息层 | hy_message 的读方法
 *
 * 正文的写全在 core 的转换层(checkpoint.ts) 那边一条消息一行地追加
 * 这里只补 main 这边需要问的:这条消息落库了没有
 *
 * 失败一律走Result不throw | 数据库本身同步 方法不包Promise
 */
export function createMessageMethods(
  database: Database
): Pick<DatabaseRepository, 'messageExists'> {
  return {
    /** 这条消息是否已经落库 */
    messageExists(request) {
      try {
        const row = database.prepare('SELECT 1 FROM hy_message WHERE id = ?').get(request.id)
        return { success: true, data: row !== undefined }
      } catch (err) {
        return { success: false, error: errorText('查询消息', err) }
      }
    }
  }
}
