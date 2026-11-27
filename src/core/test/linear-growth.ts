/**
 * 体积线性增长自检
 *
 * 验收标准第 4 条：数据库体积随对话轮数线性增长，不再平方。
 * 用假模型模拟 N 轮对话，逐轮记录消息表与账本的字节数，并与旧方案
 * （每步一份全量快照）的理论值对比。不调真实模型，不产生费用。
 *
 * 跑法：
 *   pnpm test:electron src/core/test/linear-growth.ts
 */
import BetterSqlite3 from 'better-sqlite3'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ChatResult } from '@langchain/core/outputs'
import { MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { closeCheckpointStore, getCheckpointStore, openCheckpointStore } from '../graph/checkpoint'

const THREAD = 'conv-growth'
const MESSAGES = 'hy_message'
const CONVERSATIONS = 'hy_conversation'
const ROUNDS = 30
/** 每轮几个 super-step | 一轮 = START > model > END 共 1 次 loop put */
const STEPS_PER_ROUND = 1

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

/** 假模型 | 每次都回一段固定长度的文本，长度随轮次微增，模拟真实对话 */
class GrowingChatModel extends BaseChatModel {
  private round = 0

  constructor() {
    super({})
  }

  _llmType(): string {
    return 'growing'
  }

  async _generate(): Promise<ChatResult> {
    this.round += 1
    const body = `第 ${this.round} 轮回复。`.repeat(20)
    const message = new AIMessage({ content: body, id: `ai-${this.round}` })
    return { generations: [{ text: body, message }] }
  }
}

async function main(): Promise<void> {
  const database = new BetterSqlite3(':memory:')
  database.exec(`
    CREATE TABLE ${CONVERSATIONS} (
      id TEXT PRIMARY KEY,
      langgraph_state TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO ${CONVERSATIONS} (id) VALUES ('${THREAD}');
  `)
  openCheckpointStore(database)
  // 转换层的建表在第一次 put 时才跑 | 这里要先 prepare 统计语句，所以手动建一次
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MESSAGES} (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, seq INTEGER NOT NULL,
      source_data TEXT NOT NULL, message TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}', expand TEXT NOT NULL DEFAULT '{}',
      created_at BIGINT NOT NULL, UNIQUE (conversation_id, seq)
    );`)

  const model = new GrowingChatModel()
  const graph = new StateGraph(MessagesAnnotation)
    .addNode('model', async (state: { messages: BaseMessage[] }) => ({
      messages: [await model.invoke(state.messages)]
    }))
    .addEdge(START, 'model')
    .compile({ checkpointer: getCheckpointStore() })

  const config = { configurable: { thread_id: THREAD } }
  const measure = database.prepare(
    `SELECT COALESCE(SUM(LENGTH(source_data) + LENGTH(message) + LENGTH(metadata) + LENGTH(expand)), 0) AS bytes,
            COUNT(*) AS n
     FROM ${MESSAGES} WHERE conversation_id = ?`
  )
  const measureLedger = database.prepare(
    `SELECT LENGTH(langgraph_state) AS bytes FROM ${CONVERSATIONS} WHERE id = ?`
  )

  const samples: {
    round: number
    messages: number
    bytes: number
    ledger: number
    snapshot: number
  }[] = []
  /** 旧方案理论值 | 每个 step 存一份全量快照 */
  let legacyTotal = 0
  /** 当前全量快照的字节数（按实际消息序列化长度算） */
  let currentSnapshot = 0

  for (let round = 1; round <= ROUNDS; round += 1) {
    const question = new HumanMessage({ content: `第 ${round} 个问题`, id: `human-${round}` })
    await graph.invoke({ messages: [question] }, config)

    // 这一轮新增两条消息 | 累计全量快照大小（旧方案每步要写这么多）
    const rows = database
      .prepare(
        `SELECT LENGTH(source_data) + LENGTH(message) AS bytes FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq DESC LIMIT 2`
      )
      .all(THREAD) as { bytes: number }[]
    currentSnapshot += rows.reduce((sum, row) => sum + row.bytes, 0)
    // 旧方案：每轮 STEPS_PER_ROUND 个 step，每个 step 都写一份当前全量
    for (let step = 0; step < STEPS_PER_ROUND; step += 1) legacyTotal += currentSnapshot

    const stat = measure.get(THREAD) as { bytes: number; n: number }
    const ledger = measureLedger.get(THREAD) as { bytes: number }
    samples.push({
      round,
      messages: stat.n,
      bytes: stat.bytes,
      ledger: ledger.bytes,
      snapshot: currentSnapshot
    })
  }

  console.log('[1] 逐轮体积')
  console.log('  轮次  消息数  消息列字节  账本字节  旧方案累计字节')
  for (const sample of samples) {
    if (sample.round % 5 !== 0 && sample.round !== 1) continue
    console.log(
      `  ${String(sample.round).padStart(4)}  ${String(sample.messages).padStart(6)}  ${String(sample.bytes).padStart(10)}  ${String(sample.ledger).padStart(8)}  ${String(Math.round(legacyTotal * (sample.round / ROUNDS))).padStart(12)}`
    )
  }

  console.log('\n[2] 线性性')
  // 每轮增量应该基本恒定（消息长度固定，只有 id 里的数字变长）
  const increments: number[] = []
  for (let index = 1; index < samples.length; index += 1) {
    increments.push(samples[index].bytes - samples[index - 1].bytes)
  }
  const min = Math.min(...increments)
  const max = Math.max(...increments)
  const average = increments.reduce((a, b) => a + b, 0) / increments.length
  console.log(`  每轮增量: 最小 ${min} / 平均 ${Math.round(average)} / 最大 ${max} 字节`)
  check(
    '每轮增量波动很小（< 5%）',
    (max - min) / average < 0.05,
    `${(((max - min) / average) * 100).toFixed(2)}%`
  )

  // 总字节与轮数近似正比：最后 10 轮的平均增量与最前 10 轮对比
  const early = increments.slice(0, 10).reduce((a, b) => a + b, 0) / 10
  const late = increments.slice(-10).reduce((a, b) => a + b, 0) / 10
  console.log(`  前 10 轮平均增量 ${Math.round(early)} 字节 | 后 10 轮 ${Math.round(late)} 字节`)
  check('后段增量没有膨胀（线性）', late / early < 1.05, `比值 ${(late / early).toFixed(3)}`)

  console.log('\n[3] 与旧方案对比')
  const actual = samples[samples.length - 1].bytes
  console.log(`  ${ROUNDS} 轮后 新方案消息列 ${actual} 字节`)
  console.log(`  ${ROUNDS} 轮后 旧方案理论值 ${legacyTotal} 字节（每步全量快照）`)
  const ratio = legacyTotal / Math.max(actual, 1)
  console.log(`  旧 / 新 = ${ratio.toFixed(1)}x`)
  check('旧方案明显更重', ratio > 5, `${ratio.toFixed(1)}x`)

  console.log('\n[4] 账本')
  const firstLedger = samples[0].ledger
  const lastLedger = samples[samples.length - 1].ledger
  console.log(`  账本: 第 1 轮 ${firstLedger} 字节 -> 第 ${ROUNDS} 轮 ${lastLedger} 字节`)
  check(
    '账本大小基本恒定（与消息数无关）',
    Math.abs(lastLedger - firstLedger) < 200,
    `${firstLedger} -> ${lastLedger}`
  )

  console.log('\n[5] 平方 vs 线性')
  // 旧方案总字节 ~ n^2，新方案 ~ n
  const half = Math.floor(ROUNDS / 2)
  const halfActual = samples[half - 1].bytes
  const growthActual = actual / Math.max(halfActual, 1)
  console.log(`  新方案: 轮数翻倍，体积变为 ${growthActual.toFixed(2)}x（线性应为 2x）`)
  check('体积增长接近线性', growthActual > 1.7 && growthActual < 2.3, `${growthActual.toFixed(2)}x`)

  closeCheckpointStore()
  database.close()

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
