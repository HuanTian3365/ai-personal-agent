/**
 * core 层自检脚本。
 * 跑法：pnpm test（= tsx src/core/test/test.ts）
 *
 * 只用 node:assert，不引入测试框架。断言失败直接抛错，进程退出码非 0。
 */
import assert from 'node:assert/strict'
import { parseContent, parseReasoning } from '../utils/parseStream'

/** 打印一条通过的检查项 */
function ok(name: string): void {
  console.log(`  ✓ ${name}`)
}

console.log('\n[1] parseContent：从 content 取正文增量')

assert.equal(parseContent('你好'), '你好')
assert.equal(
  parseContent([
    { type: 'text', text: 'a' },
    { type: 'text', text: 'b' }
  ]),
  'a\nb'
)
assert.equal(parseContent(undefined), '')
assert.equal(parseContent([{ type: 'image_url' }]), '')
ok('字符串 / 文本块数组 / 非文本块 / 空值')

console.log('\n[2] parseReasoning：从 additional_kwargs 取思考增量')

assert.equal(parseReasoning({ additional_kwargs: { reasoning_content: '想想' } }), '想想')
assert.equal(parseReasoning({ additional_kwargs: {} }), '')
assert.equal(parseReasoning({}), '')
ok('reasoning_content 有值 / 缺失两种情况')

console.log('')
