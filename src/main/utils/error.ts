/**
 * 错误文案
 *
 * 原始报错多是英文(SQLite/fs/Electron) 用户看不懂 | 前面补一句人话 说清哪一步失败
 * 只给意外异常用 | 业务失败自己有文案 不要走这里
 */
export function errorText(what: string, err: unknown): string {
  return `${what}失败：${err instanceof Error ? err.message : String(err)}`
}
