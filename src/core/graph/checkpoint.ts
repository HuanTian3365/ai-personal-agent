import type { RunnableConfig } from '@langchain/core/runnables'
import {
  BaseCheckpointSaver,
  TASKS,
  WRITES_IDX_MAP,
  compareWritesSortKeys,
  copyCheckpoint,
  maxChannelVersion,
  writesSortKey
} from '@langchain/langgraph-checkpoint'
import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointPendingWrite,
  CheckpointTuple,
  PendingWrite
} from '@langchain/langgraph-checkpoint'
import type BetterSqlite3 from 'better-sqlite3'

/**
 * LangGraph 的 checkpointer：对话状态的唯一权威存储。
 *
 * 为什么是「自己实现」而不是用官方的 `@langchain/langgraph-checkpoint-sqlite`：
 * 官方那个把表名写死成 `checkpoints` / `writes`，没有配置项。本项目要求所有表
 * 统一 `hy_` 前缀，所以照官方实现（v1.2.3 的 dist/index.js）移植了一份，
 * 逻辑与 SQL 保持一致，只把表名换成 `hy_checkpoints` / `hy_writes`。
 * 官方改了实现时要跟着对一遍——这里不是黑盒，是复制品。
 *
 * 它和业务表（`hy_workspace` / `hy_group` / `hy_conversation`）共用同一个
 * 数据库文件和同一个连接：连接由 main 打开（`main/database/index.ts` 的 `openDatabase()`），
 * 再经 `openCheckpointStore(database)` 传进来——core 自己不开库。
 *
 * 表结构（与 LangGraph 的 checkpoint 格式绑定，不要随意改列）：
 * - `hy_checkpoints`：每个 super-step 一份完整 state 快照
 * - `hy_writes`：节点写出的 pending write，以及中断时的 task 记录
 */

const CHECKPOINTS = 'hy_checkpoints'
const WRITES = 'hy_writes'

/** pending_writes 子查询里逐行取出的列 */
interface WriteColumn {
  task_id: string
  channel: string
  type: string | null
  value: string | null
  task_path?: string
  idx: number | null
}

/** 一条 checkpoint 行（含聚合出来的子查询列） */
interface CheckpointRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  type: string | null
  checkpoint: Buffer
  metadata: Buffer
  pending_writes: string
  pending_sends: string
}

/**
 * 把 pending write 按 LangGraph 的执行顺序排好。
 *
 * 排序放在 JS 里做，不交给 SQL——这样结果不依赖数据库的排序规则，
 * 和实际执行顺序（`writesSortKey`）永远一致。
 */
function sortPendingWriteColumns(columns: WriteColumn[]): WriteColumn[] {
  return columns
    .map((column) => ({
      key: writesSortKey(column.task_path ?? '', column.task_id, column.idx ?? 0),
      column
    }))
    .sort((a, b) => compareWritesSortKeys(a.key, b.key))
    .map(({ column }) => column)
}

class SqliteSaver extends BaseCheckpointSaver {
  private readonly database: BetterSqlite3.Database
  private ready = false
  private stmtWithoutId!: BetterSqlite3.Statement
  private stmtWithId!: BetterSqlite3.Statement
  private putStmt!: BetterSqlite3.Statement

  constructor(database: BetterSqlite3.Database) {
    super()
    this.database = database
  }

