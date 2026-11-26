import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import type { CreateGroupInput } from '@shared/types/ipcContract'
import type { HYEConversationExpand } from '@shared/types/hyExpand'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 */
export interface DatabaseRepository {
  /** ====================  工作区  ==================== */
  /** 列出所有工作区（第一层） */
  listWorkspaces(): Promise<HYWorkspace[]>
  /** ====================  分组  ==================== */
  /** 列出所有分组（第二层） */
  listGroups(): Promise<HYGroup[]>
  /** 设置分组展开状态 */
  setGroupOpen(id: string, open: boolean): Promise<void>
  /** ====================  会话  ==================== */
  /** 全部对话（第三层），按组内手动顺序返回 */
  listConversations(): Promise<HYConversation[]>
  /** groupId 为 null 表示未分组，落在缺省工作区的默认分组里 */
  createConversation(groupId: string | null): Promise<HYConversation>
  /** 更新对话标题 */
  updateConversationTitle(id: string, title: string): Promise<void>
  /** 获取对话信息 */
  getConversation(id: string): Promise<HYConversation | null>
  /** 读会话扩展信息 */
  readExpand(id: string): HYEConversationExpand
  /** 更新会话扩展信息 */
  updateExpand(id: string, scope: string, patch: Record<string, unknown>): Promise<void>

  /** ====================  新的实现  ==================== */
  /**
   * 新建分组。规则：
   * 1. 带 path：必须存在且是目录，落库前 realpath 规范化；同目录已登记则返回已有记录
   * 2. 不带 path：title 必填（trim 后非空）
   * 3. title 留空且带 path：取目录名
   */
  createGroup(input: CreateGroupInput): Promise<HYGroup>
}
