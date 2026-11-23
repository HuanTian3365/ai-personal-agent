/** 消息格式 */
export type ContentBlock = MUser | MAssistant | MReasoning | MTool | MError | MUnknown | MSystem

/**
 * 轮对话信息
 *
 * 以用户发起的消息作为始终判断,期间的消息归为一轮
 */
export interface TurnMessage {
  /** 发起消息的id,没有发起时取本轮第一条消息的id */
  id: string
  /** 用户发送的消息 */
  user: MUser | null
  /** 本轮回复的消息 */
  items: ContentBlock[]
  /** 本轮轮状态 */
  status: 'running' | 'done' | 'aborted'
  /** 本轮用量 */
  usage: MessageUsage
  /** 开始时间:agent开始执行时间 */
  startTime?: number
  /** 结束时间:agent结束执行时间 */
  endTime?: number
}

/** 消息用量 */
export interface MessageUsage {
  /** 输入Token */
  inputTokens: number
  /** 输出Token */
  outputTokens: number
  /** 缓存读Token */
  cacheReadTokens: number
  /** 缓存写Token */
  cacheWriteTokens: number
  /** 总Token */
  totalTokens: number
}

/** ====================  内部类型实现  ==================== */
/** 用户消息格式 */
export interface MUser {
  type: 'user'
  /** 用户消息id->kwargs.id */
  id: string
  /** 发送时间 */
  time?: number
  /** 用户输入内容 */
  content?: string
  /** 扩展信息 */
  expandInfo?: {
    /** 是否为插入对话 */
    insertFlag?: boolean
  }
  /** 用户附加的资源,预留,用于未来扩展多模态功能 */
  resource?: Record<string, unknown>
}
/** 助手消息内容 */
export interface MAssistant {
  type: 'assistant'
  /** 助手消息id->kwargs.id */
  id: string
  /** 助手输出内容 */
  content: string
  /** 助手思考内容 */
  reasoning?: MReasoning
  /** 模型名称 */
  modelName?: string
  /** 模型供应商 */
  modelProvider?: string
}

/** 思考消息内容 */
export interface MReasoning {
  type: 'reasoning'
  /** 助手消息id->kwargs.id */
  id: string
  /** 思考内容 */
  content: string
  /** 消息状态 */
  status: 'running' | 'done'
}

/** 工具消息内容
 *
 * 当AIMessage发起tool_calls时,插入工具消息
 *
 * 等工具返回结果时,按照tool_calls.id找到插入的消息关联起来
 */
export interface MTool {
  type: 'tool'
  /** 工具调用id->kwargs.tool_call_id */
  id: string
  /** 工具名 */
  name: string
  /** agent描述,让他简短说明他要干什么 */
  description?: string
  /** 调用参数(模型给的原始对象) */
  args: Record<string, unknown> | null
  /** 工具返回的文本,还没跑完是null */
  result: string | null
  /** 工具状态 */
  status: 'running' | 'done' | 'error'
}

/** 错误消息内容 */
export interface MError {
  type: 'error'
  id: string
  /** 错误信息 */
  message: string
  /** 错误来源 */
  source: 'model' | 'internal'
}
/** 未知消息内容 */
export interface MUnknown {
  type: 'unknown'
  id: string
  /** 未知消息类型 */
  rawType: string
  /** 未知消息内容 */
  raw: unknown
}

/** 系统消息内容 */
export interface MSystem {
  type: 'system'
  id: string
  /** 系统消息内容 */
  content: string
}

/**
 * TODO:后期可以新增一些时间字段,用于记录工具|思考|整轮消息使用的时间
 */
