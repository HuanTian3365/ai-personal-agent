/**
 * 原始模型输出落盘，用来排查问题。
 *
 * 记的是 provider 给的原样字段（content / reasoning_content / usage），
 * 不是我们转换后的 MessageView —— 出问题时能直接看出模型到底返回了什么。
 *
 * 状态收在闭包里：一轮对话开一个句柄（`createDebugLog`），过程中只调 `debugLogStep`
 * 往里记，结束时 `debugLogFlush` 一次性写盘。调用方不再自己持有数组。
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AIMessage, BaseMessage } from '@langchain/core/messages'

/**
 * 日志目录。由 main 在 `initCore` 时注入（打包 `~/.huanyu/logs`，开发 `~/.huanyu-dev/logs`）：
 * core 不依赖 Electron，拿不到 `app.getPath`，路径只能从外面给。
 */
let logDir = 'log'

/** 设置日志目录。注入之前用默认值，保证脱离应用单独跑（`pnpm test`）也不炸 */
export function setLogDir(dir: string): void {
  logDir = dir
}

/** 一次对话之间的分隔线 */
const SEPARATOR = '='.repeat(10)

/** 一轮对话的调试日志句柄。只对外暴露「记一笔」和「最后写盘」 */
export interface DebugLog {
  /** 记一步原始模型输出（provider 原样字段） */
  debugLogStep: (message: BaseMessage) => void
  /** 记整轮失败的错误信息 */
  debugLogError: (error: unknown) => void
  /** 把这一轮记下的内容一次性追加到 log/log.txt */
  debugLogFlush: () => Promise<void>
}

/**
 * 开一轮调试日志。
 *
 * 每轮对话开一个：数据在闭包里，并发跑多个会话也不会互相串。
 * 记什么都不碰磁盘，只有 `debugLogFlush` 才真正写。
 */
export function createDebugLog(conversationId: string): DebugLog {
  const steps: unknown[] = []
  let error: string | undefined

  return {
    debugLogStep(message) {
      const assistant = message as AIMessage
      // 记录 provider 原样字段：出问题时能直接看出模型到底返回了什么
      steps.push({
        content: assistant.content,
        additional_kwargs: assistant.additional_kwargs ?? {},
        response_metadata: assistant.response_metadata ?? {},
        usage_metadata: assistant.usage_metadata ?? null
      })
    },

    debugLogError(err) {
      error = err instanceof Error ? err.message : String(err)
    },

    async debugLogFlush() {
      await appendAgentLog({ conversationId, steps, error })
    }
  }
}

interface AgentLogEntry {
  conversationId: string
  /** 每一步的原始模型输出 */
  steps: readonly unknown[]
  /** 整轮失败时的错误信息 */
  error?: string
}

/** 追加一次对话的原始输出。内部吞掉所有异常：日志不能影响对话本身 */
async function appendAgentLog(entry: AgentLogEntry): Promise<void> {
  try {
    await mkdir(logDir, { recursive: true })

    const parts: string[] = [SEPARATOR]
    parts.push(`time: ${new Date().toISOString()}`)
    parts.push(`conversation: ${entry.conversationId}`)
    if (entry.error !== undefined) parts.push(`error: ${entry.error}`)
    parts.push(`steps: ${entry.steps.length}`)

    entry.steps.forEach((step, index) => {
      parts.push(`--- step ${index + 1} ---`)
      parts.push(stringifySafe(step))
    })

    parts.push('')
    await appendFile(join(logDir, 'log.txt'), parts.join('\n') + '\n', 'utf8')
  } catch {
    // 静默：日志失败无所谓
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
