import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ToolMessage } from '@langchain/core/messages'
import { tool, type ToolRuntime } from '@langchain/core/tools'
import { z } from 'zod'
import { toolError } from './error'

/**
 * 文件系统类工具：读 / 写 / 局部替换 / 按名字找 / 按内容找。
 *
 * 所有工具**不抛异常**：文件不存在、路径写错、旧文本找不到都属于可预期的操作失败，
 * 抛出去会让整轮对话断掉。失败时返回 error 状态的 ToolMessage——只返回字符串的话，
 * ToolNode 会把它记成 success，数据库里就看不出这次调用失败了。
 */

/** 工具里的相对路径一律按项目根（进程工作目录）解析 */
function resolveToolPath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input)
}

/** 递归时跳过的目录：太大、扫进去既慢又没意义 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'data', 'log'])

/** 各种上限，防止一次调用把上下文撑爆 */
const MAX_READ_LINES = 2000
const MAX_LIST_ENTRIES = 200
const MAX_GREP_MATCHES = 250
const MAX_LINE_CHARS = 300
/** 一次 read 最多带几个文件 */
const MAX_BATCH_FILES = 10

/** 把 glob 模式转成正则：支持 `**`、`*`、`?`，其余按字面匹配 */
function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  let out = ''

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        // `**/` 可以跨任意层目录，单独的 `**` 就是任意字符
        if (normalized[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (ch === '?') {
      out += '[^/]'
      continue
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  return new RegExp(`^${out}$`)
}

/** 递归收集目录下的文件（绝对路径），最多 limit 个 */
async function collectFiles(root: string, limit: number): Promise<string[]> {
  const files: string[] = []

  async function visit(dir: string): Promise<void> {
    if (files.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= limit) return
      const abs = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await visit(abs)
        continue
      }
      if (entry.isFile()) files.push(abs)
    }
  }

  await visit(root)
  return files
}

/** 绝对路径 → 相对项目根、正斜杠的形式，给模型看 */
function toDisplayPath(abs: string): string {
  return relative(process.cwd(), abs).split(sep).join('/')
}

/** 单文件读取结果：成功带正文，失败带原因 */
type ReadResult = { text: string } | { error: string }

