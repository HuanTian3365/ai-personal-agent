import type { TurnMessageBlock, MessageUsage, TurnMessage } from '@shared/types/message'
import type { HYEQueueItemView } from './hyExpand'
/** 推给渲染层的事件 | 纯数据 不含seq之类的传输字段 */
export type AgentEvent =
  | AETurnStart
  | AETurnEnd
  | AEReasoningStart
  | AEReasoningDelta
  | AEReasoningEnd
  | AEAssistantStart
  | AEAssistantDelta
  | AEAssistantEnd
  | AEToolStart
  | AEToolArgs
  | AEToolEnd
  | AEBlockAdd
  | AEBlockRemove
  | AEQueue
  | AETitle

/**
 * 事件信封
 *
 * 给事件加一个推送序号 渲染层拿它区分[快照已包含]和[快照之后才到]
 */
export interface AgentEventEnvelope {
  /** 全局递增 由main填 */
  seq: number
  event: AgentEvent
}

/** ====================  事件实现  ==================== */
// 公共实现
interface AEBlockBase {
  conversationId: string
  /** 用用户消息的id当轮id */
  turnId: string
  /** AI消息用chunk.id 工具用tool_call_id */
  blockId: string
}

/** 开一轮 */
export interface AETurnStart {
  type: 'turn-start'
  conversationId: string
  /** 只有user有值 items空 status=running */
  turn: TurnMessage
}
/** 结束一轮 */
export interface AETurnEnd {
  type: 'turn-end'
  conversationId: string
  /** 用用户消息的id当轮id */
  turnId: string
  /** running不会出现在这里 */
  status: 'done' | 'aborted'
  usage?: MessageUsage
  endTime?: number
}

/** 开始一段思考 */
export interface AEReasoningStart extends AEBlockBase {
  type: 'reasoning-start'
}
/** 思考中 */
export interface AEReasoningDelta extends AEBlockBase {
  type: 'reasoning-delta'
  /** 这一片 不是累计 */
  text: string
}
/** 思考结束 */
export interface AEReasoningEnd extends AEBlockBase {
  type: 'reasoning-end'
}

/** 开始一段回复 */
export interface AEAssistantStart extends AEBlockBase {
  type: 'assistant-start'
}
/** 回复中 */
export interface AEAssistantDelta extends AEBlockBase {
  type: 'assistant-delta'
  /** 这一片 不是累计 */
  text: string
}
/** 回复结束 */
export interface AEAssistantEnd extends AEBlockBase {
  type: 'assistant-end'
  modelName?: string
  modelProvider?: string
}

/** 开始调工具 */
export interface AEToolStart extends AEBlockBase {
  type: 'tool-start'
  name: string
}
/** 工具参数到了 */
export interface AEToolArgs extends AEBlockBase {
  type: 'tool-args'
  /** 模型给的原始参数 */
  args: Record<string, unknown> | null
}
/** 工具跑完了 */
export interface AEToolEnd extends AEBlockBase {
  type: 'tool-end'
  status: 'done' | 'error'
  result: string
}

/** 临时插一个块 | 不走流式 一次给全 */
export interface AEBlockAdd {
  type: 'block-add'
  conversationId: string
  /** 用用户消息的id当轮id */
  turnId: string
  block: TurnMessageBlock
}

/** 撤掉一个块 | 插队没被本轮领走时回滚 */
export interface AEBlockRemove {
  type: 'block-remove'
  conversationId: string
  /** 用用户消息的id当轮id */
  turnId: string
  blockId: string
}

/** 标题变了 */
export interface AETitle {
  type: 'title'
  conversationId: string
  title: string
}

/** 排队区变了 | 整份推过去 不是增量 */
export interface AEQueue {
  type: 'queue'
  conversationId: string
  queue: HYEQueueItemView[]
}
