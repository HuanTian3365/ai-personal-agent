/**
 * 此处存放消息处理逻辑
 */

import type { QueueItem } from '@shared/types/agentEvent'
import type { ContentBlock, MUser } from '@shared/types/message'

export type MessageEventSend = Omit<MUser, 'type' | 'id'>

/** `agent:send` 的结果：sent 表示整轮跑完了，queued 表示正在生成、这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: QueueItem[] }

/** 正在生成中的一轮的快照（进程内，应用重启即失效） */
export interface ActiveStream {
  conversationId: string
  /** 已经生成出来的内容，客户端拿它重建占位气泡 */
  blocks: ContentBlock[]
}
