import { randomUUID } from 'node:crypto'
import type { BaseMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import { BaseCheckpointSaver, copyCheckpoint } from '@langchain/langgraph-checkpoint'
import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple
} from '@langchain/langgraph-checkpoint'
import type BetterSqlite3 from 'better-sqlite3'
import type { HYEMessageCustom, HYEMessageExpand } from '@shared/types/hyExpand'
import type { HYMessageField } from '@shared/types/hyEntity'

/**
 * LangChain 消息 ⇄ 消息表的转换层 | 取代原来的 checkpoint saver
 *
 * 原实现每个 super-step 存一份全量 state 快照（`hy_checkpoints` + `hy_writes`），
 * 消息随历史长度反复复制，总体是 O(n^2)。这里改成一条消息一行（`hy_message`），
 * 执行账本（channel_versions / versions_seen）一会话一行，落在
 * `hy_conversation.langgraph_state` 上，总体是 O(n)。
 *
 * 保留 LangChain 的消息协议：读走 `loadsTyped`、写走 `dumpsTyped`，消息内容一个字节不改。
 * 只保留序列化外壳 lc / type / id，正文全在 kwargs（见 `toRow`）。
 * 行主键就是消息身份 `message.id`：界面块 / 队列项 / 重放查重都按它认消息。
 *
 * 三条硬约束：
 * - 消息只增不删：`RemoveMessage` 会让 messages 变短，这里显式抛错而不是静默忽略
 * - 不做中断恢复（resume）：`putWrites` 空实现，`pendingWrites` 固定 `[]`
 * - 只支持主图：`checkpoint_ns` 必须为空，子图会把多个 ns 压进同一行账本
 */

const MESSAGES = 'hy_message'
const CONVERSATIONS = 'hy_conversation'

/** 消息行 */
interface MessageRow {
  id: string
  conversation_id: string
  seq: number
  source_data: string
  message: string
  metadata: string
  expand: string
  created_at: number
}

/** 会话账本 | 存在 hy_conversation.langgraph_state 里 */
interface Ledger {
  /** 这份状态对应的 checkpoint id */
  checkpoint_id: string
  /** 快照时间 ISO 8601 */
  ts: string
  /** 这份 checkpoint 的元信息 source / step / parents */
  metadata: CheckpointMetadata
  /** 每个 channel 的版本号 */
  channel_versions: Record<string, number | string>
  /** 每个节点上次看到第几版 */
  versions_seen: Record<string, Record<string, number | string>>
  /** 除 messages 之外的 channel 值 */
  channel_values: Record<string, unknown>
}

/** 空账本 | 表示这个会话还没跑过图 */
const EMPTY_LEDGER = '{}'

class SqliteSaver extends BaseCheckpointSaver {
  private readonly database: BetterSqlite3.Database
  private ready = false

  private countStmt!: BetterSqlite3.Statement
  private insertStmt!: BetterSqlite3.Statement
  private selectMessagesStmt!: BetterSqlite3.Statement
  private selectLedgerStmt!: BetterSqlite3.Statement
  private updateLedgerStmt!: BetterSqlite3.Statement
  private clearMessagesStmt!: BetterSqlite3.Statement

  constructor(database: BetterSqlite3.Database) {
    super()
    this.database = database
  }

