import type {
  ConversationCreateFun,
  ConversationInfoFun,
  ConversationListFun,
  ConversationReadExpandFun,
  ConversationReadTitleFun,
  ConversationUpdateExpandFun,
  ConversationUpdateTitleFun,
  GroupCreateFun,
  GroupDeleteFun,
  GroupExpandFun,
  GroupListFun,
  GroupRenameFun,
  GroupReorderFun,
  MessageExistsFun,
  WorkspaceListFun
} from '@shared/types/ipcContract'

/**
 * 存储层唯一对外契约。
 * 上层只依赖这个接口，将来换 Postgres 只换实现，调用方一行不动。
 *
 * 方法名一律归属前置: 域 + 动作 | 签名一律引用 ipcContract 里的 xxxFun
 * 业务失败走 Result 不throw | 意外异常由实现内部兜成 Result
 * 初始化阶段的门卫(getRepository/getDatabase未初始化)不在此列 那是配置错误
 */
export interface DatabaseRepository {
  /** ====================  工作区  ==================== */
  /** 列出所有工作区 */
  workspaceList: WorkspaceListFun
  /** ====================  分组  ==================== */
  /** 列出所有分组 */
  groupList: GroupListFun
  /** 新建分组 */
  groupCreate: GroupCreateFun
  /** 设置分组展开状态 */
  groupExpand: GroupExpandFun
  /** 删除分组 */
  groupDelete: GroupDeleteFun
  /** 重命名分组 */
  groupRename: GroupRenameFun
  /** 重排分组顺序 | 按显示顺序整段重写 sort_index */
  groupReorder: GroupReorderFun
  /** ====================  会话  ==================== */
  /** 全部对话，按组内手动顺序返回 */
  conversationList: ConversationListFun
  /** 新建会话 */
  conversationCreate: ConversationCreateFun
  /** 更新对话标题 | 标题生成后由core回写 */
  conversationUpdateTitle: ConversationUpdateTitleFun
  /** 获取对话信息 */
  conversationInfo: ConversationInfoFun
  /** 只读标题一列 | 标题生成靠它判空 core用 */
  conversationReadTitle: ConversationReadTitleFun
  /** 读会话扩展信息 */
  conversationReadExpand: ConversationReadExpandFun
  /** 按职责合并写会话扩展信息 | 只覆盖 scope 这一层 */
  conversationUpdateExpand: ConversationUpdateExpandFun
  /** ====================  消息  ==================== */
  /** 这条消息是否已经落库 | 队列判重用(发过的排队项按 id 认回) */
  messageExists: MessageExistsFun
}
