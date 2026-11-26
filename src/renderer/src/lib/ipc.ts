/**
 * window.api 的薄封装。
 * 组件与 hook 一律通过这里访问主进程，不直接碰 window.api。
 *
 * 会话域按列表三层分组：工作区 → 分组 → 对话。
 * 消息只有「读」这一条（`messageList`）：写入由 core 的对话图负责，
 * 渲染层没有追加入口。
 *
 * 方法名一律归属前置: 域 + 动作 | 与 DatabaseRepository 和 IPC 通道一一对应
 * 入参一律一个对象 参数名统一叫request | 跟preload同一套xxxReq 不在这层拆装
 */

import type {
  AgentAbortReq,
  AgentInsertReq,
  AgentQueueReq,
  AgentQueueUpdateReq,
  AgentSendReq,
  AgentSnapshotReq,
  ConversationCreateReq,
  ConversationInfoReq,
  ExpandValidPathReq,
  GroupCreateReq,
  GroupDeleteReq,
  GroupExpandReq,
  GroupFolderReq,
  GroupRenameReq,
  MessageListReq
} from '@shared/types/ipcContract'
import type { AgentEventEnvelope } from '@shared/types/agentEvent'

export const conversationApi = {
  /** ====================  工作区  ==================== */
  /** 工作区列表 */
  workspaceList: () => window.api.workspace.list(),
  /** ====================  分组  ==================== */
  /** 分组列表 */
  groupList: () => window.api.group.list(),
  /** 新建分组 */
  groupCreate: (request: GroupCreateReq) => window.api.group.create(request),
  /** 分组展开|收起 */
  groupExpand: (request: GroupExpandReq) => window.api.group.expand(request),
  /** 打开分组目录 */
  groupOpenFolder: (request: GroupFolderReq) => window.api.group.folder(request),
  /** 删除分组 */
  groupDelete: (request: GroupDeleteReq) => window.api.group.delete(request),
  /** 重命名分组 */
  groupRename: (request: GroupRenameReq) => window.api.group.rename(request),
  /** ====================  会话  ==================== */
  /** 会话列表 */
  conversationList: () => window.api.conversation.list(),
  /** 新建会话 */
  conversationCreate: (request: ConversationCreateReq) => window.api.conversation.create(request),
  /** 会话信息 */
  conversationInfo: (request: ConversationInfoReq) => window.api.conversation.info(request),
  /** ====================  消息  ==================== */
  /** 消息列表 */
  messageList: (request: MessageListReq) => window.api.message.list(request)
}

export const expandApi = {
  /** 选择目录 */
  pickDirectory: () => window.api.expand.pickDirectory(),
  /** 校验路径是否存在 */
  validPath: (request: ExpandValidPathReq) => window.api.expand.validPath(request)
}
export const agentApi = {
  /** 发送消息 | mode 决定排队还是插队 */
  send: (request: AgentSendReq) => window.api.agent.send(request),
  /** 中断消息 */
  abort: (request: AgentAbortReq) => window.api.agent.abort(request),
  /** 监听事件 */
  onEvent: (callback: (payload: AgentEventEnvelope) => void) => window.api.agent.onEvent(callback),
  /** 获取对话快照 */
  snapshot: (request: AgentSnapshotReq) => window.api.agent.snapshot(request),
  /** 把排队里的一条插入当前轮 */
  insert: (request: AgentInsertReq) => window.api.agent.insert(request),
  /** 取该对话的排队内容 */
  queue: (request: AgentQueueReq) => window.api.agent.queue(request),
  /** 改排队里的一条：改文案 / 删除 */
  updateQueue: (request: AgentQueueUpdateReq) => window.api.agent.updateQueue(request)
}
