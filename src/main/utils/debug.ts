/**
 * 临时调试打印：把某些字段的值落到 log/debug.txt。
 *
 * 和对话日志（utils/log.ts）不是一回事——这里不管一轮对话，纯粹是想看什么就记什么。
 * 两种写法：debugContent 追加纯文本（带分隔线）、debugContentRewrite 覆盖成 JSON 数组。
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 调试目录，相对 cwd（dev 下就是项目根）。打包后 cwd 可能指向安装目录，和 log.ts 是同一个问题 */
const LOG_DIR = 'log'
const LOG_FILE = join(LOG_DIR, 'debug.txt')

/** 每次调用的分隔线 */
const SEPARATOR = '='.repeat(20)

/** 参数之间的分隔：参数位置 + 5 个等号 */
const ITEM_SEPARATOR = '='.repeat(5)

/**
 * 把内容全量追加到 log/debug.txt。
 *
 * 参数不限类型、不限个数；每段前面标上它在参数里的位置（从 0 起），
 * 方便一次传好几个值时看清哪段是哪个。
 * 内部吞掉所有异常：调试代码不能影响主流程。
 */
export async function debugContent(...content: unknown[]): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true })
    await appendFile(LOG_FILE, buildBlock(content), 'utf8')
  } catch {
    // 静默：调试输出失败无所谓
  }
}

/**
 * 把内容重写到 log/debug.txt——覆盖上一次的内容，不保留历史。
 *
 * 存成 JSON 数组，不带分隔符、不带时间戳：
 *
 * ```json
 * [
 *   { "index": 0, "content": { ... } },
 *   { "index": 1, "content": { ... } }
 * ]
 * ```
 *
 * `index` 是参数在调用里的位置（从 0 起）；每次调用先清空文件，只留最近一次的内容。
 * 内部同样吞掉所有异常。
 */
export async function debugContentRewrite(...content: unknown[]): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true })
    await writeFile(LOG_FILE, buildJson(content), 'utf8')
  } catch {
    // 静默：调试输出失败无所谓
  }
}

/** debugContent 用的分段文本：分隔线 + 时间 + 每个参数一段 */
function buildBlock(content: unknown[]): string {
  const parts: string[] = [SEPARATOR, `time: ${new Date().toISOString()}`]
  content.forEach((item, index) => {
    parts.push(`${index}${ITEM_SEPARATOR}`)
    parts.push(stringifySafe(item))
  })
  parts.push('')
  return parts.join('\n') + '\n'
}

/** JSON.stringify 遇到循环引用会抛，兜一层 */
function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * 拼成 JSON 数组：[{ index, content }, ...]
 *
 * 整体 stringify 撞上循环引用会抛，那时退一步把每个 content 换成字符串再拼，
 * 保证至少能落到文件里。
 */
function buildJson(content: unknown[]): string {
  try {
    return JSON.stringify(content.map((item, index) => ({ index, content: item })), null, 2) + '\n'
  } catch {
    const fallback = content.map((item, index) => ({ index, content: stringifySafe(item) }))
    return JSON.stringify(fallback, null, 2) + '\n'
  }
}
