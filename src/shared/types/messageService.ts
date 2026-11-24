/**
 * 此处存放消息处理逻辑
 */

import type { AgentEventEnvelope, QueueItem } from '@shared/types/agentEvent'
import type { MUser } from '@shared/types/message'

export type MessageEventSend = Omit<MUser, 'type' | 'id'>

/** `agent:send` 的结果：sent 表示整轮跑完了，queued 表示正在生成、这条已进排队 */
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
