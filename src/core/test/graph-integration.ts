/**
 * 转换层与 LangGraph 的集成自检
 *
 * 用假模型跑真实的 StateGraph：验证 put / getTuple / updateState 在图的执行流程里
 * 都按预期工作，且工具往返的消息正确落库。不调真实模型，不产生费用。
 *
 * 跑法：
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs src/core/test/graph-integration.ts
 *   Remove-Item Env:\ELECTRON_RUN_AS_NODE
 */
import BetterSqlite3 from 'better-sqlite3'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ChatResult } from '@langchain/core/outputs'
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  closeCheckpointStore,
  getCheckpointStore,
  openCheckpointStore
} from '../langchain/checkpoint'

const THREAD = 'conv-graph'
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

/** 假模型 | 按顺序吐出预设消息 */
class StubChatModel extends BaseChatModel {
  private readonly queue: BaseMessage[]

  constructor(responses: BaseMessage[]) {
    super({})
    this.queue = [...responses]
  }

  _llmType(): string {
    return 'stub'
  }

  async _generate(): Promise<ChatResult> {
    const message = this.queue.shift() ?? new AIMessage('没有更多预设响应')
    return {
      generations: [{ text: typeof message.content === 'string' ? message.content : '', message }]
    }
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

  // 工具：读文件 | 只回固定内容
  const readTool = tool(async ({ path }: { path: string }) => `(${path}) 文件内容`, {
    name: 'read',
    description: '读一个文件',
    schema: z.object({ path: z.string() })
  })

  // 第一轮：模型要调工具 -> 工具跑 -> 模型再回一句
  const model = new StubChatModel([
    new AIMessage({
      content: '',
      id: 'ai-tool-call',
      tool_calls: [{ id: 'call-read-1', name: 'read', args: { path: 'README.md' } }]
    }),
    new AIMessage({ content: 'README 里写的是幻雨。', id: 'ai-final' })
  ])

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('model', async (state: { messages: BaseMessage[] }) => ({
      messages: [await model.invoke(state.messages)]
    }))
    .addNode('tools', new ToolNode([readTool]))
    .addEdge(START, 'model')
    .addConditionalEdges('model', toolsCondition, ['tools', END])
    .addEdge('tools', 'model')
    .compile({ checkpointer: getCheckpointStore() })

  const config = { configurable: { thread_id: THREAD } }

  console.log('[1] 跑一轮带工具的对话')
  const result = await graph.invoke(
    { messages: [new HumanMessage({ content: '读一下 README', id: 'human-1' })] },
    config
  )
  check('invoke 正常返回', Array.isArray(result.messages))

  const rows = database
    .prepare(
      `SELECT seq, message, metadata FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq`
    )
    .all(THREAD) as { seq: number; message: string; metadata: string }[]

  check(
    '落库 4 条（用户 + 调工具的AI + 工具结果 + 最终AI）',
    rows.length === 4,
    `实际 ${rows.length}`
  )
  check(
    'seq 从 1 连续到 4',
    rows.map((item) => item.seq).join(',') === '1,2,3,4',
    rows.map((item) => item.seq).join(',')
  )

  const types = rows.map((row) => (JSON.parse(row.message) as { id?: string }).id)
  check(
    '每条都有消息 id',
    types.every((id) => typeof id === 'string' && id.length > 0)
  )

  const metas = rows.map((row) => JSON.parse(row.metadata) as { source: string; step: number })
  console.log(`  metadata: ${metas.map((meta) => `${meta.source}:${meta.step}`).join(' ')}`)
  check(
    'metadata.source 合法',
    metas.every((meta) => ['input', 'loop', 'update', 'fork'].includes(meta.source)),
    metas.map((meta) => meta.source).join(',')
  )
  check(
    'step 单调不减',
    metas.slice(1).every((meta, index) => meta.step >= metas[index].step),
    metas.map((meta) => meta.step).join(',')
  )

  console.log('\n[2] 工具配对')
  const parsed = rows.map((row) => JSON.parse(row.message) as Record<string, unknown>)
  const aiWithCalls = parsed.find(
    (item) => Array.isArray(item.tool_calls) && (item.tool_calls as unknown[]).length > 0
  )
  const toolResult = parsed.find((item) => typeof item.tool_call_id === 'string')
  const callId = ((aiWithCalls?.tool_calls as { id: string }[] | undefined) ?? [])[0]?.id
  check('AI 发起过工具调用', callId !== undefined, String(callId))
  check(
    '工具结果能对上 tool_call_id',
    toolResult?.tool_call_id === callId,
    String(toolResult?.tool_call_id)
  )
  check('工具结果状态是 success', toolResult?.status === 'success', String(toolResult?.status))

  console.log('\n[3] getState 读回来')
  const state = await graph.getState(config)
  const messages = (state.values.messages ?? []) as BaseMessage[]
  check('getState 拿到 4 条', messages.length === 4, `实际 ${messages.length}`)
  check(
    '每条都有 hyField',
    messages.every((item) => item.hyField !== undefined)
  )
  check(
    'hyField.seq 与库里一致',
    messages.map((item) => item.hyField?.seq).join(',') === '1,2,3,4',
    messages.map((item) => item.hyField?.seq).join(',')
  )
  check(
    '最后一条是最终回复',
    messages[3].content === 'README 里写的是幻雨。',
    String(messages[3].content)
  )

  console.log('\n[4] 第二轮对话：接着往下追加')
  const model2 = new StubChatModel([new AIMessage({ content: '还有什么要问的？', id: 'ai-2' })])
  const graph2 = new StateGraph(MessagesAnnotation)
    .addNode('model', async (state: { messages: BaseMessage[] }) => ({
      messages: [await model2.invoke(state.messages)]
    }))
    .addEdge(START, 'model')
    .compile({ checkpointer: getCheckpointStore() })
  await graph2.invoke({ messages: [new HumanMessage({ content: '没了', id: 'human-2' })] }, config)

  const rows2 = database
    .prepare(`SELECT seq FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq`)
    .all(THREAD) as { seq: number }[]
  check('第二轮后 6 条', rows2.length === 6, `实际 ${rows2.length}`)
  check(
    'seq 继续连续到 6',
    rows2.map((item) => item.seq).join(',') === '1,2,3,4,5,6',
    rows2.map((item) => item.seq).join(',')
  )

  console.log('\n[5] 中断：updateState 追加 aborted 而不是替换')
  const aborted = new AIMessage({
    content: '说到一半',
    id: 'ai-aborted',
    additional_kwargs: { status: 'aborted' }
  })
  aborted.hyCustom = { aborted: true }
  await graph2.updateState(config, { messages: [aborted] })

  const rows3 = database
    .prepare(`SELECT seq, message FROM ${MESSAGES} WHERE conversation_id = ? ORDER BY seq`)
    .all(THREAD) as { seq: number; message: string }[]
  check('追加后 7 条', rows3.length === 7, `实际 ${rows3.length}`)
  const last = JSON.parse(rows3[6].message) as {
    hy_custom?: { aborted?: boolean }
    additional_kwargs?: { status?: string }
  }
  check(
    'aborted 落在 hy_custom 里',
    last.hy_custom?.aborted === true,
    JSON.stringify(last.hy_custom)
  )
  check('原有 additional_kwargs 保留', last.additional_kwargs?.status === 'aborted')

  const abortedMeta = database
    .prepare(`SELECT metadata FROM ${MESSAGES} WHERE conversation_id = ? AND seq = 7`)
    .get(THREAD) as { metadata: string }
  check(
    'updateState 落库的 metadata.source = update',
    (JSON.parse(abortedMeta.metadata) as { source: string }).source === 'update',
    (JSON.parse(abortedMeta.metadata) as { source: string }).source
  )

  const stateAfter = await graph2.getState(config)
  const messagesAfter = (stateAfter.values.messages ?? []) as BaseMessage[]
  check('getState 7 条', messagesAfter.length === 7, `实际 ${messagesAfter.length}`)
  check('最后一条 hyCustom.aborted 可读', messagesAfter[6].hyCustom?.aborted === true)

  console.log('\n[6] 体积对比')
  const bytes = database
    .prepare(`SELECT SUM(LENGTH(source_data) + LENGTH(message)) AS bytes FROM ${MESSAGES}`)
    .get() as { bytes: number }
  const ledger = database
    .prepare(`SELECT LENGTH(langgraph_state) AS bytes FROM ${CONVERSATIONS} WHERE id = ?`)
    .get(THREAD) as { bytes: number }
  console.log(`  7 条消息共 ${bytes.bytes} 字节 | 账本 ${ledger.bytes} 字节`)
  check('账本不随消息线性膨胀', ledger.bytes < 500, `${ledger.bytes} 字节`)

  closeCheckpointStore()
  database.close()

  console.log(`\n========== ${passed} 通过 / ${failed} 失败 ==========`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
