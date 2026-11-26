/**
 * window.api 的薄封装。
 * 组件与 hook 一律通过这里访问主进程，不直接碰 window.api。
 *
 * 会话域按列表三层分组：工作区 → 分组 → 对话。
 * 消息只有「读」这一条（`messageList`）：写入由 core 的对话图负责，
 * 渲染层没有追加入口。
 *
 * 方法名一律归属前置: 域 + 动作 | 与 DatabaseRepository 和 IPC 通道一一对应
 * 入参一律一个对象 | 跟 preload 同一套 xxxI 不在这层拆装
 */

import type {
  ConversationCreateI,
  ConversationInfoI,
  GroupCreateI,
  GroupDeleteI,
  GroupExpandI,
  GroupFolderI,
  GroupRenameI,
  MessageListI,
  QueueEditAction,
  SendMode
} from '@shared/types/ipcContract'
import type { AgentEventEnvelope } from '@shared/types/agentEvent'
import type { MessageEventSend } from '@shared/types/message'

export const conversationApi = {
  /** ====================  工作区  ==================== */
  /** 工作区列表 */
  workspaceList: () => window.api.workspace.list(),
  /** ====================  分组  ==================== */
  /** 分组列表 */
  groupList: () => window.api.group.list(),
  /** 新建分组 */
  groupCreate: (input: GroupCreateI) => window.api.group.create(input),
  /** 分组展开|收起 */
  groupExpand: (input: GroupExpandI) => window.api.group.expand(input),
  /** 打开分组目录 */
  groupOpenFolder: (input: GroupFolderI) => window.api.group.folder(input),
  /** 删除分组 */
  groupDelete: (input: GroupDeleteI) => window.api.group.delete(input),
  /** 重命名分组 */
  groupRename: (input: GroupRenameI) => window.api.group.rename(input),
  /** ====================  会话  ==================== */
  /** 会话列表 */
  conversationList: () => window.api.conversation.list(),
  /** 新建会话 */
  conversationCreate: (input: ConversationCreateI) => window.api.conversation.create(input),
  /** 会话信息 */
  conversationInfo: (input: ConversationInfoI) => window.api.conversation.info(input),
  /** ====================  消息  ==================== */
  /** 消息列表 */
  messageList: (input: MessageListI) => window.api.message.list(input)
}

export const expandApi = {
  /** 选择目录 */
  pickDirectory: () => window.api.expand.pickDirectory(),
  /** 校验路径是否存在 */
  validPath: (target: string) => window.api.expand.validPath(target)
}
export const agentApi = {
  /** 发送消息 | mode 决定排队还是插队 */
  send: (conversationId: string, message: MessageEventSend, mode: SendMode) =>
    window.api.agent.send(conversationId, message, mode),
  /** 中断消息 */
  abort: (conversationId: string) => window.api.agent.abort(conversationId),
  /** 监听事件 */
  onEvent: (callback: (payload: AgentEventEnvelope) => void) => window.api.agent.onEvent(callback),
  /** 获取对话快照 */
  snapshot: (conversationId: string) => window.api.agent.snapshot(conversationId),
  /** 把排队里的一条插入当前轮 */
  insert: (conversationId: string, itemId: string) =>
    window.api.agent.insert(conversationId, itemId),
  /** 取该对话的排队内容 */
  queue: (conversationId: string) => window.api.agent.queue(conversationId),
  /** 改排队里的一条：改文案 / 删除 */
  updateQueue: (conversationId: string, itemId: string, action: QueueEditAction) =>
    window.api.agent.updateQueue(conversationId, itemId, action)
}
