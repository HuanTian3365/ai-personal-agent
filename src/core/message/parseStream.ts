/**
 * 消息内容提取 | 从LangChain消息里取出正文与思考
 *
 * 调用方:loop(流式chunk与工具结果)historyMessage(历史投影)title(标题文本)test(自检)
 * 所以这里不假设chunk形态 | 只要对象带对应字段就能用
 * 两个函数都只返回string|取不到就是空串,从不抛错
 */

/**
 * 取正文
 *
 * content有两种形态:纯文本给string,多段内容给block数组(OpenAI兼容接口两种都会出现)
 * 数组里只认type:'text'的block,其他类型(image_url工具片段等)一律跳过
 * 多段之间用\n拼接,取不到返回空串
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
 * 取思考
 *
 * glm|deepseek这类模型把思考放在additional_kwargs.reasoning_content,不在content里
 * 只读content会把整段思考丢掉(踩过,见docs/待实现/05.BUG)
 * 参数不要求BaseMessage|任何带additional_kwargs的对象都能用
 */
export function parseReasoning(chunk: { additional_kwargs?: Record<string, unknown> }): string {
  const value = chunk.additional_kwargs?.['reasoning_content']
  return typeof value === 'string' ? value : ''
}
