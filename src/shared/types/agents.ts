import type { MessageView, ContentBlock } from './messages'

/** Agent事件 */
export type AgentEvent =
  | /** 用户发送消息 */ {
      type: 'user-message'
      conversationId: string
      message: MessageView
    }
  | /** Agent开始调用 */ {
      type: 'assistant-start'
      conversationId: string
    }
  | /** Agent回推流式 */ {
      type: 'assistant-delta'
      conversationId: string
      text: string
    }
  | /** Agent回推思考增量（thinking 模型才有） */ {
      type: 'reasoning-delta'
      conversationId: string
      text: string
    }
  | /** Agent结束输出 */ {
      type: 'assistant-end'
      conversationId: string
      message: MessageView
    }
  | /** Agent开始调用工具 */ {
      type: 'tool-start'
      conversationId: string
      /** 工具调用 id，与 tool-end 配对 */
      id: string
      name: string
      args: unknown
    }
  | /** 工具跑完 */ {
      type: 'tool-end'
      conversationId: string
      id: string
      name: string
      /** 工具返回的文本（出错时是错误说明） */
      result: string
      status: 'done' | 'error'
    }
  | /** 标题事件 */ {
      type: 'title'
      conversationId: string
      title: string
    }
  | /** 用户把排队项「插入」当前轮：界面立即显示，模型在下一个 step 边界才收到 */ {
      type: 'user-insert'
      conversationId: string
      message: MessageView
    }
  | /** 排队内容变了（入队、被插入、被领取） */ {
      type: 'queue'
      conversationId: string
      queue: QueueItem[]
    }

/**
 * 排队项。
 *
 * 生成期间用户又发的一条先躺在这里，等本轮结束才发；点「插入」就改投给正在跑的这一轮，
 * 在它的下一个 step 边界被模型读到。
 */
export interface QueueItem {
  id: string
  text: string
}

/** `agent:send` 的结果：sent 表示整轮跑完了，queued 表示正在生成、这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: QueueItem[] }

/** 正在生成中的一轮的快照（进程内，应用重启即失效） */
export interface ActiveStream {
  conversationId: string
  /** 已经生成出来的内容，客户端拿它重建占位气泡 */
  blocks: ContentBlock[]
}
