import type { ContentBlock, MessageUsage, TurnMessage } from '@shared/types/message'
/** Agent事件本体 | core产出的纯数据 不带任何传输层字段 */
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
  | AEQueue
  | AETitle

/**
 * 推送信封
 *
 * seq 由main在转发前注入 全局单调递增 core不知道它的存在
 * 切回会话时渲染层拿它区分「快照已包含」与「快照之后才到」的事件
 */
export interface AgentEventEnvelope {
  /** 推送序号 */
  seq: number
  /** 事件本体 */
  event: AgentEvent
}

/** ====================  事件实现  ==================== */
// 公共实现
interface AEBlockBase {
  /** 会话ID */
  conversationId: string
  /** 轮ID(用户消息id) */
  turnId: string
  /** AI 消息用chunk.id,工具用tool_call_id */
  blockId: string
}

/** 启动轮 */
export interface AETurnStart {
  type: 'turn-start'
  conversationId: string
  /** 用户消息id作为根id,user必填,items空数组,status=running */
  turn: TurnMessage
}
/** 结束轮 */
export interface AETurnEnd {
  type: 'turn-end'
  conversationId: string
  /** 轮ID(用户消息id) */
  turnId: string
  /** running 不会出现在 end 里 */
  status: 'done' | 'aborted'
  usage?: MessageUsage
  endTime?: number
}

/** 开始思考 */
export interface AEReasoningStart extends AEBlockBase {
  type: 'reasoning-start'
}
/** 思考中 */
export interface AEReasoningDelta extends AEBlockBase {
  type: 'reasoning-delta'
  text: string
}
/** 思考结束 */
export interface AEReasoningEnd extends AEBlockBase {
  type: 'reasoning-end'
}

/** 开始回复 */
export interface AEAssistantStart extends AEBlockBase {
  type: 'assistant-start'
}
/** 回复中 */
export interface AEAssistantDelta extends AEBlockBase {
  type: 'assistant-delta'
  text: string
}
/** 回复结束 */
export interface AEAssistantEnd extends AEBlockBase {
  type: 'assistant-end'
  modelName?: string
  modelProvider?: string
}

/** 开始调用工具 */
export interface AEToolStart extends AEBlockBase {
  type: 'tool-start'
  name: string
}
/** 工具传参 */
export interface AEToolArgs extends AEBlockBase {
  type: 'tool-args'
  args: Record<string, unknown> | null
}
/** 工具结果 */
export interface AEToolEnd extends AEBlockBase {
  type: 'tool-end'
  status: 'done' | 'error'
  result: string
}

/** 一次性块,应对一些特殊消息 */
export interface AEBlockAdd {
  type: 'block-add'
  conversationId: string
  turnId: string
  block: ContentBlock
}

/**
 * 排队项。
 *
 * 生成期间用户又发的一条先躺在这里，等本轮结束才发。
 */
export interface QueueItem {
  id: string
  text: string
}

/** 队列消息 */
export interface AEQueue {
  type: 'queue'
  conversationId: string
  queue: QueueItem[]
}

/** 更新标题 */
export interface AETitle {
  type: 'title'
  conversationId: string
  title: string
}
