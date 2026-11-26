import type {
  ConversationCreateF,
  ConversationInfoF,
  ConversationListF,
  ConversationReadExpandF,
  ConversationUpdateExpandF,
  ConversationUpdateTitleF,
  GroupCreateF,
  GroupDeleteF,
  GroupExpandF,
  GroupListF,
  GroupRenameF,
  WorkspaceListF
} from '@shared/types/ipcContract'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 *
 * 方法名一律归属前置: 域 + 动作 | 签名一律引用 ipcContract 里的 xxxF
 * 业务失败走 Result 不throw | 意外异常由实现内部兜成 Result
 * 初始化阶段的门卫(getRepository/getDatabase未初始化)不在此列 那是配置错误
 */
export interface DatabaseRepository {
  /** ====================  工作区  ==================== */
  /** 列出所有工作区 */
  workspaceList: WorkspaceListF
  /** ====================  分组  ==================== */
  /** 列出所有分组 */
  groupList: GroupListF
  /** 新建分组 */
  groupCreate: GroupCreateF
  /** 设置分组展开状态 */
  groupExpand: GroupExpandF
  /** 删除分组 */
  groupDelete: GroupDeleteF
  /** 重命名分组 */
  groupRename: GroupRenameF
  /** ====================  会话  ==================== */
  /** 全部对话，按组内手动顺序返回 */
  conversationList: ConversationListF
  /** 新建会话 */
  conversationCreate: ConversationCreateF
  /** 更新对话标题 | 标题生成后由core回写 */
  conversationUpdateTitle: ConversationUpdateTitleF
  /** 获取对话信息 */
  conversationInfo: ConversationInfoF
  /** 读会话扩展信息 | 同步: 调用方拿到就要立刻分支 不能等一轮事件循环 */
  conversationReadExpand: ConversationReadExpandF
  /** 按职责合并写会话扩展信息 | 只覆盖 scope 这一层 */
  conversationUpdateExpand: ConversationUpdateExpandF
}
