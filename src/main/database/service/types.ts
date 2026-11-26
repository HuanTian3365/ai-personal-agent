import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import type { CreateGroupInput, GroupRenameF } from '@shared/types/ipcContract'
import type { HYEConversationExpand } from '@shared/types/hyExpand'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 */
export interface DatabaseRepository {
  /** ====================  工作区  ==================== */
  /** 列出所有工作区 */
  listWorkspaces(): Promise<HYWorkspace[]>
  /** ====================  分组  ==================== */
  /** 列出所有分组 */
  listGroups(): Promise<HYGroup[]>
  /** 新建分组 */
  createGroup(input: CreateGroupInput): Promise<HYGroup>
  /** 设置分组展开状态 */
  setGroupOpen(id: string, open: boolean): Promise<void>
  /** 重命名分组 */
  groupRename: GroupRenameF
  /** ====================  会话  ==================== */
  /** 全部对话，按组内手动顺序返回 */
  listConversations(): Promise<HYConversation[]>
  /** 新建会话 */
  createConversation(groupId: string | null): Promise<HYConversation>
  /** 更新对话标题 */
  updateConversationTitle(id: string, title: string): Promise<void>
  /** 获取对话信息 */
  getConversation(id: string): Promise<HYConversation | null>
  /** 读会话扩展信息 */
  readExpand(id: string): HYEConversationExpand
  /** 更新会话扩展信息 */
  updateExpand(id: string, scope: string, patch: Record<string, unknown>): Promise<void>
}
