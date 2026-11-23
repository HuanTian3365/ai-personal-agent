/**
 * 新旧并存的回退自检
 *
 * 迁移前：老会话的 langgraph_state 还是空的，getTuple 要回退去读 hy_checkpoints；
 * 迁移后：旧表没了，同一个会话只能走新路。两种状态都要能读。
 *
 * 跑法：
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs src/core/test/legacy-fallback.ts
 *   Remove-Item Env:\ELECTRON_RUN_AS_NODE
 */
import BetterSqlite3 from 'better-sqlite3'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { JsonPlusSerializer } from '@langchain/langgraph-checkpoint'
import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import {
  closeCheckpointStore,
  getCheckpointStore,
  openCheckpointStore
} from '../langchain/checkpoint'

const serde = new JsonPlusSerializer()
const OLD_THREAD = 'conv-legacy'
const NEW_THREAD = 'conv-new'

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

async function main(): Promise<void> {
  const database = new BetterSqlite3(':memory:')
  database.exec(`
    CREATE TABLE hy_conversation (id TEXT PRIMARY KEY, langgraph_state TEXT NOT NULL DEFAULT '{}');
    INSERT INTO hy_conversation (id) VALUES ('${OLD_THREAD}');
    INSERT INTO hy_conversation (id) VALUES ('${NEW_THREAD}');
    CREATE TABLE hy_checkpoints (
      thread_id TEXT NOT NULL, checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL, parent_checkpoint_id TEXT, type TEXT,
      checkpoint BLOB, metadata BLOB,
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
    );
  `)

  // 造一份旧格式 checkpoint | 走 serde 和真实写入一致
  const oldMessages = [
    new HumanMessage({ content: '老会话的提问', id: 'old-human' }),
    new AIMessage({ content: '老会话的回答', id: 'old-ai' })
  ]
  const oldCheckpoint: Checkpoint = {
    v: 4,
    id: 'legacy-cp-1',
    ts: new Date().toISOString(),
    channel_values: { messages: oldMessages },
    channel_versions: { messages: 1 },
    versions_seen: { model: { messages: 1 } }
  }
  const oldMetadata: CheckpointMetadata = { source: 'loop', step: 0, parents: {} }
  const [[type1, serializedCheckpoint], [type2, serializedMetadata]] = await Promise.all([
    serde.dumpsTyped(oldCheckpoint),
    serde.dumpsTyped(oldMetadata)
  ])
  database
    .prepare(
      `INSERT INTO hy_checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
       VALUES (?, '', ?, NULL, ?, ?, ?)`
    )
    .run(OLD_THREAD, 'legacy-cp-1', type1, serializedCheckpoint, serializedMetadata)
  check('两份数据用了同一种序列化类型', type1 === type2)

  openCheckpointStore(database)
  const saver = getCheckpointStore()

  console.log('[1] 迁移前：老会话走旧表')
  const legacy = await saver.getTuple({ configurable: { thread_id: OLD_THREAD } })
  check('老会话能读到', legacy !== undefined)
  const legacyMessages = (legacy?.checkpoint.channel_values.messages ?? []) as BaseMessage[]
  check('读到 2 条', legacyMessages.length === 2, `实际 ${legacyMessages.length}`)
  check('内容正确', legacyMessages[1].content === '老会话的回答', String(legacyMessages[1].content))
  check('旧路不带 hyField（还没落新表）', legacyMessages[0].hyField === undefined)

  console.log('\n[2] 新会话走新表')
  await saver.put(
    { configurable: { thread_id: NEW_THREAD } },
    {
      v: 4,
      id: 'new-cp-1',
      ts: new Date().toISOString(),
      channel_values: { messages: [new HumanMessage({ content: '新会话', id: 'new-human' })] },
      channel_versions: { messages: 1 },
      versions_seen: { model: { messages: 1 } }
    },
    { source: 'loop', step: 0, parents: {} }
  )
  const fresh = await saver.getTuple({ configurable: { thread_id: NEW_THREAD } })
  const freshMessages = (fresh?.checkpoint.channel_values.messages ?? []) as BaseMessage[]
  check('新会话能读到', fresh !== undefined)
  check('新会话 1 条', freshMessages.length === 1, `实际 ${freshMessages.length}`)
  check('新会话带 hyField', freshMessages[0].hyField !== undefined)

  console.log('\n[3] 迁移后：旧表删了，老会话仍然能读')
  // 模拟迁移：把老会话的 messages 拆进新表 + 写账本
  database
    .prepare(
      `INSERT INTO hy_message (id, conversation_id, seq, source_data, message, metadata, expand, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'migrated-1',
      OLD_THREAD,
      1,
      JSON.stringify({
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'HumanMessage']
      }),
      JSON.stringify({
        id: 'old-human',
        content: '老会话的提问',
        additional_kwargs: {},
        response_metadata: {}
      }),
      '{}',
      JSON.stringify({ status: 'message' }),
      Date.now()
    )
  database.prepare(`UPDATE hy_conversation SET langgraph_state = ? WHERE id = ?`).run(
    JSON.stringify({
      checkpoint_id: 'legacy-cp-1',
      ts: new Date().toISOString(),
      metadata: { source: 'loop', step: 0, parents: {} },
      channel_versions: { messages: 1 },
      versions_seen: { model: { messages: 1 } },
      channel_values: {}
    }),
    OLD_THREAD
  )
  database.exec('DROP TABLE hy_checkpoints')

  // 换一个 saver 实例，让「旧表是否存在」的缓存重新算
  closeCheckpointStore()
  openCheckpointStore(database)
  const saver2 = getCheckpointStore()
  const afterMigrate = await saver2.getTuple({ configurable: { thread_id: OLD_THREAD } })
  check('旧表删了之后仍能读', afterMigrate !== undefined)
  const afterMessages = (afterMigrate?.checkpoint.channel_values.messages ?? []) as BaseMessage[]
  check('读到 1 条（迁移后的行）', afterMessages.length === 1, `实际 ${afterMessages.length}`)
  check('走新路所以带 hyField', afterMessages[0].hyField !== undefined)

  console.log('\n[4] 账本为空的会话 + 旧表不在 = 当成没跑过')
  database.prepare(`INSERT INTO hy_conversation (id) VALUES ('conv-empty')`).run()
  const empty = await saver2.getTuple({ configurable: { thread_id: 'conv-empty' } })
  check('返回 undefined', empty === undefined)

  closeCheckpointStore()
  database.close()

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
