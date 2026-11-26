/**
 * 迁移结果验证
 *
 * 对比迁移前后的库：会话数、消息条数、每条消息的类型与工具配对、账本完整性。
 * 只读，不改任何东西。
 *
 * 跑法：
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs src/core/test/verify-migration.ts "<迁移后的库>" ["<迁移前的备份>"]
 *   Remove-Item Env:\ELECTRON_RUN_AS_NODE
 *
 * 第二个参数不传时，自动在同目录找最新的 *.before-migrate-* 文件。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import type { BaseMessage, ToolMessage } from '@langchain/core/messages'
import { closeCheckpointStore, getCheckpointStore, openCheckpointStore } from '../graph/checkpoint'

const MESSAGES = 'hy_message'
const CONVERSATIONS = 'hy_conversation'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` | ${detail}`}`)
  }
}

function parseJson(value: Buffer | string): unknown {
  return JSON.parse(typeof value === 'string' ? value : value.toString('utf-8'))
}

/** 从迁移前的备份里读每个会话最新 checkpoint 的消息数 */
function readExpected(backupPath: string): Map<string, number> {
  const expected = new Map<string, number>()
  if (!existsSync(backupPath)) return expected
  const database = new BetterSqlite3(backupPath, { readonly: true })
  try {
    // 备份可能是「已经迁移过」的库 | 没有旧表就没什么可对比的
    const hasLegacy = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hy_checkpoints'`)
      .get() as { name: string } | undefined
    if (hasLegacy === undefined) return expected

    const rows = database
      .prepare(
        `SELECT c.thread_id, c.checkpoint FROM hy_checkpoints c
         JOIN (SELECT thread_id, MAX(checkpoint_id) AS id FROM hy_checkpoints
               WHERE checkpoint_ns = '' GROUP BY thread_id) latest
           ON c.thread_id = latest.thread_id AND c.checkpoint_id = latest.id
         WHERE c.checkpoint_ns = ''`
      )
      .all() as { thread_id: string; checkpoint: Buffer | string }[]
    for (const row of rows) {
      const checkpoint = parseJson(row.checkpoint) as { channel_values?: { messages?: unknown[] } }
      expected.set(row.thread_id, checkpoint.channel_values?.messages?.length ?? 0)
    }
  } finally {
    database.close()
  }
  return expected
}

/** 找最近一份「还带旧表」的备份 | 迁移后自动生成的备份没有旧表，拿来对比没有意义 */
function findBackup(dbPath: string): string | undefined {
  const directory = dirname(dbPath)
  const prefix = `${basename(dbPath)}.before-migrate-`
  const candidates = readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(directory, name))
    .sort()
    .reverse()
  for (const candidate of candidates) {
    try {
      const database = new BetterSqlite3(candidate, { readonly: true })
      const hasLegacy = database
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hy_checkpoints'`)
        .get() as { name: string } | undefined
      database.close()
      if (hasLegacy !== undefined) return candidate
    } catch {
      // 打不开就试下一份
    }
  }
  return candidates[0]
}

