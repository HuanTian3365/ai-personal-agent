/** 角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * 消息状态。
 * 存在消息的 `additional_kwargs.status` 里，跟消息一起被 checkpoint 快照；
 * 投影时读出来，缺省当 `'done'`。
 */
export type MessageStatus = 'done' | 'aborted' | 'error'

/** 消息格式 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      /** 一次工具调用：模型要求调 → result 为空；跑完 → 填 result */
      type: 'tool'
      /** 工具调用 id，和 ToolMessage.tool_call_id 对应 */
      id: string
      /** 工具名 */
      name: string
      /** 调用参数（模型给的原始对象） */
      args: unknown
      /** 工具返回的文本；还没跑完是 null */
      result: string | null
      /** running：正在跑；done：跑完；error：工具报错 */
      status: 'running' | 'done' | 'error'
    }
  | { type: 'error'; message: string; source: 'model' | 'internal' }
  | { type: 'unknown'; rawType: string; raw: unknown }

/** 消息用量 */
export interface MessageUsage {
  /** 输入Token */
  inputTokens?: number
  /** 输出Token */
  outputTokens?: number
  /** 缓存读Token */
  cacheReadTokens?: number
  /** 缓存写Token */
  cacheWriteTokens?: number
  /** 总Token */
  totalTokens?: number
}

/** 消息元数据 */
export interface MessageMetadata {
  /** 模型名 */
  model?: string
  /** 模型供应商 */
  provider?: string
  /** 用量 */
  usage?: MessageUsage
}

/** 一条给界面看的历史消息 */
export interface MessageView {
  /**
   * 唯一标识符。
   * 来自 langchain 消息的 `id`；它没有时投影兜底成 `msg-序号`，
   * 保证同一条消息每次投影出来的 id 都一样。
   */
  id: string
  /** 角色 */
  role: MessageRole
  /** 内容块 */
  content: ContentBlock[]
  /** 状态：缺省 'done' */
  status: MessageStatus
  /** 元数据（模型名、用量） */
  metadata: MessageMetadata | null
  /**
   * 这条用户消息是生成期间「插入」进去的，而不是正常发的一条。
   *
   * 存在 LangChain 消息的 `additional_kwargs.insertFlag` 里，跟消息一起被 checkpoint 快照，
   * 所以重开对话也认得出它。缺省表示普通用户消息。
   */
  insertFlag?: boolean
}
