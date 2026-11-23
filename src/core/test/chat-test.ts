/**
 * 5 轮真实对话测试（测试三）
 *
 * 每轮一个独立会话，标题「测试新存储-1」到「测试新存储-5」，发送次数 1-5 次递增，
 * 内容覆盖纯问答、读文件、多次工具调用。每轮结束检查库里的消息、序号、工具配对、
 * 元信息、账本与体积。
 *
 * 会真实调用模型，产生费用。跑法：
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs src/core/test/chat-test.ts [数据库路径] [轮次]
 *   Remove-Item Env:\ELECTRON_RUN_AS_NODE
 *
 * 不传路径时用临时库（每轮从零开始，不污染开发库）。
 * 只跑某一轮：第二个参数传 1-5。
 */
import { loadEnvFile } from 'node:process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { closeDatabase, getDatabase, openDatabase } from '@main/database'
import { DEFAULT_WORKSPACE_ID } from '@main/database/init/data'
import { disposeCore, initCore } from '../index'
import { getChatGraph } from '../graph/chat'

const MESSAGES = 'hy_message'
const CONVERSATIONS = 'hy_conversation'

/** 每轮发几条、发什么 */
const PLAN: { round: number; sends: string[] }[] = [
  { round: 1, sends: ['你好，用一句话说明你自己是什么。'] },
  {
    round: 2,
    sends: ['用一句话说明你是什么。', '读一下项目根目录的 README.md，告诉我里面写了什么。']
  },
  {
    round: 3,
    sends: [
      '用一句话说明你是什么。',
      '读一下 package.json，告诉我项目名和用了哪些主要依赖。',
      '刚才那个 README 里提到的第一句话是什么？'
    ]
  },
  {
    round: 4,
    sends: [
      '看一下项目根目录有哪些文件。',
      '读一下 .editorconfig 的内容。',
      '读一下 tsconfig.json。',
      '对比 .editorconfig 和 tsconfig.json，说说它们各自管什么。'
    ]
  },
  {
    round: 5,
    sends: [
      '先读一下 README.md。',
      '再看一下 package.json 里的 scripts。',
      '这两个文件里，哪个提到了 pnpm？',
      '把前面读到的内容用三句话总结一下。',
      '最后，用一句话说明你刚才一共读了几次文件。'
    ]
  }
]

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`    ok   ${name}`)
  } else {
    failed += 1
    console.log(`    FAIL ${name}${detail === undefined ? '' : ` | ${detail}`}`)
  }
}