/** 读文件：带行号返回，大文件分段 */
async function readOne(path: string, offset?: number, limit?: number): Promise<ReadResult> {
  const target = resolveToolPath(path)
  try {
    const text = await readFile(target, 'utf8')
    const lines = text.split('\n')
    const start = Math.max(0, (offset ?? 1) - 1)
    const slice = lines.slice(start, start + (limit ?? MAX_READ_LINES))

    if (slice.length === 0) {
      return { text: `（文件共 ${lines.length} 行，offset=${offset ?? 1} 已经超出末尾）` }
    }

    const numbered = slice.map((line, i) => `${start + i + 1}| ${line}`).join('\n')
    const rest = lines.length - start - slice.length
    if (rest <= 0) return { text: numbered }
    return {
      text: `${numbered}\n\n……（共 ${lines.length} 行，后面还有 ${rest} 行，用 offset=${start + slice.length + 1} 继续读）`
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** 读文件：一次可以读多个，读项目时不必一个文件一次调用 */
export const readTool = tool(
  async ({ path, paths, offset, limit }, runtime: ToolRuntime): Promise<string | ToolMessage> => {
    const targets = [...(path === undefined ? [] : [path]), ...(paths ?? [])]
    if (targets.length === 0) return toolError(runtime, '需要 path（一个文件）或 paths（多个文件）')

    const first = targets[0]
    if (targets.length === 1 && first !== undefined) {
      const single = await readOne(first, offset, limit)
      if ('error' in single) return toolError(runtime, `读取失败：${single.error}`)
      return single.text
    }

    const chunks: string[] = []
    const failures: string[] = []
    for (const target of targets.slice(0, MAX_BATCH_FILES)) {
      const result = await readOne(target, offset, limit)
      if ('error' in result) {
        failures.push(`- ${target}：${result.error}`)
        continue
      }
      chunks.push(`=== ${target} ===\n${result.text}`)
    }
    if (targets.length > MAX_BATCH_FILES) {
      chunks.push(`（一次最多读 ${MAX_BATCH_FILES} 个文件，剩下的再发一次）`)
    }
    if (failures.length > 0) {
      return toolError(runtime, [`读取失败 ${failures.length} 个文件：`, ...failures].join('\n'))
    }
    return chunks.join('\n\n')
  },
  {
    name: 'read',
    description:
      '读取文本文件，返回带行号的内容。一次可以给多个文件（paths），读项目时比一个文件调一次省事。相对路径按项目根目录解析；大文件用 offset / limit 分段读。',
    schema: z.object({
      path: z.string().optional().describe('单个文件路径'),
      paths: z.array(z.string()).optional().describe('要一次读的多个文件路径'),
      offset: z.number().int().positive().optional().describe('从第几行开始读，默认 1'),
      limit: z.number().int().positive().optional().describe('每个文件最多读多少行，默认 2000')
    })
  }
)

/** 整篇写入，父目录不存在会自动建 */
export const writeTool = tool(
  async ({ path, content }, runtime: ToolRuntime): Promise<string | ToolMessage> => {
    const target = resolveToolPath(path)
    try {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
      return `已写入 ${toDisplayPath(target)}（${content.length} 字符）`
    } catch (err) {
      return toolError(runtime, `写入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  },
  {
    name: 'write',
    description:
      '把整篇内容写入文本文件，文件已存在就整个覆盖，父目录不存在会自动创建。只想改一小段请用 edit，别用 write 重建整个文件。',
    schema: z.object({
      path: z.string().describe('文件路径，绝对路径或相对项目根'),
      content: z.string().describe('要写入的完整内容')
    })
  }
)

/** 局部替换：默认要求 oldString 在文件里唯一出现 */
export const editTool = tool(
  async (
    { path, oldString, newString, replaceAll },
    runtime: ToolRuntime
  ): Promise<string | ToolMessage> => {
    const target = resolveToolPath(path)
    try {
      const text = await readFile(target, 'utf8')
      const occurrences = text.split(oldString).length - 1

      if (occurrences === 0) {
        return toolError(
          runtime,
          '没有替换：oldString 在文件里找不到。先把要改的原文读出来，逐字照抄（包括缩进和空行）'
        )
      }
      if (occurrences > 1 && replaceAll !== true) {
        return toolError(
          runtime,
          `没有替换：oldString 在文件里出现了 ${occurrences} 次，无法确定改哪一处。把上下文写长一点，或者设 replaceAll=true 全改`
        )
      }

      const next =
        replaceAll === true
          ? text.split(oldString).join(newString)
          : text.replace(oldString, newString)
      await writeFile(target, next, 'utf8')
      return `已替换 ${replaceAll === true ? occurrences : 1} 处：${toDisplayPath(target)}`
    } catch (err) {
      return toolError(runtime, `替换失败：${err instanceof Error ? err.message : String(err)}`)
    }
  },
  {
    name: 'edit',
    description:
      '在文本文件里做一次局部替换：把 oldString 换成 newString，其余内容一动不动。oldString 必须和文件里的内容逐字一致（含缩进），且默认要求只出现一次。',
    schema: z.object({
      path: z.string().describe('文件路径，绝对路径或相对项目根'),
      oldString: z.string().min(1).describe('要被替换掉的原文，必须逐字一致'),
      newString: z.string().describe('替换成什么'),
      replaceAll: z
        .boolean()
        .optional()
        .describe('true = 把出现的每一处都换掉，默认只换唯一的那一处')
    })
  }
)

/** 按名字找文件 */
export const globTool = tool(
  async ({ pattern, path }): Promise<string> => {
    const root = resolveToolPath(path ?? '.')
    const regex = globToRegExp(pattern)
    const files = await collectFiles(root, MAX_LIST_ENTRIES * 5)

    const matched = files
      .map(toDisplayPath)
      .filter((rel) => regex.test(rel))
      .slice(0, MAX_LIST_ENTRIES)

    if (matched.length === 0) return `没有匹配到文件：${pattern}`
    return matched.join('\n')
  },
  {
    name: 'glob',
    description:
      '按文件名 / 路径模式找文件，支持 **（任意层目录）、*（同层任意字符）、?。例：src/**/*.ts。返回相对项目根的路径。',
    schema: z.object({
      pattern: z.string().describe('glob 模式，如 src/renderer/**/*.tsx'),
      path: z.string().optional().describe('从哪个目录开始找，默认项目根')
    })
  }
)

/** 按内容搜 */
export const grepTool = tool(
  async ({ pattern, path, include }, runtime: ToolRuntime): Promise<string | ToolMessage> => {
    let regex: RegExp
    try {
      regex = new RegExp(pattern)
    } catch (err) {
      return toolError(runtime, `正则不合法：${err instanceof Error ? err.message : String(err)}`)
    }

    const root = resolveToolPath(path ?? '.')
    const rootStat = await stat(root).catch(() => null)
    if (rootStat === null) return toolError(runtime, `路径不存在：${path ?? '.'}`)

    const files = rootStat.isFile() ? [root] : await collectFiles(root, MAX_LIST_ENTRIES * 5)
    const includeRegex = include === undefined ? null : globToRegExp(include)
    const matches: string[] = []

    for (const abs of files) {
      if (matches.length >= MAX_GREP_MATCHES) break
      const rel = toDisplayPath(abs)
      if (includeRegex !== null) {
        const name = rel.split('/').pop() ?? rel
        if (!includeRegex.test(name)) continue
      }

      let text: string
      try {
        text = await readFile(abs, 'utf8')
      } catch {
        continue
      }
      // 二进制文件读出来会带 \0，跳过
      if (text.includes('\u0000')) continue

      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i += 1) {
        if (!regex.test(lines[i])) continue
        matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, MAX_LINE_CHARS)}`)
        if (matches.length >= MAX_GREP_MATCHES) break
      }
    }

    if (matches.length === 0) return `没有匹配到内容：${pattern}`
    return matches.join('\n')
  },
  {
    name: 'grep',
    description:
      '按正则表达式在文件内容里搜索，返回「路径:行号: 内容」。path 可以是目录或单个文件；include 用来限定文件名模式（如 *.ts）。默认跳过 node_modules、.git 等目录。',
    schema: z.object({
      pattern: z.string().describe('正则表达式'),
      path: z.string().optional().describe('搜哪个目录或文件，默认项目根'),
      include: z.string().optional().describe('只搜文件名匹配这个 glob 的文件，如 *.ts')
    })
  }
)
