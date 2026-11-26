/**
 * 转换层 round-trip 自检
 *
 * 阶段 1 的硬前置：双向转换丢一个字段（比如 reasoning 的 signature、
 * ToolMessage 的 metadata.versions）就是不可逆的数据损失，必须逐字段验。
 *
 * 跑法（better-sqlite3 是 Electron ABI 编译的，纯 Node 加载会崩）：
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs src/core/test/checkpoint-roundtrip.ts
 *   Remove-Item Env:\ELECTRON_RUN_AS_NODE
 */
import BetterSqlite3 from 'better-sqlite3'
import { AIMessage, HumanMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { JsonPlusSerializer } from '@langchain/langgraph-checkpoint'
import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import { closeCheckpointStore, getCheckpointStore, openCheckpointStore } from '../graph/checkpoint'

const serde = new JsonPlusSerializer()
const THREAD = 'conv-roundtrip'
const CONVERSATIONS = 'hy_conversation'
const MESSAGES = 'hy_message'

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

/** 深比较 忽略对象 key 顺序 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (typeof a === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) return false
    if (!leftKeys.every((key, index) => key === rightKeys[index])) return false
    return leftKeys.every((key) => deepEqual(left[key], right[key]))
  }
  return false
}

/** 序列化成可比较的普通对象 | 用于验证「写进去再读出来一字不差」 */
async function snapshot(message: BaseMessage): Promise<unknown> {
  const [, serialized] = await serde.dumpsTyped(message)
  const text = typeof serialized === 'string' ? serialized : new TextDecoder().decode(serialized)
  return JSON.parse(text)
}

function makeCheckpoint(id: string, messages: BaseMessage[]): Checkpoint {
  return {
    v: 4,
    id,
    ts: new Date().toISOString(),
    channel_values: { messages },
    channel_versions: { messages: id },
    versions_seen: { model: { messages: id } }
  }
}

function makeMetadata(source: CheckpointMetadata['source'], step: number): CheckpointMetadata {
  return { source, step, parents: {} }
}

async function main(): Promise<void> {
  const database = new BetterSqlite3(':memory:')
  // 只建转换层需要的两列 | 真实库里由 main/database 建
  database.exec(`
    CREATE TABLE ${CONVERSATIONS} (
      id TEXT PRIMARY KEY,
      langgraph_state TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO ${CONVERSATIONS} (id) VALUES ('${THREAD}');
  `)
  openCheckpointStore(database)
  const saver = getCheckpointStore()

  // ---------- 造消息 ----------
  const human = new HumanMessage({
    content: '读一下 README',
    id: 'msg-human-1',
    additional_kwargs: { insertFlag: true }
  })
  const ai = new AIMessage({
    content: '我先看看。',
    id: 'msg-ai-1',
    additional_kwargs: {
      reasoning_content: '用户要我读文件，先调用工具。',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } }]
    },
    response_metadata: {
      model_provider: 'openai',
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, credit: 0.02 }
    },
    tool_calls: [{ id: 'call-1', name: 'read', args: { path: 'README.md' } }],
    invalid_tool_calls: [],
    usage_metadata: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_token_details: { cache_read: 50 }
    }
  })
  const tool = new ToolMessage({
    content: '# 幻雨',
    id: 'msg-tool-1',
    tool_call_id: 'call-1',
    name: 'read',
    status: 'success',
    metadata: { versions: { '@langchain/core': '1.4.2' } },
    artifact: { full: '完整输出' }
  })
  const aborted = new AIMessage({
    content: '说到一半',
    id: 'msg-ai-2',
    additional_kwargs: { status: 'aborted' }
  })
  // 业务自定义字段
  aborted.HyMessageCustom = { aborted: true }

  const originals = [human, ai, tool, aborted]
  const originalSnapshots = await Promise.all(originals.map((item) => snapshot(item)))

  // ---------- 第一次 put：只有用户消息 ----------
  await saver.put(
    { configurable: { thread_id: THREAD } },
    makeCheckpoint('cp-1', [human]),
    makeMetadata('input', -1)
  )

  let tuple = await saver.getTuple({ configurable: { thread_id: THREAD } })
  check('首次 put 后能读到', tuple !== undefined)
  check(
    '首次 put 后 1 条',
    (tuple?.checkpoint.channel_values.messages as BaseMessage[]).length === 1
  )

  // ---------- 第二次 put：追加 3 条 ----------
  await saver.put(
    { configurable: { thread_id: THREAD } },
    makeCheckpoint('cp-2', [human, ai, tool, aborted]),
    makeMetadata('loop', 0)
  )

  tuple = await saver.getTuple({ configurable: { thread_id: THREAD } })
  if (tuple === undefined) {
    console.log('getTuple 返回 undefined，后续无法验证')
    process.exit(1)
  }
  const loaded = tuple.checkpoint.channel_values.messages as BaseMessage[]

  console.log('\n[1] 条数与顺序')
  check('4 条', loaded.length === 4, `实际 ${loaded.length}`)
  check(
    '顺序一致',
    loaded.map((item) => item.id).join(',') === originals.map((item) => item.id).join(','),
    loaded.map((item) => item.id).join(',')
  )

  console.log('\n[2] 内容逐字节一致（序列化后深比较）')
  for (let index = 0; index < loaded.length; index += 1) {
    const message = loaded[index]
    const back = await snapshot(message)
    const original = originalSnapshots[index]
    // hy_custom 是我们额外加的 key | 只在 original 没有时补回原始形状
    const stripped = JSON.parse(JSON.stringify(back)) as { kwargs?: Record<string, unknown> }
    if (stripped.kwargs !== undefined && originalSnapshots[index] !== undefined) {
      const originalKwargs = (original as { kwargs?: Record<string, unknown> }).kwargs ?? {}
      if (originalKwargs.hy_custom === undefined) delete stripped.kwargs.hy_custom
    }
    check(`第 ${index + 1} 条 ${message.type} 一致`, deepEqual(stripped, original))
  }

  console.log('\n[3] HyMessageField 行级字段')
  for (let index = 0; index < loaded.length; index += 1) {
    const field = loaded[index].HyMessageField
    check(`第 ${index + 1} 条有 HyMessageField`, field !== undefined)
    if (field === undefined) continue
    check(`  seq = ${index + 1}`, field.seq === index + 1, `实际 ${field.seq}`)
    check('  conversationId 正确', field.conversationId === THREAD, field.conversationId)
    check('  id 非空', typeof field.id === 'string' && field.id.length > 0)
    check(
      '  expand.status = message',
      field.expand.status === 'message',
      String(field.expand.status)
    )
    check('  createdAt > 0', field.createdAt > 0)
    check(
      '  sourceData 有 lc/type/id',
      field.sourceData.lc === 1 &&
        field.sourceData.type === 'constructor' &&
        Array.isArray(field.sourceData.id)
    )
  }
  check(
    '用户消息 metadata.source = input',
    loaded[0].HyMessageField?.metadata.source === 'input',
    String(loaded[0].HyMessageField?.metadata.source)
  )
  check(
    '后续消息 metadata.source = loop',
    loaded[1].HyMessageField?.metadata.source === 'loop',
    String(loaded[1].HyMessageField?.metadata.source)
  )

  console.log('\n[4] HyMessageCustom 业务字段')
  check(
    'aborted 读得回来',
    loaded[3].HyMessageCustom?.aborted === true,
    JSON.stringify(loaded[3].HyMessageCustom)
  )
  check(
    '普通消息 HyMessageCustom 是空对象',
    deepEqual(loaded[0].HyMessageCustom, {}),
    JSON.stringify(loaded[0].HyMessageCustom)
  )
  check(
    'HyMessageCustom 没污染 additional_kwargs',
    (loaded[3].additional_kwargs as Record<string, unknown>).hy_custom === undefined &&
      loaded[3].additional_kwargs.status === 'aborted'
  )

  console.log('\n[5] 关键字段专项')
  const loadedTool = loaded[2] as ToolMessage
  check(
    'ToolMessage.metadata.versions 保留',
    (loadedTool.metadata as { versions?: Record<string, string> })?.versions?.[
      '@langchain/core'
    ] === '1.4.2'
  )
  check('ToolMessage.artifact 保留', deepEqual(loadedTool.artifact, { full: '完整输出' }))
  check('ToolMessage.status 保留', loadedTool.status === 'success')
  const loadedAi = loaded[1] as AIMessage
  check('AIMessage.tool_calls 保留', deepEqual(loadedAi.tool_calls, ai.tool_calls))
  check('AIMessage.usage_metadata 保留', deepEqual(loadedAi.usage_metadata, ai.usage_metadata))
  check(
    'AIMessage.response_metadata.usage.credit 保留',
    (loadedAi.response_metadata as { usage?: { credit?: number } })?.usage?.credit === 0.02
  )
  check(
    'AIMessage.reasoning_content 保留',
    (loadedAi.additional_kwargs as Record<string, unknown>).reasoning_content ===
      '用户要我读文件，先调用工具。'
  )

  console.log('\n[6] 账本往返')
  check('channel_versions 一致', deepEqual(tuple.checkpoint.channel_versions, { messages: 'cp-2' }))
  check(
    'versions_seen 一致',
    deepEqual(tuple.checkpoint.versions_seen, { model: { messages: 'cp-2' } })
  )
  check('checkpoint.id 是最后一次 put 的', tuple.checkpoint.id === 'cp-2', tuple.checkpoint.id)
  check(
    'metadata 是最后一次 put 的',
    tuple.metadata?.step === 0 && tuple.metadata?.source === 'loop'
  )
  check('pendingWrites 为空', (tuple.pendingWrites ?? []).length === 0)

  console.log('\n[7] 只增不重复（进程重启后仍按库内条数做差）')
  closeCheckpointStore()
  openCheckpointStore(database)
  const saver2 = getCheckpointStore()
  const again = await saver2.put(
    { configurable: { thread_id: THREAD } },
    makeCheckpoint('cp-3', [human, ai, tool, aborted]),
    makeMetadata('loop', 1)
  )
  const count = database
    .prepare(`SELECT COUNT(*) AS n FROM ${MESSAGES} WHERE conversation_id = ?`)
    .get(THREAD) as { n: number }
  check('重复 put 不再插入', count.n === 4, `实际 ${count.n}`)
  check(
    '返回新 checkpoint_id',
    again.configurable?.checkpoint_id === 'cp-3',
    String(again.configurable?.checkpoint_id)
  )

  console.log('\n[8] RemoveMessage 显式抛错')
  let threw = false
  try {
    await saver2.put(
      { configurable: { thread_id: THREAD } },
      makeCheckpoint('cp-4', [human, new RemoveMessage({ id: 'msg-ai-1' })]),
      makeMetadata('loop', 2)
    )
  } catch (err) {
    threw = err instanceof Error && err.message.includes('RemoveMessage')
  }
  check('messages 变短时抛错', threw)

  console.log('\n[9] 会话不存在时账本写不进去要报错')
  // 用没落过库的消息 | 主键已统一成消息身份 复用human会先撞主键 测不到账本这条路径
  const orphanMessage = new HumanMessage({ content: '孤儿消息', id: 'msg-orphan-1' })
  let missingThrew = false
  try {
    await saver2.put(
      { configurable: { thread_id: 'conv-not-exists' } },
      makeCheckpoint('cp-x', [orphanMessage]),
      makeMetadata('input', -1)
    )
  } catch (err) {
    missingThrew = err instanceof Error && err.message.includes('不在')
  }
  check('会话行缺失时抛错', missingThrew)
  const orphan = database
    .prepare(`SELECT COUNT(*) AS n FROM ${MESSAGES} WHERE conversation_id = ?`)
    .get('conv-not-exists') as { n: number }
  check('抛错时消息已回滚', orphan.n === 0, `实际 ${orphan.n}`)

  console.log('\n[10] 子图拒绝')
  let nsThrew = false
  try {
    await saver2.put(
      { configurable: { thread_id: THREAD, checkpoint_ns: 'sub' } },
      makeCheckpoint('cp-y', [human]),
      makeMetadata('loop', 3)
    )
  } catch (err) {
    nsThrew = err instanceof Error && err.message.includes('子图')
  }
  check('checkpoint_ns 非空时抛错', nsThrew)

  console.log('\n[11] 体积')
  const size = database
    .prepare(
      `SELECT SUM(LENGTH(source_data) + LENGTH(message) + LENGTH(metadata) + LENGTH(expand)) AS bytes FROM ${MESSAGES}`
    )
    .get() as { bytes: number }
  console.log(
    `  ${MESSAGES} 4 条共 ${size.bytes} 字节 | 平均 ${Math.round(size.bytes / 4)} 字节/条`
  )

  database.close()

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
