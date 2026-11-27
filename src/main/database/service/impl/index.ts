import type { DatabaseRepository } from '../types'
import type { Database } from '../../types'
import { createWorkspaceMethods } from './hyWorkspace'
import { createGroupMethods } from './hyGroup'
import { createConversationMethods } from './hyConversations'
import { createMessageMethods } from './hyMessage'

/**
 * 基于 better-sqlite3 的存储实现
 *
 * 按表拆成四个归属文件 这里只组装:
 * - hyWorkspace.ts     hy_workspace
 * - hyGroup.ts         hy_group
 * - hyConversations.ts hy_conversation
 * - hyMessage.ts       hy_message(只读:正文的写归 core 的转换层)
 *
 * 行 -> 对象的转换全在 converter.ts | 跨层共用的小查询在 utils.ts
 * 列表三层: hy_workspace(工作区) -> hy_group(分组) -> hy_conversation(对话)
 *
 * 返回类型是完整的 DatabaseRepository: 几个文件漏搬一个方法 tsc 就会报缺属性
 */
export function createSqliteRepository(database: Database): DatabaseRepository {
  return {
    ...createWorkspaceMethods(database),
    ...createGroupMethods(database),
    ...createConversationMethods(database),
    ...createMessageMethods(database)
  }
}
