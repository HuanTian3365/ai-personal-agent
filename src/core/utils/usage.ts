/**
 * 用量累加。
 *
 * 一次模型调用给一份 usage_metadata，累加进上一份用量；没有就给回原样。
 * 实时（loop）与历史（historyMessage）共用这一份算法，免得两边算出来的数不一样。
 */
import type { AIMessage } from '@langchain/core/messages'
import type { MessageUsage } from '@shared/types/message'

/**
 * 累加一次模型调用的用量
 *
 * @param prev 上一份用量
 * @param usage provider 给的 usage_metadata | 缺了原样返回 prev
 */
export function addUsage(prev: MessageUsage, usage: AIMessage['usage_metadata']): MessageUsage {
  if (usage === undefined) return prev
  const details = usage.input_token_details
  return {
    inputTokens: prev.inputTokens + usage.input_tokens,
    outputTokens: prev.outputTokens + usage.output_tokens,
    cacheReadTokens: prev.cacheReadTokens + (details?.cache_read ?? 0),
    cacheWriteTokens: prev.cacheWriteTokens + (details?.cache_creation ?? 0),
    totalTokens: prev.totalTokens + usage.total_tokens
  }
}