  /** 建表 + 预编译查询 | 第一次用到时才执行（图可能整轮不落库） */
  private ensureSchema(): void {
    if (this.ready) return

    // 与 main/database/init/sql.ts 的 DDL 保持一致 | 那边建新库 这里兜 core 单独跑
    this.database.exec(`
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

    this.countStmt = this.database.prepare(
      `SELECT COUNT(*) AS n FROM ${MESSAGES} WHERE conversation_id = ?`
    )
    this.insertStmt = this.database.prepare(
      `INSERT INTO ${MESSAGES}
       (id, conversation_id, seq, source_data, message, metadata, expand, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.selectMessagesStmt = this.database.prepare(
      `SELECT id, conversation_id, seq, source_data, message, metadata, expand, created_at
       FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq ASC`
    )
    this.selectLedgerStmt = this.database.prepare(
      `SELECT langgraph_state FROM ${CONVERSATIONS} WHERE id = ?`
    )
    this.updateLedgerStmt = this.database.prepare(
      `UPDATE ${CONVERSATIONS} SET langgraph_state = ? WHERE id = ?`
    )
    this.clearMessagesStmt = this.database.prepare(
      `DELETE FROM ${MESSAGES} WHERE conversation_id = ?`
    )

    this.ready = true
  }

  /** 从 config 里取 thread_id | 缺了直接抛 不猜 */
  private threadIdOf(config: RunnableConfig): string {
    const threadId = config.configurable?.thread_id
    if (typeof threadId !== 'string' || threadId === '') {
      throw new Error('checkpoint: config.configurable 缺少 thread_id')
    }
    return threadId
  }

  /**
   * 写一步状态
   *
   * messages 与库里已有条数做差 只 INSERT 新增的（只增不删 所以按位置切就够了）。
   * 用库里条数而不是内存 Set：进程重启后内存是空的 拿它做差会把全量历史重插一遍。
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    this.ensureSchema()
    if (!config.configurable) throw new Error('put: 缺少 config.configurable')

    const threadId = this.threadIdOf(config)
    const checkpointNs = config.configurable.checkpoint_ns ?? ''
    if (checkpointNs !== '') {
      throw new Error(
        `put: 不支持子图（checkpoint_ns='${checkpointNs}'）| 账本按会话存 压不下多个 ns`
      )
    }

    const prepared = copyCheckpoint(checkpoint)
    const messages = (prepared.channel_values?.messages ?? []) as BaseMessage[]

    // 已有条数 | 按位置切出新增
    const stored = this.countStmt.get(threadId) as { n: number }
    if (messages.length < stored.n) {
      throw new Error(
        `put: 会话 ${threadId} 的消息从 ${stored.n} 条变成 ${messages.length} 条 | ` +
          '本项目不支持 RemoveMessage（消息只增不删）'
      )
    }
    const added = messages.slice(stored.n)

    // 先序列化（async），再同步写事务 | better-sqlite3 的事务不能跨 await
    const now = Date.now()
    const rows = await Promise.all(added.map((message) => this.toRow(message, metadata, now)))

    // 账本：摘掉 messages 再序列化，否则白序列化全量历史
    const channelValues = { ...(prepared.channel_values ?? {}) }
    delete channelValues.messages
    const ledger: Ledger = {
      checkpoint_id: prepared.id,
      ts: prepared.ts ?? new Date(now).toISOString(),
      metadata,
      channel_versions: prepared.channel_versions,
      versions_seen: prepared.versions_seen,
      channel_values: channelValues
    }

    const write = this.database.transaction(() => {
      // seq 接着往下排 | 空会话从 1 起
      let seq = stored.n
      for (const row of rows) {
        seq += 1
        this.insertStmt.run(row.id, threadId, seq, ...row.rest)
      }
      const result = this.updateLedgerStmt.run(JSON.stringify(ledger), threadId)
      // 账本挂在会话行上 会话行不在就写不进去 不能静默丢
      if (result.changes === 0) {
        throw new Error(`put: 会话 ${threadId} 不在 ${CONVERSATIONS} 里 | 账本无处可写`)
      }
    })
    write()

    return {
      configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: prepared.id }
    }
  }

  /**
   * 读最新状态
   *
   * 账本在会话行上 正文在消息表里 拼回一个 CheckpointTuple 调用方看不出区别。
   * 只有 hy_message 一处数据源 不再兼容旧的 checkpoint 表。
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    this.ensureSchema()
    const threadId = this.threadIdOf(config)

    const row = this.selectLedgerStmt.get(threadId) as { langgraph_state: string } | undefined
    if (row === undefined) return undefined

    // 没账本 = 这个会话还没跑过图
    if (row.langgraph_state === EMPTY_LEDGER || row.langgraph_state === '') return undefined

    const ledger = JSON.parse(row.langgraph_state) as Ledger
    if (typeof ledger.checkpoint_id !== 'string') return undefined

    // 取正文
    const messageRows = this.selectMessagesStmt.all(threadId) as MessageRow[]
    const messages = await Promise.all(messageRows.map((item) => this.toMessage(item)))

    const checkpoint: Checkpoint = {
      v: 4,
      id: ledger.checkpoint_id,
      ts: ledger.ts,
      channel_values: { ...ledger.channel_values, messages },
      channel_versions: ledger.channel_versions,
      versions_seen: ledger.versions_seen
    }

    return {
      checkpoint,
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: config.configurable?.checkpoint_ns ?? '',
          checkpoint_id: ledger.checkpoint_id
        }
      },
      metadata: ledger.metadata ?? { source: 'loop', step: 0, parents: {} },
      pendingWrites: []
    }
  }

  /**
   * 历史列表
   *
   * 本方案只保留「当前状态」 所以最多给出一条。留着是为了 getStateHistory 不炸。
   */
  async *list(config: RunnableConfig): AsyncGenerator<CheckpointTuple> {
    const tuple = await this.getTuple(config)
    if (tuple !== undefined) yield tuple
  }

  /**
   * 节点写出的 pending write | 空实现
   *
   * LangGraph 只用 pendingWrites 判断「哪些 task 已完成」（pregel/algo 的 _prepareNextTasks），
   * 正常执行时它本来就该是空的。代价是丧失中断恢复 项目不做 resume。
   */
  async putWrites(): Promise<void> {
    // 不写库
  }

  /** 删会话 | 连带删消息 消息只增不删是指会话内部 */
  async deleteThread(threadId: string): Promise<void> {
    this.ensureSchema()
    const remove = this.database.transaction(() => {
      this.clearMessagesStmt.run(threadId)
      this.updateLedgerStmt.run(EMPTY_LEDGER, threadId)
    })
    remove()
  }

  /**
   * 消息 -> 行
   *
   * 外壳只留 lc / type / id，正文全在 kwargs。
   * hy_custom 塞进 kwargs 跟着正文走；HYMessageField 是行级信息 不序列化。
   */
  private async toRow(
    message: BaseMessage,
    metadata: CheckpointMetadata,
    now: number
  ): Promise<{ id: string; rest: [string, string, string, string, number] }> {
    const [, serialized] = await this.serde.dumpsTyped(message)
    const text = typeof serialized === 'string' ? serialized : new TextDecoder().decode(serialized)
    const outer = JSON.parse(text) as {
      lc?: unknown
      type?: string
      id?: unknown
      kwargs?: Record<string, unknown>
    }

    const sourceData = { lc: outer.lc, type: outer.type, id: outer.id }
    const kwargs = { ...(outer.kwargs ?? {}) }
    // 只挂我们自己写进去的字段 provider 写的一律原样不动
    const custom = message.HYEMessageCustom
    if (custom !== undefined && Object.keys(custom).length > 0) kwargs.hy_custom = custom

    const expand: HYEMessageExpand = { status: 'message' }

    // 主键用消息自己的id: 界面块.队列项.重放查重都按它认消息 另生成一个就是同一条消息两套身份
    // 没有id的消息(部分provider.流式拼接)才现生成 只补空不覆盖
    const rowId = message.id === undefined || message.id === '' ? randomUUID() : message.id

    return {
      id: rowId,
      rest: [
        JSON.stringify(sourceData),
        JSON.stringify(kwargs),
        JSON.stringify(metadata),
        JSON.stringify(expand),
        now
      ]
    }
  }

  /** 行 -> 消息 | 还原外壳后 loadsTyped，再把行级信息挂回去 */
  private async toMessage(row: MessageRow): Promise<BaseMessage> {
    const text = JSON.stringify({
      ...(JSON.parse(row.source_data) as Record<string, unknown>),
      kwargs: JSON.parse(row.message) as Record<string, unknown>
    })
    const message = (await this.serde.loadsTyped('json', text)) as BaseMessage
    this.attach(message, row)
    return message
  }

  /**
   * 挂行级字段
   *
   * BaseMessage 的构造函数只取白名单字段，hy_custom 读回来会被丢掉，
   * 所以必须在这里手动挂回。反过来 dumpsTyped 也不会把它带进 payload | 发给模型天然不泄漏。
   */
  private attach(message: BaseMessage, row: MessageRow): void {
    const kwargs = JSON.parse(row.message) as { hy_custom?: HYEMessageCustom }
    const field: HYMessageField = {
      id: row.id,
      conversationId: row.conversation_id,
      seq: row.seq,
      sourceData: JSON.parse(row.source_data) as Record<string, unknown>,
      metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      expand: JSON.parse(row.expand) as HYEMessageExpand,
      createdAt: row.created_at
    }
    message.HYMessageField = field
    message.HYEMessageCustom = kwargs.hy_custom ?? {}
  }
}

let saver: SqliteSaver | null = null

/**
 * 打开转换层
 *
 * 连接由 main 传进来（core 不开库）：业务表和消息表共用同一个文件和同一个连接。
 * 进程内只初始化一次。
 */
export function openCheckpointStore(database: BetterSqlite3.Database): SqliteSaver {
  if (saver !== null) return saver
  saver = new SqliteSaver(database)
  return saver
}

/** 取转换层。没初始化就抛错，避免拿到半个系统 */
export function getCheckpointStore(): SqliteSaver {
  if (saver === null)
    throw new Error('会话状态库尚未初始化：请先在 main 中调用 openCheckpointStore()')
  return saver
}

/** 只置空引用：连接的关闭归 closeDatabase()，这里不能重复 close */
export function closeCheckpointStore(): void {
  saver = null
}
