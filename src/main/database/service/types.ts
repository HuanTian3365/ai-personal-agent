import type {
  ConversationCreateFun,
  ConversationInfoFun,
  ConversationListFun,
  ConversationReadExpandFun,
  ConversationUpdateExpandFun,
  ConversationUpdateTitleFun,
  GroupCreateFun,
  GroupDeleteFun,
  GroupExpandFun,
  GroupListFun,
  GroupRenameFun,
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
  // ========== 工作区列表
  workspaceList: WorkspaceListFun
  // ========== 分组列表
  groupList: GroupListFun
  // ========== 新增分组
  groupCreate: GroupCreateFun
  // ========== 分组展开收起
  groupExpand: GroupExpandFun
  // ========== 删除分组
  groupDelete: GroupDeleteFun
  // ========== 重命名分组
  groupRename: GroupRenameFun
  // ========== 会话列表
  conversationList: ConversationListFun
  // ========== 新建对话
  conversationCreate: ConversationCreateFun
  // ========== 更新对话标题 | 标题生成后由core回写
  conversationUpdateTitle: ConversationUpdateTitleFun
  // ========== 获取对话信息
  conversationInfo: ConversationInfoFun
  // ========== 读会话扩展
  conversationReadExpand: ConversationReadExpandFun
  // ========== 写会话扩展 | 只覆盖 scope 这一层
  conversationUpdateExpand: ConversationUpdateExpandFun
}
