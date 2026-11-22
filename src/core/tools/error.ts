import { ToolMessage } from '@langchain/core/messages'
import type { ToolRuntime } from '@langchain/core/tools'

/**
 * 工具失败时返回的 ToolMessage。
 *
 * 为什么不直接返回一段字符串：ToolNode 只要没收到异常就记 `status: 'success'`
 * （见 `@langchain/langgraph` 的 `tool_node.js`），数据库里就看不出这次调用失败了。
 * 自己返回 ToolMessage 才能既保留原始错误文案、又把 status 标成 `error`，
 * 同时图照常继续跑——不会像抛异常那样中断整轮对话。
 */
export function toolError(runtime: ToolRuntime, message: string): ToolMessage {
  return new ToolMessage({
    status: 'error',
    content: message,
    // 只有 ToolNode 调用时才会带 toolCallId；直接 invoke（自检脚本之类）时给空串兜底
    tool_call_id: runtime.toolCallId ?? '',
    name: runtime.toolCall?.name
  })
}
