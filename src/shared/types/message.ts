/** 一轮里的一条消息 (TM=轮消息结构) */
export type TurnMessageBlock =
  TMUser | TMAssistant | TMReasoning | TMTool | TMError | TMUnknown | TMTips

/**
 * 一轮对话
 *
 * 从用户发出去到agent停下算一轮 中间的消息都归这一轮
 */
export interface TurnMessage {
  /** 发起消息的id | 没有发起时取本轮第一条的id */
  id: string
  /** null表示这一轮没有用户消息 */
  user: TMUser | null
  /** 本轮产出的消息块 | 按时间排 */
  items: TurnMessageBlock[]
  status: 'running' | 'done' | 'aborted'
  usage: MessageUsage
  startTime?: number
  /** 历史投影取最后一条消息的时间 */
  endTime?: number
}

/** 一轮的token用量 */
export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
}

/** 用户发出的一条消息 | 不带type和id 这两样开轮时补上 */
export type MessageEventSend = Omit<TMUser, 'type' | 'id'>

/** ====================  内部类型实现  ==================== */
/** 用户发的消息 | 既是本轮发起的那条 也是生成中插进来的块 */
export interface TMUser {
  type: 'user'
  id: string
  time?: number
  content?: string
  expandInfo?: {
    /** 是不是生成中插进来的 */
    insertFlag?: boolean
  }
  /** 预留 | 目前没有生产者也没有消费者 */
  resource?: Record<string, unknown>
}
/** 助手的回复 */
export interface TMAssistant {
  type: 'assistant'
  id: string
  content: string
  /** 这条回复的思考 | 与items里的TMReasoning二选一 不会同时存在 */
  reasoning?: TMReasoning
  modelName?: string
  modelProvider?: string
}

/** 一段思考 */
export interface TMReasoning {
  type: 'reasoning'
  id: string
  content: string
  status: 'running' | 'done'
}

/** 一次工具调用 */
export interface TMTool {
  type: 'tool'
  /** 模型的tool_call_id | 拿它认回结果 模型没给就现造一个 */
  id: string
  name: string
  /** 模型给的原始参数 */
  args: Record<string, unknown> | null
  /** 还没跑完是null */
  result: string | null
  /** 没等到结果就一直running | 这层判不出是还在跑还是断了 */
  status: 'running' | 'done' | 'error'
}

/** 一次报错 */
export interface TMError {
  type: 'error'
  /** 实时抛的错在这里现造 不等同于消息id */
  id: string
  message: string
  /** internal是我们自己的兜底 | 目前只有model在生产 */
  source: 'model' | 'internal'
}
/** 认不出来的块 | 原样留着 不丢数据 */
export interface TMUnknown {
  type: 'unknown'
  id: string
  /** 目前恒为BaseMessage */
  rawType: string
  raw: unknown
}

/** 我们自己发出的提示 | 中断 插入这类状态 不是模型的system消息 */
export interface TMTips {
  type: 'tips'
  id: string
  content: string
}
