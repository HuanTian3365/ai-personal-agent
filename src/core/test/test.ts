/**
 * core 层自检脚本。
 * 跑法：pnpm test（= tsx src/core/test/test.ts）
 *
 * 只用 node:assert，不引入测试框架。断言失败直接抛错，进程退出码非 0。
 */
import assert from 'node:assert/strict'
import { toChatMessage } from '../utils/mappingMessage'
import { AIMessage, HumanMessage } from 'langchain'

/** 打印一条通过的检查项 */
function ok(name: string): void {
  console.log(`  ✓ ${name}`)
}

console.log('\n[1] toChatMessage 投影（LangChain 消息 → 界面用的 MessageView）')

// 助手消息：reasoning 提到最前、正文其次；状态与用量从旁路字段读
const ai = new AIMessage({
  id: 'm2',
  content: '读完了',
  additional_kwargs: { reasoning_content: '先读文件', status: 'aborted' },
  response_metadata: { model_name: 'test-model', model_provider: 'openai' },
  usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
})

const projected = toChatMessage(ai)
assert.equal(projected.role, 'assistant')
assert.equal(projected.id, 'm2')
assert.equal(projected.status, 'aborted')
assert.equal(projected.metadata?.model, 'test-model')
assert.equal(projected.metadata?.provider, 'openai')
assert.equal(projected.metadata?.usage?.inputTokens, 10)
assert.equal(projected.metadata?.usage?.totalTokens, 15)
assert.deepEqual(
  projected.content.map((block) => block.type),
  ['reasoning', 'text']
)
ok('reasoning / text 的顺序，以及 status / model / usage 的投影')

// 用户消息：原文照投，id 原样带出
const human = toChatMessage(new HumanMessage({ content: '你好', id: 'u1' }))
assert.equal(human.role, 'user')
assert.equal(human.id, 'u1')
assert.deepEqual(human.content, [{ type: 'text', text: '你好' }])
ok('用户消息投影')

// 什么都没有的消息不能落成空气泡，要补一个 error block
const empty = toChatMessage(new AIMessage({ id: 'm3', content: '' }))
assert.equal(empty.content.length, 1)
assert.equal(empty.content[0].type, 'error')
ok('空消息补 error block')

console.log('')
