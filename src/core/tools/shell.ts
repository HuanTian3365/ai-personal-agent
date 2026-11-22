import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ToolMessage } from '@langchain/core/messages'
import { tool, type ToolRuntime } from '@langchain/core/tools'
import { z } from 'zod'
import { toolError } from './error'

/**
 * 执行 PowerShell 命令。
 *
 * 前台：跑完把输出返回给模型。后台：立刻返回任务 id，之后用同一个工具带 jobId 取输出。
 * 任务是进程内的（`jobs` 这张表），应用一重启就没了——这是有意的：别留无人看管的进程。
 */

const DEFAULT_TIMEOUT_MS = 120_000
/** 返回给模型的输出上限，超了留最后一段（报错一般在末尾） */
const MAX_OUTPUT_CHARS = 20_000

interface ShellJob {
  id: string
  command: string
  output: string
  status: 'running' | 'done' | 'failed' | 'killed'
  exitCode: number | null
}

const jobs = new Map<string, ShellJob>()

/**
 * 用哪个 shell：优先 PowerShell 7 的 `pwsh`，机器上没装就退回 Windows 自带的
 * `powershell.exe`（5.1）。硬写 `pwsh` 的后果是：没装 7 的机器上一调就 ENOENT，
 * 模型只能改用手动读文件，步数一多就撞上递归上限。
 */
const SHELL_CANDIDATES = ['pwsh', 'powershell.exe']

let resolvedShell: string | null = null

/** 试着启动一次看看这个 shell 能不能跑 */
function canRunShell(shell: string): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const child = spawn(shell, ['-NoLogo', '-NoProfile', '-Command', 'exit 0'], {
      windowsHide: true
    })
    child.once('error', () => resolveProbe(false))
    child.once('close', (code) => resolveProbe(code === 0))
  })
}

/** 探测一次并缓存：同一个进程里不用反复试 */
async function resolveShell(): Promise<string> {
  if (resolvedShell !== null) return resolvedShell

  for (const candidate of SHELL_CANDIDATES) {
    if (await canRunShell(candidate)) {
      resolvedShell = candidate
      return candidate
    }
  }
  throw new Error('找不到可用的 PowerShell：pwsh 与 powershell.exe 都启动不了')
}

/** 截断过长输出，保住尾部 */
function trimOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output
  return `……（输出共 ${output.length} 字符，只保留最后 ${MAX_OUTPUT_CHARS} 个）\n${output.slice(-MAX_OUTPUT_CHARS)}`
}

/** 起一个 pwsh 进程，返回任务记录和「跑完了」的 promise */
function startJob(
  shell: string,
  command: string,
  timeoutMs: number
): { job: ShellJob; done: Promise<ShellJob> } {
  const job: ShellJob = {
    id: randomUUID(),
    command,
    output: '',
    status: 'running',
    exitCode: null
  }

  const child = spawn(
    shell,
    [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      // 统一成 UTF-8：powershell.exe(5.1) 默认按系统代码页输出，中文会变成乱码
      `$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`
    ],
    {
      cwd: process.cwd(),
      windowsHide: true
    }
  )

  const append = (chunk: Buffer): void => {
    job.output += chunk.toString('utf8')
    // 后台任务可能跑很久，边收边丢旧内容，别让内存一路涨
    if (job.output.length > MAX_OUTPUT_CHARS * 4)
      job.output = job.output.slice(-MAX_OUTPUT_CHARS * 2)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const timer = setTimeout(() => {
    job.status = 'killed'
    child.kill()
  }, timeoutMs)

  const done = new Promise<ShellJob>((resolveDone) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveDone(job)
    }

    child.once('error', (err) => {
      job.status = 'failed'
      job.output += `\n启动失败：${err.message}`
      finish()
    })
    child.once('close', (code) => {
      if (job.status !== 'killed') job.status = code === 0 ? 'done' : 'failed'
      job.exitCode = code
      finish()
    })
  })

  return { job, done }
}

/** 把任务结果整成一段给模型看的文字 */
function describeJob(job: ShellJob): string {
  const status =
    job.status === 'running'
      ? '还在跑'
      : job.status === 'killed'
        ? `超时被终止${job.exitCode === null ? '' : `（退出码 ${job.exitCode}）`}`
        : `已结束，退出码 ${job.exitCode ?? '无'}`
  return [`$ ${job.command}`, `（${status}）`, trimOutput(job.output)].join('\n')
}

export const pwshTool = tool(
  async (
    { command, timeoutMs, background, jobId },
    runtime: ToolRuntime
  ): Promise<string | ToolMessage> => {
    // 取后台任务的进展
    if (jobId !== undefined && jobId !== '') {
      const job = jobs.get(jobId)
      if (job === undefined) {
        return toolError(runtime, `没有这个后台任务：${jobId}（应用重启后任务记录会清空）`)
      }
      // 任务失败或超时：内容照给，但状态标成 error
      if (job.status === 'failed' || job.status === 'killed') {
        return toolError(runtime, describeJob(job))
      }
      return describeJob(job)
    }

    if (command === undefined || command.trim() === '') {
      return toolError(
        runtime,
        '需要 command（要执行的 PowerShell 命令），或者 jobId（取某个后台任务的输出）'
      )
    }

    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS

    let shell: string
    try {
      shell = await resolveShell()
    } catch (err) {
      return toolError(runtime, err instanceof Error ? err.message : String(err))
    }

    const { job, done } = startJob(shell, command, timeout)
    jobs.set(job.id, job)

    if (background === true) {
      // 不 await：任务留在 jobs 里，之后用 jobId 来取
      void done.catch(() => {})
      return `已在后台启动（任务 id：${job.id}）。之后调用 pwsh 并带上 jobId="${job.id}" 就能取输出。`
    }

    const finished = await done
    // 非零退出码 / 超时被终止都算这次调用失败，但输出照旧给模型看
    if (finished.status === 'failed' || finished.status === 'killed') {
      return toolError(runtime, describeJob(finished))
    }
    return describeJob(finished)
  },
  {
    name: 'pwsh',
    description:
      '执行一条 PowerShell 命令并返回输出。命令在项目根目录下运行。默认超时 120 秒。命令可能跑很久（比如装依赖、启动服务）时设 background=true，它会立刻返回任务 id，之后用 jobId 取输出。',
    schema: z.object({
      command: z.string().optional().describe('要执行的 PowerShell 命令（读后台任务时不用给）'),
      timeoutMs: z.number().int().positive().optional().describe('超时毫秒数，默认 120000'),
      background: z.boolean().optional().describe('true = 后台运行，立刻返回任务 id'),
      jobId: z.string().optional().describe('取某个后台任务的输出与状态')
    })
  }
)
