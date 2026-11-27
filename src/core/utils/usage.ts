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
  // 每个字段都兜 0:类型上它们都是必填,但 provider 实际会缺(尤其 total_tokens)。
  // 少兜一个,undefined 一进来就变 NaN,之后每次累加都是 NaN,整轮用量全废
  return {
    inputTokens: prev.inputTokens + (usage.input_tokens ?? 0),
    outputTokens: prev.outputTokens + (usage.output_tokens ?? 0),
    cacheReadTokens: prev.cacheReadTokens + (details?.cache_read ?? 0),
    cacheWriteTokens: prev.cacheWriteTokens + (details?.cache_creation ?? 0),
    totalTokens: prev.totalTokens + (usage.total_tokens ?? 0)
  }
}
