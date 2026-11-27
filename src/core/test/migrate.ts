/**
 * 旧 checkpoint -> 消息表 的迁移脚本
 *
 * 对每个会话取最新的一份 checkpoint（中间步骤没有意义），把 messages 逐条拆进
 * hy_message，执行账本写进 hy_conversation.langgraph_state，然后删掉两张旧表。
 *
 * 跑法（better-sqlite3 是 Electron ABI 编译的，纯 Node 加载会崩）：
 *   pnpm test:electron src/core/test/migrate.ts "<db 路径>"
 *
 * 不传路径时用下面的默认值（用户机器的备份库）。脚本自己先复制一份 .before-migrate，
 * 原库不会被就地改坏；重复跑是幂等的（先清该会话的 hy_message 再灌）。
 */
import { existsSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'

const DEFAULT_DB = 'C:\\Users\\HuanTian\\.huanyu-dev\\data copy\\memory.db'

const MESSAGES = 'hy_message'
const CONVERSATIONS = 'hy_conversation'
const LEGACY_CHECKPOINTS = 'hy_checkpoints'
const LEGACY_WRITES = 'hy_writes'

interface LegacyRow {
  thread_id: string
  checkpoint_id: string
  checkpoint: Buffer | string
}

interface SerializedMessage {
  lc?: unknown
  type?: string
  id?: unknown
  kwargs?: Record<string, unknown>
}

/** 把 BLOB/字符串统一解成对象 */
function parseJson(value: Buffer | string): unknown {
  return JSON.parse(typeof value === 'string' ? value : value.toString('utf-8'))
}

function ensureColumn(
  database: BetterSqlite3.Database,
  table: string,
  column: string,
  ddl: string
): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (columns.some((item) => item.name === column)) return
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

function hasTable(database: BetterSqlite3.Database, name: string): boolean {
  const row = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { name: string } | undefined
  return row !== undefined
}

function main(): void {
  const dbPath = process.argv[2] ?? DEFAULT_DB
  if (!existsSync(dbPath)) {
    console.error(`数据库不存在: ${dbPath}`)
    process.exit(1)
  }

  const database = new BetterSqlite3(dbPath)
  database.pragma('journal_mode = WAL')

  try {
    if (!hasTable(database, LEGACY_CHECKPOINTS)) {
      console.log('没有 hy_checkpoints 表 | 已经迁移过或者本来就是新库，什么都不做')
      return
    }

    // 备份 | 迁移要 DROP 两张表，没有退路
    // 用 VACUUM INTO 而不是 copyFile：WAL 里没落盘的数据不在主文件里，直接复制会备份到旧状态
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const backupPath = `${dbPath}.before-migrate-${stamp}`
    if (!existsSync(backupPath)) {
      database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
    }
    console.log(`已备份: ${backupPath}`)

    // 新表 | 与 main/database/init/sql.ts 的 DDL 保持一致
    database.exec(`
CREATE TABLE IF NOT EXISTS ${MESSAGES} (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT    NOT NULL,
  seq             INTEGER NOT NULL,
  source_data     TEXT    NOT NULL,
  message         TEXT    NOT NULL,
  metadata        TEXT    NOT NULL DEFAULT '{}',
  expand          TEXT    NOT NULL DEFAULT '{}',
  created_at      BIGINT  NOT NULL,
  UNIQUE (conversation_id, seq)
);`)
    ensureColumn(
      database,
      CONVERSATIONS,
      'langgraph_state',
      "langgraph_state TEXT NOT NULL DEFAULT '{}'"
    )

    // 每个会话的最新一份 checkpoint
    const threads = database
      .prepare(`SELECT DISTINCT thread_id FROM ${LEGACY_CHECKPOINTS}`)
      .all() as { thread_id: string }[]

    const insert = database.prepare(
      `INSERT INTO ${MESSAGES}
       (id, conversation_id, seq, source_data, message, metadata, expand, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const clear = database.prepare(`DELETE FROM ${MESSAGES} WHERE conversation_id = ?`)
    const updateLedger = database.prepare(
      `UPDATE ${CONVERSATIONS} SET langgraph_state = ? WHERE id = ?`
    )
    const existsConversation = database.prepare(`SELECT id FROM ${CONVERSATIONS} WHERE id = ?`)

    const now = Date.now()
    let migratedThreads = 0
    let migratedMessages = 0
    const skipped: string[] = []

    for (const { thread_id: threadId } of threads) {
      // 会话行不在业务表里 = 孤儿 checkpoint | 不硬造行，跳过并报告
      if (existsConversation.get(threadId) === undefined) {
        skipped.push(threadId)
        continue
      }

      const row = database
        .prepare(
          `SELECT thread_id, checkpoint_id, checkpoint FROM ${LEGACY_CHECKPOINTS}
           WHERE thread_id = ? AND checkpoint_ns = '' ORDER BY checkpoint_id DESC LIMIT 1`
        )
        .get(threadId) as LegacyRow | undefined
      if (row === undefined) {
        skipped.push(threadId)
        continue
      }

      const checkpoint = parseJson(row.checkpoint) as {
        id?: string
        ts?: string
        channel_values?: Record<string, unknown>
        channel_versions?: Record<string, unknown>
        versions_seen?: Record<string, unknown>
      }
      const messages = (checkpoint.channel_values?.messages ?? []) as SerializedMessage[]

      // 幂等 | 先清这个会话已有的行
      const write = database.transaction(() => {
        clear.run(threadId)

        let seq = 0
        for (const message of messages) {
          seq += 1
          const sourceData = { lc: message.lc, type: message.type, id: message.id }
          insert.run(
            `migrated-${threadId}-${seq}`,
            threadId,
            seq,
            JSON.stringify(sourceData),
            JSON.stringify(message.kwargs ?? {}),
            '{}',
            JSON.stringify({ status: 'message' }),
            now
          )
        }

        // 账本 | messages 之外的 channel 一起带上
        const channelValues = { ...(checkpoint.channel_values ?? {}) }
        delete channelValues.messages
        const ledger = {
          checkpoint_id: checkpoint.id ?? row.checkpoint_id,
          ts: checkpoint.ts ?? new Date(now).toISOString(),
          metadata: { source: 'loop', step: 0, parents: {} },
          channel_versions: checkpoint.channel_versions ?? {},
          versions_seen: checkpoint.versions_seen ?? {},
          channel_values: channelValues
        }
        updateLedger.run(JSON.stringify(ledger), threadId)
      })
      write()

      migratedThreads += 1
      migratedMessages += messages.length
    }

    console.log(`迁移完成: ${migratedThreads} 个会话 / ${migratedMessages} 条消息`)
    if (skipped.length > 0) {
      console.log(`跳过 ${skipped.length} 个孤儿会话（业务表里没有对应行）: ${skipped.join(', ')}`)
    }

    // 删旧表 | 先备份过了
    database.exec(`DROP TABLE IF EXISTS ${LEGACY_WRITES};`)
    database.exec(`DROP TABLE IF EXISTS ${LEGACY_CHECKPOINTS};`)
    console.log('已删除 hy_checkpoints / hy_writes')

    // 回收空间 | 必须在事务外
    database.pragma('wal_checkpoint(TRUNCATE)')
    database.exec('VACUUM')
    console.log('已 VACUUM')

    const messageBytes = database
      .prepare(
        `SELECT COUNT(*) AS n, SUM(LENGTH(source_data) + LENGTH(message) + LENGTH(metadata) + LENGTH(expand)) AS bytes FROM ${MESSAGES}`
      )
      .get() as { n: number; bytes: number }
    console.log(
      `hy_message: ${messageBytes.n} 行 / ${Math.round((messageBytes.bytes ?? 0) / 1024)} KB`
    )
  } finally {
    database.close()
  }
}

main()
