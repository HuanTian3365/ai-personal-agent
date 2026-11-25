/**
 * 此处存放消息处理逻辑
 */

import type { AgentEventEnvelope, QueueItem } from '@shared/types/agentEvent'
import type { MUser } from '@shared/types/message'

/** 用户发送的消息:渲染测到loop的参数类型 */
export type MessageEventSend = Omit<MUser, 'type' | 'id'>

/** `agent:send` 的投递方式 | queue: 排队等本轮结束 insert: 推进当前轮 */
export type SendMode = 'queue' | 'insert'

/** 排队项的可变操作 | 插队走 agent:insert 这里只管文案与删除 */
export type QueueEditAction = { kind: 'edit'; text: string } | { kind: 'remove' }

/** `agent:send` 的结果：sent 表示已受理，queued 表示正在生成、这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: QueueItem[] }

/**
 * 正在生成中的一轮的快照(进程内,应用重启即失效)
 *
 * 流式期间不落库 切回会话时靠这份事件重放把那一轮拼出来
 */
export interface StreamSnapshot {
  conversationId: string
  /** 本轮已发出的事件 | 按序交给渲染层的事件处理器即可重建整轮 */
  events: AgentEventEnvelope[]
}