async function main(): Promise<void> {
  const dbPath = process.argv[2]
  if (dbPath === undefined || !existsSync(dbPath)) {
    console.error(`用法: verify-migration.ts <迁移后的库> [迁移前的备份]`)
    process.exit(1)
  }
  const backupPath = process.argv[3] ?? findBackup(dbPath)
  console.log(`迁移后的库: ${dbPath}`)
  console.log(`迁移前备份: ${backupPath ?? '(没找到，跳过条数对比)'}\n`)

  const database = new BetterSqlite3(dbPath)

  console.log('[1] 表结构')
  const tables = (
    database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string
    }[]
  ).map((row) => row.name)
  check(`${MESSAGES} 存在`, tables.includes(MESSAGES))
  check('hy_checkpoints 已删', !tables.includes('hy_checkpoints'), tables.join(','))
  check('hy_writes 已删', !tables.includes('hy_writes'))
  const columns = (
    database.prepare(`PRAGMA table_info(${CONVERSATIONS})`).all() as { name: string }[]
  ).map((row) => row.name)
  check('hy_conversation.langgraph_state 存在', columns.includes('langgraph_state'))

  console.log('\n[2] 消息条数')
  const counts = database
    .prepare(`SELECT conversation_id, COUNT(*) AS n FROM ${MESSAGES} GROUP BY conversation_id`)
    .all() as { conversation_id: string; n: number }[]
  const actual = new Map(counts.map((row) => [row.conversation_id, row.n]))
  const expected = readExpected(backupPath ?? '')
  const total = counts.reduce((sum, row) => sum + row.n, 0)
  console.log(`  迁移后: ${actual.size} 个会话 / ${total} 条消息`)
  if (expected.size > 0) {
    console.log(
      `  迁移前: ${expected.size} 个会话 / ${[...expected.values()].reduce((a, b) => a + b, 0)} 条消息`
    )
    check('会话数一致', actual.size === expected.size, `${actual.size} vs ${expected.size}`)
    const mismatched = [...expected.entries()].filter(([id, n]) => actual.get(id) !== n)
    check(
      '每个会话的消息条数一致',
      mismatched.length === 0,
      mismatched.map(([id, n]) => `${id}: 期望 ${n} 实际 ${actual.get(id) ?? 0}`).join('; ')
    )
  }

  console.log('\n[3] 行内数据完整性')
  const rows = database
    .prepare(
      `SELECT id, conversation_id, seq, source_data, message, metadata, expand, created_at
       FROM ${MESSAGES} ORDER BY conversation_id, seq`
    )
    .all() as {
    id: string
    conversation_id: string
    seq: number
    source_data: string
    message: string
    metadata: string
    expand: string
    created_at: number
  }[]

  let badSource = 0
  let badMessage = 0
  let badSeq = 0
  let badCreated = 0
  const seqMap = new Map<string, number[]>()
  for (const row of rows) {
    const source = JSON.parse(row.source_data) as { lc?: unknown; type?: string; id?: unknown }
    if (source.lc !== 1 || source.type !== 'constructor' || !Array.isArray(source.id))
      badSource += 1
    try {
      JSON.parse(row.message)
    } catch {
      badMessage += 1
    }
    const list = seqMap.get(row.conversation_id) ?? []
    list.push(row.seq)
    seqMap.set(row.conversation_id, list)
    if (row.created_at <= 0) badCreated += 1
  }
  for (const list of seqMap.values()) {
    const ok = list.every((seq, index) => seq === index + 1)
    if (!ok) badSeq += 1
  }
  check('source_data 全部可解析', badSource === 0, `${badSource} 行有问题`)
  check('message 全部可解析', badMessage === 0, `${badMessage} 行有问题`)
  check('每个会话 seq 从 1 连续无空洞', badSeq === 0, `${badSeq} 个会话有问题`)
  check('created_at 全部有效', badCreated === 0, `${badCreated} 行有问题`)

  console.log('\n[4] 账本')
  const ledgers = database.prepare(`SELECT id, langgraph_state FROM ${CONVERSATIONS}`).all() as {
    id: string
    langgraph_state: string
  }[]
  let badLedger = 0
  let ledgerBytes = 0
  for (const row of ledgers) {
    if (row.langgraph_state === '{}' || row.langgraph_state === '') continue
    ledgerBytes += row.langgraph_state.length
    try {
      const ledger = JSON.parse(row.langgraph_state) as {
        checkpoint_id?: string
        channel_versions?: unknown
        versions_seen?: unknown
      }
      if (typeof ledger.checkpoint_id !== 'string') badLedger += 1
      if (ledger.channel_versions === undefined || ledger.versions_seen === undefined)
        badLedger += 1
    } catch {
      badLedger += 1
    }
  }
  const withLedger = ledgers.filter(
    (row) => row.langgraph_state !== '{}' && row.langgraph_state !== ''
  ).length
  check('迁移过的会话都有账本', withLedger === actual.size, `${withLedger} vs ${actual.size}`)
  check('账本内容合法', badLedger === 0, `${badLedger} 个有问题`)
  console.log(
    `  账本共 ${Math.round(ledgerBytes / 1024)} KB | 平均 ${Math.round(ledgerBytes / Math.max(withLedger, 1))} 字节/会话`
  )

  console.log('\n[5] 用转换层读回来')
  openCheckpointStore(database)
  const saver = getCheckpointStore()
  let readOk = 0
  let readFail = 0
  let toolPairs = 0
  let toolBroken = 0
  let fieldOk = 0
  for (const conversationId of actual.keys()) {
    const tuple = await saver.getTuple({ configurable: { thread_id: conversationId } })
    if (tuple === undefined) {
      readFail += 1
      continue
    }
    const messages = (tuple.checkpoint.channel_values.messages ?? []) as BaseMessage[]
    if (messages.length !== actual.get(conversationId)) {
      readFail += 1
      continue
    }
    readOk += 1
    if (messages.every((message) => message.HYMessageField !== undefined)) fieldOk += 1

    // 工具配对
    const callIds = new Set<string>()
    for (const message of messages) {
      const calls = (message as { tool_calls?: { id?: string }[] }).tool_calls ?? []
      for (const call of calls) if (call.id !== undefined) callIds.add(call.id)
    }
    for (const message of messages) {
      if (message.type !== 'tool') continue
      const toolMessage = message as ToolMessage
      if (toolMessage.tool_call_id === undefined) continue
      if (callIds.has(toolMessage.tool_call_id)) toolPairs += 1
      else toolBroken += 1
    }
  }
  check('每个会话都能 getTuple 读回且条数正确', readFail === 0, `${readOk} 成功 / ${readFail} 失败`)
  check('读回的消息都带 HYMessageField', fieldOk === readOk, `${fieldOk}/${readOk}`)
  check('工具调用与结果全部配对', toolBroken === 0, `${toolPairs} 配对 / ${toolBroken} 断链`)
  console.log(`  工具配对: ${toolPairs} 组`)

  console.log('\n[6] 体积')
  const messageBytes = database
    .prepare(
      `SELECT SUM(LENGTH(source_data) + LENGTH(message) + LENGTH(metadata) + LENGTH(expand)) AS bytes FROM ${MESSAGES}`
    )
    .get() as { bytes: number }
  const dbSize = statSync(dbPath).size
  console.log(
    `  库文件 ${Math.round(dbSize / 1024)} KB | 消息列共 ${Math.round((messageBytes.bytes ?? 0) / 1024)} KB`
  )
  if (backupPath !== undefined && existsSync(backupPath)) {
    const backupSize = statSync(backupPath).size
    console.log(
      `  迁移前 ${Math.round(backupSize / 1024)} KB -> 迁移后 ${Math.round(dbSize / 1024)} KB`
    )
    check('库体积变小', dbSize < backupSize, `${dbSize} vs ${backupSize}`)
  }

  closeCheckpointStore()
  database.close()

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
