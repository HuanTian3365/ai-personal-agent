import type { BaseMessage } from '@langchain/core/messages'
import type { AIMessage, ToolMessage } from '@langchain/core/messages'
import type {
  MessageView,
  ContentBlock,
  MessageMetadata,
  MessageRole,
  MessageStatus,
  MessageUsage
} from '@shared/types/messages'
import { parseContent } from './parseStream'

/**
 * LangChain 消息 → 界面用的 MessageView。
 *
 * 这是新体系里**唯一**的转换方向：进来出去都是 `BaseMessage`，
 * 只有「给渲染层看」的时候才投影成 MessageView。不再有 toLangchain / buildContext 那一套往返。
 *
 * 代价是 MessageView 里有些东西 LangChain 没有（`status`、error / unknown block），
 * 所以 `status` / 中断标记放在 `additional_kwargs` 里，跟消息一起被快照。
 */

/** LangChain 的 role → 项目的 role */
const ROLE_MAP: Record<string, MessageRole> = {
  human: 'user',
  ai: 'assistant',
  system: 'system',
  tool: 'tool'
}

/** 把 LangChain 的 content 摊平成项目的 ContentBlock[] */
function toBlocks(message: BaseMessage): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const content = message.content

  // 工具结果：ToolNode 跑完落库的那条消息，整条就是这个工具的输出。
  // 单独成一个 tool 块，不再走下面的 content → text，否则界面上会重复一遍
  if (message.getType() === 'tool') {
    const toolMessage = message as ToolMessage
    blocks.push({
      type: 'tool',
      id: toolMessage.tool_call_id,
      name: toolMessage.name ?? 'tool',
      args: null,
      result: parseContent(toolMessage.content),
      status: toolMessage.status === 'error' ? 'error' : 'done'
    })
    return blocks
  }

  if (typeof content === 'string') {
    if (content !== '') blocks.push({ type: 'text', text: content })
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') {
        if (part !== '') blocks.push({ type: 'text', text: part })
        continue
      }
      const block = part as { type?: unknown; text?: unknown }
      if (block.type === 'text' && typeof block.text === 'string') {
        if (block.text !== '') blocks.push({ type: 'text', text: block.text })
      } else if (block.type === 'reasoning' && typeof block.text === 'string') {
        blocks.push({ type: 'reasoning', text: block.text })
      } else {
        // 不认识的形状原样留着，界面会走 MessageBlockUnknown
        blocks.push({ type: 'unknown', rawType: String(block.type ?? 'unknown'), raw: part })
      }
    }
  }

  // 模型的工具调用意图：参数投出来，界面才知道她调了什么、带了什么参数。
  // 结果在随后那条 tool 消息里（见上面的分支），所以这里 result 留 null
  const toolCalls = (message as AIMessage).tool_calls
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      blocks.push({
        type: 'tool',
        id: call.id ?? '',
        name: call.name,
        args: call.args,
        result: null,
        status: 'done'
      })
    }
  }

  // 思考内容：OpenAI 兼容接口（含 qwen / deepseek）放在 additional_kwargs.reasoning_content
  const reasoning = message.additional_kwargs?.reasoning_content
  if (typeof reasoning === 'string' && reasoning !== '') {
    blocks.unshift({ type: 'reasoning', text: reasoning })
  }

  // 兜底：一条什么都没有的消息不能落成空气泡，否则用户只看到一片空白
  if (blocks.length === 0) {
    const errorMessage = message.additional_kwargs?.error_message
    blocks.push({
      type: 'error',
      source: 'model',
      message:
        typeof errorMessage === 'string' && errorMessage !== ''
          ? `这一轮出错了：${errorMessage}`
          : '这条消息没有内容（可能中断过早，或模型只产生了思考）。可以再发一次，或者换个说法。'
    })
  }

  return blocks
}

/** usage_metadata → 项目的 MessageUsage */
function toUsage(message: BaseMessage): MessageUsage | undefined {
  // usage_metadata 只在 AI 消息上有，BaseMessage 上不存在
  const usage = (message as AIMessage).usage_metadata
  if (usage === undefined) return undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    cacheReadTokens: usage.input_token_details?.cache_read,
    cacheWriteTokens: usage.input_token_details?.cache_creation
  }
}

/** 把 response_metadata / usage 收进项目的 metadata */
function toMetadata(message: BaseMessage): MessageMetadata | null {
  const usage = toUsage(message)
  const response = (message.response_metadata ?? {}) as Record<string, unknown>
  const metadata: MessageMetadata = {}

  if (typeof response.model_name === 'string') metadata.model = response.model_name
  if (typeof response.model_provider === 'string') metadata.provider = response.model_provider
  if (usage !== undefined) metadata.usage = usage

  return Object.keys(metadata).length === 0 ? null : metadata
}

/** 从 additional_kwargs 里读我们写的状态标记 */
function toStatus(message: BaseMessage): MessageStatus {
  const status = message.additional_kwargs?.status
  return status === 'aborted' || status === 'error' ? status : 'done'
}

/** 这条用户消息是不是生成期间「插入」进去的（标记落在 additional_kwargs.insertFlag 里） */
function isInsert(message: BaseMessage): boolean {
  return message.additional_kwargs?.insertFlag === true
}

/**
 * 投影一条 LangChain 消息。
 *
 * id 直接用消息自己的：LangGraph 落库时保证有，没有就是数据本身有问题，不在这儿补。
 */
export function toChatMessage(message: BaseMessage): MessageView {
  const view: MessageView = {
    id: message.id as string,
    role: ROLE_MAP[message.getType()] ?? 'system',
    content: toBlocks(message),
    status: toStatus(message),
    metadata: toMetadata(message)
  }
  if (isInsert(message)) view.insertFlag = true
  return view
}

/** 批量投影：state 里的 messages 数组 → 界面要的历史 */
export function toChatMessages(messages: readonly BaseMessage[]): MessageView[] {
  const views: MessageView[] = []
  /** tool_call_id → 那条助手消息里的工具块，工具结果回来时填回去 */
  const toolBlocks = new Map<string, Extract<ContentBlock, { type: 'tool' }>>()

  for (const message of messages) {
    // 工具结果不单独成条：填进调用它的那个工具块，界面上一次调用只占一行
    if (message.getType() === 'tool') {
      const toolMessage = message as ToolMessage
      const block = toolBlocks.get(toolMessage.tool_call_id)
      if (block !== undefined) {
        block.result = parseContent(toolMessage.content)
        block.status = toolMessage.status === 'error' ? 'error' : 'done'
        continue
      }
      // 找不到对应调用（比如历史被裁剪过）：还是把它显示出来，别把内容丢了
      views.push(toChatMessage(message))
      continue
    }

    const view = toChatMessage(message)
    for (const block of view.content) {
      if (block.type === 'tool' && block.id !== '') toolBlocks.set(block.id, block)
    }
    views.push(view)
  }

  return views
}

/**
 * 把「一轮」里的消息投影成界面上的一条助手气泡。
 *
 * 带工具调用的一轮在 checkpoint 里是好几条消息（AI 要工具 → tool 结果 → AI 正文），
 * 界面只该看到一条气泡，所以顺序把它们的 content 拼起来；工具结果已经在
 * `toChatMessages` 里归并进对应的工具块了。
 */
export function toMergedAssistantView(messages: readonly BaseMessage[]): MessageView | null {
  const assistants = toChatMessages(messages).filter((view) => view.role === 'assistant')
  if (assistants.length === 0) return null

  const last = assistants[assistants.length - 1]
  return {
    ...last,
    content: assistants.flatMap((view) => view.content)
  }
}
