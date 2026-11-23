/**
 * 临时调试打印：把某些字段的值落到 log/debug.json。
 *
 * 和对话日志（utils/log.ts）不是一回事——这里不管一轮对话，纯粹是想看什么就记什么。
 * 两种写法输出同一种格式——JSON 数组 `[{ "index": 0, "content": ... }]`：
 * debugContent 追加到已有记录之后（保留历史）、debugContentRewrite 覆盖成全新的。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 调试目录，相对 cwd（dev 下就是项目根）。打包后 cwd 可能指向安装目录，和 log.ts 是同一个问题 */
const LOG_DIR = 'log'
const LOG_FILE = join(LOG_DIR, 'debug.json')

/** 数组里的一条记录 */
interface DebugRecord {
  /** 该条在数组里的下标 全局递增 */
  index: number
  content: unknown
}

/** 追加队列 | 读-改-写不是原子操作 用它把并发调用串成一条线 否则后写的会吃掉先写的 */
let queue: Promise<void> = Promise.resolve()

/**
 * 把内容追加到 log/debug.json 的记录末尾，保留上一次的内容。
 *
 * 文件内容始终是一个合法 JSON 数组，每次调用把参数按顺序接到数组尾部：
 *
 * ```json
 * [
 *   { "index": 0, "content": { ... } },
 *   { "index": 1, "content": { ... } }
 * ]
 * ```
 *
 * 参数不限类型、不限个数；`index` 是该条在数组里的下标，一眼能看出先后与条数。
 * 内部吞掉所有异常：调试代码不能影响主流程。
 */
export async function debugContent(...content: unknown[]): Promise<void> {
  queue = queue.then(() => appendRecords(content)).catch(() => {})
  return queue
}

/**
 * 把内容重写到 log/debug.json——覆盖上一次的内容，不保留历史。
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
    const records = content.map((item, index) => ({ index, content: item }))
    await writeFile(LOG_FILE, buildJson(records), 'utf8')
  } catch {
    // 静默：调试输出失败无所谓
  }
}

/** 读已有记录 -> 追加本次参数 -> 整体重写 | 一条记录就是一个 DebugRecord */
async function appendRecords(content: unknown[]): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true })
    const records = await readRecords()
    const start = records.length
    content.forEach((item, offset) => {
      records.push({ index: start + offset, content: item })
    })
    await writeFile(LOG_FILE, buildJson(records), 'utf8')
  } catch {
    // 静默：调试输出失败无所谓
  }
}

/** 读已有记录 | 文件不存在、不是合法 JSON、不是数组 一律从空数组开始 */
async function readRecords(): Promise<DebugRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(LOG_FILE, 'utf8'))
    return Array.isArray(parsed) ? (parsed as DebugRecord[]) : []
  } catch {
    return []
  }
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
 * 把记录拼成 JSON 数组
 *
 * 整体 stringify 撞上循环引用会抛，那时退一步把每个 content 换成字符串再拼，
 * 保证至少能落到文件里。
 */
function buildJson(records: DebugRecord[]): string {
  try {
    return JSON.stringify(records, null, 2) + '\n'
  } catch {
    const fallback = records.map((record) => ({
      index: record.index,
      content: stringifySafe(record.content)
    }))
    return JSON.stringify(fallback, null, 2) + '\n'
  }
}
