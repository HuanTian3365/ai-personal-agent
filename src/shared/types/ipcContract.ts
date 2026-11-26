/**
 * IPC 契约 | 每个通道的入参和出参
 *
 * 放: 描述[一次请求或响应长什么样]的类型 按ipc.ts的域分组
 * 不放: 描述[某个东西是什么]的实体 轮-> message.ts | 表行-> hyEntity.ts | 排队项-> hyExpand.ts
 * 响应里带的实体从各实体文件引用 不在这里重定义
 *
 * 每个通道三件套: xxxI入参(有参数才有) | xxxR返回 | xxxF函数签名
 * 入参一律聚成一个对象 | 跨进程传位置参数没法在main侧收窄 一个对象才好整体校验
 * R里不放调用方用不上的data | 没人读就写Result不带泛型
 */

import type { AgentEventEnvelope } from './agentEvent'
import type { HYConversation, HYGroup, HYWorkspace } from './hyEntity'
import type { HYEConversationExpand, HYEQueueItem } from './hyExpand'
import type { TurnMessage } from './message'
import type { Result } from './result'

/** ====================  agent  ==================== */

/** agent:send 的入参 | 形状归core定义 见message.ts */
export type { MessageEventSend } from './message'

/** agent:send 的投递方式 | queue: 排队等本轮结束 insert: 推进当前轮 */
export type SendMode = 'queue' | 'insert'

/** agent:send 的返回 | sent: 已受理 queued: 正在生成 这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: HYEQueueItem[] }

/** agent:queue:update 的入参 | 改文案或删一条 插队走agent:insert */
export type QueueEditAction = { kind: 'edit'; text: string } | { kind: 'remove' }

/** agent:snapshot 的返回 | 正在生成中的那一轮 重启即失效 */
export interface StreamSnapshot {
  conversationId: string
  /** 按序重放一遍就能重建整轮 */
  events: AgentEventEnvelope[]
}

/** ====================  workspace  ==================== */

/** workspace:list 的返回 */
export type WorkspaceListR = Result<HYWorkspace[]>

export type WorkspaceListF = () => Promise<WorkspaceListR>

/** ====================  group  ==================== */

/** group:list 的返回 */
export type GroupListR = Result<HYGroup[]>

export type GroupListF = () => Promise<GroupListR>

/** group:create 的入参 | 传原始值 规范化与缺省由main决定 */
export interface GroupCreateI {
  /** 不传落缺省工作区 */
  workspaceId?: string
  /** null = 不绑目录 | 空串由main归一成null */
  path: string | null
  /** 绑了文件夹时留空取文件夹名 不绑时必填 */
  title: string
}

/** group:create 的返回 | 新建成功不返回实体 列表由调用方重拉 */
export type GroupCreateR = Result

export type GroupCreateF = (input: GroupCreateI) => Promise<GroupCreateR>

/** group:create 的失败原因 | 每个字段贴到对应输入框下面 只服务弹窗 */
export interface GroupCreateError {
  /** 路径输入框下面 */
  path?: string
  /** 名称输入框下面 */
  another?: string
}

/** 渲染层 hook 给弹窗的返回 | main只给一句话 这里按输入框分开 | 只这一处与GroupCreateR不同 */
export type GroupCreateOutput = Result<undefined, GroupCreateError>

/** group:expand 的入参 */
export interface GroupExpandI {
  id: string
  open: boolean
}

/** group:expand 的返回 | 无数据 */
export type GroupExpandR = Result

export type GroupExpandF = (input: GroupExpandI) => Promise<GroupExpandR>

/** group:folder 的入参 */
export interface GroupFolderI {
  path: string
}

/** group:folder 的返回 | 无数据 */
export type GroupFolderR = Result

export type GroupFolderF = (input: GroupFolderI) => Promise<GroupFolderR>

/** group:delete 的入参 */
export interface GroupDeleteI {
  id: string
}

/** group:delete 的返回 | 无数据 */
export type GroupDeleteR = Result

export type GroupDeleteF = (input: GroupDeleteI) => Promise<GroupDeleteR>

/** group:rename 的入参 */
export interface GroupRenameI {
  id: string
  title: string
}

/** group:rename 的返回 | 无数据 */
export type GroupRenameR = Result

export type GroupRenameF = (input: GroupRenameI) => Promise<GroupRenameR>

/** ====================  conversation  ==================== */

/** conversation:list 的返回 */
export type ConversationListR = Result<HYConversation[]>

export type ConversationListF = () => Promise<ConversationListR>

/** conversation:create 的入参 */
export interface ConversationCreateI {
  /** null = 未分组 落所属工作区的默认分组 */
  groupId: string | null
}

/** conversation:create 的返回 | 带新会话 调用方要 id 跳转 */
export type ConversationCreateR = Result<HYConversation>

export type ConversationCreateF = (input: ConversationCreateI) => Promise<ConversationCreateR>

/** conversation:info 的入参 */
export interface ConversationInfoI {
  id: string
}

/** conversation:info 的返回 | 查不到是 data: null 不是失败 */
export type ConversationInfoR = Result<HYConversation | null>

export type ConversationInfoF = (input: ConversationInfoI) => Promise<ConversationInfoR>

/** conversationUpdateTitle 的入参 | 只在core内部用 没开IPC通道 */
export interface ConversationUpdateTitleI {
  id: string
  title: string
}

/** conversationUpdateTitle 的返回 | 无数据 */
export type ConversationUpdateTitleR = Result

export type ConversationUpdateTitleF = (
  input: ConversationUpdateTitleI
) => Promise<ConversationUpdateTitleR>

/** conversationReadExpand 的入参 | 只在queue内部用 没开IPC通道 */
export interface ConversationReadExpandI {
  id: string
}

/** conversationReadExpand 的返回 | 同步返回 调用方拿到就要立刻分支 */
export type ConversationReadExpandR = Result<HYEConversationExpand>

export type ConversationReadExpandF = (input: ConversationReadExpandI) => ConversationReadExpandR

/** conversationUpdateExpand 的入参 | 只在queue内部用 没开IPC通道 */
export interface ConversationUpdateExpandI {
  id: string
  scope: string
  patch: Record<string, unknown>
}

/** conversationUpdateExpand 的返回 | 无数据 */
export type ConversationUpdateExpandR = Result

export type ConversationUpdateExpandF = (
  input: ConversationUpdateExpandI
) => Promise<ConversationUpdateExpandR>

/** ====================  message  ==================== */

/** message:list 的入参 */
export interface MessageListI {
  conversationId: string
}

/** message:list 的返回 */
export type MessageListR = Result<TurnMessage[]>

export type MessageListF = (input: MessageListI) => Promise<MessageListR>
