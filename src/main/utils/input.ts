/**
 * 入参收口
 *
 * 跨进程传过来的东西一律当不可信 | 类型标注运行时不存在 只能自己判
 */

/** 取对象入参 | 不是对象返回null 由调用处给文案 */
export function objectInput(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object') return null
  return input as Record<string, unknown>
}
