/**
 * 解析JSON
 *
 * 解析失败或不是对象一律当空对象
 */
export function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
