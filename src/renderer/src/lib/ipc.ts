/**
 * window.api 的薄封装。
 * 组件与 hook 一律通过这里访问主进程，不直接碰 window.api。
 *
 * 会话域按列表三层分组：工作区 → 分组 → 对话。
 * 消息只有「读」这一条（`messageList`）：写入由 core 的对话图负责，
 * 渲染层没有追加入口。
 *
 * 方法名一律归属前置: 域 + 动作 | 与 DatabaseRepository 和 IPC 通道一一对应
 * 入参在这里聚成对象交给 preload | 上层调用仍按平铺的参数写 不用自己拼
 */

import type {
  GroupCreateI,
  GroupRenameI,
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
  groupExpand: (id: string, open: boolean) => window.api.group.expand({ id, open }),
  /** 打开分组目录 */
  groupOpenFolder: (path: string) => window.api.group.folder({ path }),
  /** 删除分组 */
  groupDelete: (id: string) => window.api.group.delete({ id }),
  /** 重命名分组 */
  groupRename: (input: GroupRenameI) => window.api.group.rename(input),
  /** ====================  会话  ==================== */
  /** 会话列表 */
  conversationList: () => window.api.conversation.list(),
  /** 新建会话 */
  conversationCreate: (groupId: string | null) => window.api.conversation.create({ groupId }),
  /** 会话信息 */
  conversationInfo: (id: string) => window.api.conversation.info({ id }),
  /** ====================  消息  ==================== */
  /** 消息列表 */
  messageList: (conversationId: string) => window.api.message.list({ conversationId })
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
