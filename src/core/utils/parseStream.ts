/**
 * 解析 loop 的流式输出。
 *
 * LangGraph 的 messages 流每轮推来一个 chunk：正文在 content 里，
 * 思考被 provider 塞在 additional_kwargs.reasoning_content 里。
 * 这两个函数各抠一样。
 */

/**
 * 取正文增量。
 *
 * content 可能是字符串，也可能是 block 数组——OpenAI 兼容接口两种形态都会出现，
 * 取决于模型返回的是纯文本还是多段内容。
 */
export function parseContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    if (block !== null && typeof block === 'object') {
      const record = block as Record<string, unknown>
      if (record.type === 'text' && typeof record.text === 'string') {
        parts.push(record.text)
      }
    }
  }
  return parts.join('\n')
}

/**
 * 取思考增量。
 *
 * glm / deepseek 这类模型把思考放在 additional_kwargs.reasoning_content，
 * 不在 content 里——只读 content 会把它整段丢掉（见 docs/待实现/05.BUG）。
 */
export function parseReasoning(chunk: { additional_kwargs?: Record<string, unknown> }): string {
  const value = chunk.additional_kwargs?.['reasoning_content']
  return typeof value === 'string' ? value : ''
}