  /** 建表 + 预编译查询。第一次用到时才执行（图可能整轮不落库） */
  private ensureSchema(): void {
    if (this.ready) return

    this.database.exec(`
CREATE TABLE IF NOT EXISTS ${CHECKPOINTS} (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BLOB,
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);`)

    this.database.exec(`
CREATE TABLE IF NOT EXISTS ${WRITES} (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_path TEXT NOT NULL DEFAULT '',
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);`)

    this.stmtWithoutId = this.database.prepare(this.buildSelect(false))
    this.stmtWithId = this.database.prepare(this.buildSelect(true))
    this.putStmt = this.database.prepare(
      `INSERT OR REPLACE INTO ${CHECKPOINTS}
       (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    this.ready = true
  }

  /** 官方实现里的那条大 SELECT，原样保留（含 pending_writes / pending_sends 两个子查询） */
  private buildSelect(withCheckpointId: boolean): string {
    return `
  SELECT
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    parent_checkpoint_id,
    type,
    checkpoint,
    metadata,
    (
      SELECT json_group_array(
        json_object(
          'task_id', pw.task_id,
          'channel', pw.channel,
          'type', pw.type,
          'value', CAST(pw.value AS TEXT),
          'task_path', pw.task_path,
          'idx', pw.idx
        )
      )
      FROM ${WRITES} as pw
      WHERE pw.thread_id = ${CHECKPOINTS}.thread_id
        AND pw.checkpoint_ns = ${CHECKPOINTS}.checkpoint_ns
        AND pw.checkpoint_id = ${CHECKPOINTS}.checkpoint_id
    ) as pending_writes,
    (
      SELECT json_group_array(
        json_object(
          'type', ps.type,
          'value', CAST(ps.value AS TEXT)
        )
      )
      FROM ${WRITES} as ps
      WHERE ps.thread_id = ${CHECKPOINTS}.thread_id
        AND ps.checkpoint_ns = ${CHECKPOINTS}.checkpoint_ns
        AND ps.checkpoint_id = ${CHECKPOINTS}.parent_checkpoint_id
        AND ps.channel = '${TASKS}'
      ORDER BY ps.idx
    ) as pending_sends
  FROM ${CHECKPOINTS}
  WHERE thread_id = ? AND checkpoint_ns = ? ${
    withCheckpointId ? 'AND checkpoint_id = ?' : 'ORDER BY checkpoint_id DESC LIMIT 1'
  }`
  }

  /** 把一行还原成 CheckpointTuple */
  private async rowToTuple(row: CheckpointRow): Promise<CheckpointTuple> {
    const threadId = row.thread_id
    const checkpointNs = row.checkpoint_ns

    const pendingWrites: CheckpointPendingWrite[] = await Promise.all(
      sortPendingWriteColumns(JSON.parse(row.pending_writes) as WriteColumn[]).map(
        async (write): Promise<CheckpointPendingWrite> => [
          write.task_id,
          write.channel,
          await this.serde.loadsTyped(write.type ?? 'json', write.value ?? '')
        ]
      )
    )

    const checkpoint = (await this.serde.loadsTyped(
      row.type ?? 'json',
      row.checkpoint
    )) as Checkpoint

    // v4 之前的快照把 pending sends 存在 channel_values 之外，读的时候补回去
    if (checkpoint.v < 4 && row.parent_checkpoint_id !== null) {
      await this.migratePendingSends(checkpoint, threadId, row.parent_checkpoint_id)
    }

    return {
      checkpoint,
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.checkpoint_id
        }
      },
      metadata: (await this.serde.loadsTyped(
        row.type ?? 'json',
        row.metadata
      )) as CheckpointMetadata,
      parentConfig: row.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: checkpointNs,
              checkpoint_id: row.parent_checkpoint_id
            }
          }
        : undefined,
      pendingWrites
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    this.ensureSchema()
    const { thread_id, checkpoint_ns = '', checkpoint_id } = config.configurable ?? {}
    const args = [thread_id, checkpoint_ns]
    if (checkpoint_id !== undefined) args.push(checkpoint_id)

    const row = (checkpoint_id !== undefined ? this.stmtWithId : this.stmtWithoutId).get(
      ...args
    ) as CheckpointRow | undefined
    if (row === undefined) return undefined

    return this.rowToTuple(row)
  }

  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, unknown> }
  ): AsyncGenerator<CheckpointTuple> {
    this.ensureSchema()
    const threadId = config.configurable?.thread_id
    const checkpointNs = config.configurable?.checkpoint_ns

    const where: string[] = []
    const args: unknown[] = []
    if (threadId) {
      where.push('thread_id = ?')
      args.push(threadId)
    }
    if (checkpointNs !== undefined && checkpointNs !== null) {
      where.push('checkpoint_ns = ?')
      args.push(checkpointNs)
    }
    if (options?.before?.configurable?.checkpoint_id !== undefined) {
      where.push('checkpoint_id < ?')
      args.push(options.before.configurable.checkpoint_id)
    }

    let sql = this.buildSelect(false).replace(
      'WHERE thread_id = ? AND checkpoint_ns = ? ORDER BY checkpoint_id DESC LIMIT 1',
      ''
    )
    if (where.length > 0) sql += `\nWHERE ${where.join(' AND ')}`
    sql += '\nORDER BY checkpoint_id DESC'
    if (options?.limit) sql += ` LIMIT ${Number.parseInt(String(options.limit), 10)}`

    const rows = this.database.prepare(sql).all(...args) as CheckpointRow[]
    for (const row of rows) {
      yield this.rowToTuple(row)
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    this.ensureSchema()
    if (!config.configurable) throw new Error('put: 缺少 config.configurable')

    const threadId = config.configurable.thread_id
    const checkpointNs = config.configurable.checkpoint_ns ?? ''
    if (typeof threadId !== 'string' || threadId === '') {
      throw new Error('put: config.configurable 缺少 thread_id')
    }

    const prepared = copyCheckpoint(checkpoint)
    const [[type1, serializedCheckpoint], [type2, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(prepared),
      this.serde.dumpsTyped(metadata)
    ])
    if (type1 !== type2) {
      throw new Error('put: checkpoint 与 metadata 的序列化类型不一致')
    }

    this.putStmt.run(
      threadId,
      checkpointNs,
      checkpoint.id,
      config.configurable.checkpoint_id ?? null,
      type1,
      serializedCheckpoint,
      serializedMetadata
    )

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id
      }
    }
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath?: string
  ): Promise<void> {
    this.ensureSchema()
    if (!config.configurable?.thread_id) throw new Error('putWrites: 缺少 thread_id')
    if (!config.configurable?.checkpoint_id) throw new Error('putWrites: 缺少 checkpoint_id')

    // 所有 channel 都是「可覆盖」的那些（如 __interrupt__）就用 OR REPLACE，否则 OR IGNORE
    const conflict = writes.every(([channel]) => channel in WRITES_IDX_MAP)
      ? 'OR REPLACE'
      : 'OR IGNORE'
    const stmt = this.database.prepare(
      `INSERT ${conflict} INTO ${WRITES}
       (thread_id, checkpoint_ns, checkpoint_id, task_id, task_path, idx, channel, type, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const rows = await Promise.all(
      writes.map(async (write, index) => {
        const [type, serialized] = await this.serde.dumpsTyped(write[1])
        return [
          config.configurable?.thread_id,
          config.configurable?.checkpoint_ns,
          config.configurable?.checkpoint_id,
          taskId,
          taskPath ?? '',
          WRITES_IDX_MAP[write[0]] ?? index,
          write[0],
          type,
          serialized
        ]
      })
    )

    const tx = this.database.transaction((batch: unknown[][]) => {
      for (const row of batch) stmt.run(...row)
    })
    tx(rows)
  }

  async deleteThread(threadId: string): Promise<void> {
    this.ensureSchema()
    const tx = this.database.transaction(() => {
      this.database.prepare(`DELETE FROM ${CHECKPOINTS} WHERE thread_id = ?`).run(threadId)
      this.database.prepare(`DELETE FROM ${WRITES} WHERE thread_id = ?`).run(threadId)
    })
    tx()
  }

  /** v4 之前的快照：把父 checkpoint 的 pending sends 补回 channel_values */
  private async migratePendingSends(
    checkpoint: Checkpoint,
    threadId: string,
    parentCheckpointId: string
  ): Promise<void> {
    const row = this.database
      .prepare(
        `SELECT json_group_array(json_object('type', ps.type, 'value', CAST(ps.value AS TEXT))) as pending_sends
         FROM ${WRITES} as ps
         WHERE ps.thread_id = ? AND ps.checkpoint_id = ? AND ps.channel = '${TASKS}'
         ORDER BY ps.idx`
      )
      .get(threadId, parentCheckpointId) as { pending_sends: string }

    checkpoint.channel_values ??= {}
    checkpoint.channel_values[TASKS] = await Promise.all(
      (JSON.parse(row.pending_sends) as { type: string; value: string }[]).map(({ type, value }) =>
        this.serde.loadsTyped(type, value)
      )
    )
    checkpoint.channel_versions[TASKS] =
      Object.keys(checkpoint.channel_versions).length > 0
        ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
        : this.getNextVersion(undefined)
  }
}

let saver: SqliteSaver | null = null

/**
 * 打开 checkpointer。
 *
 * 连接由 main 传进来（core 不开库、也不持有连接）：业务表和 checkpoint 表
 * 共用同一个文件和同一个连接，所以必须接在已经打开的那一个实例上。
 * 进程内只初始化一次。
 */
export function openCheckpointStore(database: BetterSqlite3.Database): SqliteSaver {
  if (saver !== null) return saver
  saver = new SqliteSaver(database)
  return saver
}

/** 取 checkpointer。没初始化就抛错，避免拿到半个系统 */
export function getCheckpointStore(): SqliteSaver {
  if (saver === null)
    throw new Error('会话状态库尚未初始化：请先在 main 中调用 openCheckpointStore()')
  return saver
}

/** 只置空引用：连接的关闭归 closeDatabase()，这里不能重复 close */
export function closeCheckpointStore(): void {
  saver = null
}
