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
  | AEBlockRemove
  | AEQueue
  | AETitle

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
 * 撤掉一个块。
 *
 * 只给插队用: 点插队时先把消息画进当前轮 本轮没领走(这一轮没有下一个step)
 * 就撤掉并退回排队区 否则界面会留一条刷新就消失的假消息
 */
export interface AEBlockRemove {
  type: 'block-remove'
  conversationId: string
  turnId: string
  blockId: string
}

/** 更新标题 */
export interface AETitle {
  type: 'title'
  conversationId: string
  title: string
}

/** 队列消息 */
export interface AEQueue {
  type: 'queue'
  conversationId: string
  queue: QueueItem[]
}

/**
 * 排队项
 *
 * 生成期间用户又发的一条先躺在这里:next-turn等本轮结束作为新一轮发出
 * next-step在下一个step边界推进当前轮(界面上的插队)
 */
export interface QueueItem {
  /** 消息id */
  id: string
  /** 消息内容 */
  text: string
  /** 投递方式 | next-turn: 等本轮结束(排队) next-step: 推进当前轮(插队) */
  target: 'next-turn' | 'next-step'
  /** 是否已被当前轮领取|领取后不再参与[本轮要不要继续]的判断,见core/graph/nodes.ts */
  claimed?: boolean
}

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