/** 建一个会话行 */
function createConversation(database: ReturnType<typeof getDatabase>, title: string): string {
  const id = randomUUID()
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO ${CONVERSATIONS} (id, workspace_id, group_id, title, sort_index, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`
    )
    .run(id, DEFAULT_WORKSPACE_ID, title, -now, now, now)
  return id
}

/** 检查一个会话落库结果 */
function inspect(database: ReturnType<typeof getDatabase>, conversationId: string): void {
  const rows = database
    .prepare(
      `SELECT seq, source_data, message, metadata, expand, created_at
       FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq`
    )
    .all(conversationId) as {
    seq: number
    source_data: string
    message: string
    metadata: string
    expand: string
    created_at: number
  }[]

  check('消息条数 > 0', rows.length > 0, String(rows.length))
  check(
    'seq 从 1 连续无空洞',
    rows.every((row, index) => row.seq === index + 1),
    rows.map((row) => row.seq).join(',')
  )

  const parsed = rows.map((row) => JSON.parse(row.message) as Record<string, unknown>)
  const callIds = new Set<string>()
  for (const item of parsed) {
    const calls = (item.tool_calls as { id?: string }[] | undefined) ?? []
    for (const call of calls) if (call.id !== undefined) callIds.add(call.id)
  }
  const toolResults = parsed.filter((item) => typeof item.tool_call_id === 'string')
  const broken = toolResults.filter((item) => !callIds.has(String(item.tool_call_id)))
  check(
    '工具调用与结果全部配对',
    broken.length === 0,
    `${toolResults.length} 条结果 / ${broken.length} 断链`
  )

  const metas = rows.map((row) => JSON.parse(row.metadata) as { source?: string; step?: number })
  check(
    'metadata 都有 source / step',
    metas.every((meta) => typeof meta.source === 'string' && typeof meta.step === 'number')
  )

  const expands = rows.map((row) => JSON.parse(row.expand) as { status?: string })
  check(
    'expand.status 都是 message',
    expands.every((item) => item.status === 'message'),
    expands.map((item) => item.status).join(',')
  )

  const ledger = database
    .prepare(`SELECT langgraph_state FROM ${CONVERSATIONS} WHERE id = ?`)
    .get(conversationId) as { langgraph_state: string }
  const parsedLedger = JSON.parse(ledger.langgraph_state) as {
    checkpoint_id?: string
    channel_versions?: unknown
    versions_seen?: unknown
  }
  check('账本已写入', typeof parsedLedger.checkpoint_id === 'string')
  check(
    '账本含 channel_versions / versions_seen',
    parsedLedger.channel_versions !== undefined && parsedLedger.versions_seen !== undefined
  )

  const bytes = rows.reduce(
    (sum, row) =>
      sum + row.source_data.length + row.message.length + row.metadata.length + row.expand.length,
    0
  )
  console.log(
    `    ${rows.length} 条消息 / ${Math.round(bytes / 1024)} KB / 账本 ${ledger.langgraph_state.length} 字节`
  )
  check(
    '平均每条 < 20 KB（没有重复放大）',
    bytes / rows.length < 20 * 1024,
    `${Math.round(bytes / rows.length)} 字节/条`
  )
}

async function runRound(
  database: ReturnType<typeof getDatabase>,
  graph: ReturnType<typeof getChatGraph>,
  plan: { round: number; sends: string[] }
): Promise<void> {
  const title = `测试新存储-${plan.round}`
  const conversationId = createConversation(database, title)
  console.log(
    `\n[第 ${plan.round} 轮] ${title} | 会话 ${conversationId} | 发 ${plan.sends.length} 次`
  )

  const config = { configurable: { thread_id: conversationId } }
  for (const [index, text] of plan.sends.entries()) {
    console.log(`  -> 第 ${index + 1} 次: ${text}`)
    try {
      const result = await graph.invoke({ messages: [new HumanMessage({ content: text })] }, config)
      const messages = (result.messages ?? []) as BaseMessage[]
      const last = messages[messages.length - 1]
      const preview = typeof last?.content === 'string' ? last.content.slice(0, 60) : ''
      console.log(`     <- ${last?.type}: ${preview.replace(/\n/g, ' ')}`)
    } catch (err) {
      console.log(`     !! 调用失败: ${err instanceof Error ? err.message : String(err)}`)
      failed += 1
    }
  }

  inspect(database, conversationId)
}

async function main(): Promise<void> {
  // 读项目根的 .env | 用 Node 自带的 loadEnvFile，不依赖 dotenv（Electron 的 Node 模式里解析不到它）
  try {
    loadEnvFile()
  } catch {
    console.log('没读到 .env | 用当前环境变量')
  }

  if (process.env.API_KEY === undefined || process.env.API_KEY === '') {
    console.error('缺少 API_KEY | 先在项目根 .env 里配好 API_URL / API_KEY / API_MODEL')
    process.exit(1)
  }

  const dbPath = process.argv[2] ?? join(tmpdir(), 'huanyu-chat-test', 'memory.db')
  const only = process.argv[3] === undefined ? undefined : Number.parseInt(process.argv[3], 10)
  const logDir = join(tmpdir(), 'huanyu-chat-test', 'logs')
  mkdirSync(logDir, { recursive: true })
  if (process.argv[2] === undefined && existsSync(dbPath)) rmSync(dbPath, { force: true })

  console.log(`数据库: ${dbPath}`)
  console.log(`模型: ${process.env.API_MODEL ?? '(未设置)'}`)

  const database = await openDatabase(dbPath)
  initCore({ database, logDir })
  const graph = getChatGraph()

  try {
    for (const plan of PLAN) {
      if (only !== undefined && plan.round !== only) continue
      await runRound(database, graph, plan)
    }

    console.log('\n[总览]')
    const summary = database
      .prepare(
        `SELECT c.title, c.id,
                (SELECT COUNT(*) FROM ${MESSAGES} m WHERE m.conversation_id = c.id) AS n,
                LENGTH(c.langgraph_state) AS ledger
         FROM ${CONVERSATIONS} c WHERE c.title LIKE '测试新存储-%' ORDER BY c.title`
      )
      .all() as { title: string; id: string; n: number; ledger: number }[]
    console.log('  标题            消息数  账本字节')
    for (const row of summary) {
      console.log(
        `  ${row.title.padEnd(16)}${String(row.n).padStart(6)}${String(row.ledger).padStart(9)}`
      )
    }
  } finally {
    disposeCore()
    closeDatabase()
  }

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
