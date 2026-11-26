/**
 * JSON相关
 *
 * 纯JS没有node内置依赖, 所以放shared是安全的: renderer引了也照样能跑.
 * 反过来引node:fs一类的就不要放这里, 见main/lib/file.ts的说明.
 */

/**
 * JSON.stringify的安全版
 *
 * 撞上循环引用会抛, 那时退一步转成字符串, 保证至少有个能落盘的结果.
 *
 * @param value 任意值
 */
export function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
