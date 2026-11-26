import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import type { CreateGroupInput, GroupDeleteF, GroupRenameF } from '@shared/types/ipcContract'
import type { Result } from '@shared/types/result'
import type { HYEConversationExpand } from '@shared/types/hyExpand'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 *
 * 业务链路的失败一律走 Result 不throw | 意外异常由实现内部兜成 Result
 * 初始化阶段的门卫(getRepository/getDatabase未初始化)不在此列 那是配置错误
 */
export interface DatabaseRepository {
  /** ====================  工作区  ==================== */
  /** 列出所有工作区 */
  listWorkspaces(): Promise<Result<HYWorkspace[]>>
  /** ====================  分组  ==================== */
  /** 列出所有分组 */
  listGroups(): Promise<Result<HYGroup[]>>
  /** 新建分组 */
  createGroup(input: CreateGroupInput): Promise<Result<HYGroup>>
  /** 设置分组展开状态 */
  setGroupOpen(id: string, open: boolean): Promise<Result<undefined>>
  /** 删除分组 */
  groupDelete: GroupDeleteF
  /** 重命名分组 */
  groupRename: GroupRenameF
  /** ====================  会话  ==================== */
  /** 全部对话，按组内手动顺序返回 */
  listConversations(): Promise<Result<HYConversation[]>>
  /** 新建会话 */
  createConversation(groupId: string | null): Promise<Result<HYConversation>>
  /** 更新对话标题 | TODO(待实现): core侧调用 下一批跟着agent域一起改成Result */
  updateConversationTitle(id: string, title: string): Promise<void>
  /** 获取对话信息 */
  getConversation(id: string): Promise<Result<HYConversation | null>>
  /** 读会话扩展信息 | TODO(待实现): 同步方法 调用方在queue.ts 下一批一起改 */
  readExpand(id: string): HYEConversationExpand
  /** 更新会话扩展信息 | TODO(待实现): 同上 */
  updateExpand(id: string, scope: string, patch: Record<string, unknown>): Promise<void>
}
