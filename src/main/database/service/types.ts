import type { Conversation, Group, Workspace } from '@shared/types/conversationDefinition'
import type { CreateGroupInput } from '@shared/types/conversationRealize'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 */
export interface DatabaseRepository {
  /** 列出所有工作区（第一层） */
  listWorkspaces(): Promise<Workspace[]>
  /** 列出所有分组（第二层） */
  listGroups(): Promise<Group[]>
  /** 设置分组展开状态 */
  setGroupOpen(id: string, open: boolean): Promise<void>
  /** 全部对话（第三层），按组内手动顺序返回 */
  listConversations(): Promise<Conversation[]>
  /** groupId 为 null 表示未分组，落在缺省工作区的默认分组里 */
  createConversation(groupId: string | null): Promise<Conversation>
  /** 更新对话标题 */
  updateConversationTitle(id: string, title: string): Promise<void>
  /** 获取对话信息 */
  getConversation(id: string): Promise<Conversation | null>

  /** ====================  新的实现  ==================== */
  /**
   * 新建分组。规则：
   * 1. 带 path：必须存在且是目录，落库前 realpath 规范化；同目录已登记则返回已有记录
   * 2. 不带 path：title 必填（trim 后非空）
   * 3. title 留空且带 path：取目录名
   */
  createGroup(input: CreateGroupInput): Promise<Group>
}
