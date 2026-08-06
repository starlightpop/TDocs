// diff.js 单元测试：纯函数 / 零 HTTP。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffWords, applyAcceptText } from '../src/lib/diff.js'

test('diffWords 在源码中存在且导出正确', () => {
  assert.equal(typeof diffWords, 'function')
  assert.equal(typeof applyAcceptText, 'function')
  const here = path.dirname(fileURLToPath(import.meta.url))
  const src = fs.readFileSync(path.resolve(here, '..', 'src/lib/diff.js'), 'utf8')
  assert.match(src, /export function diffWords/)
  assert.doesNotMatch(src, /\brequire\(/) // 不允许隐藏依赖
})

test('diffWords: 完全相同时不产生 add/del', () => {
  const ops = diffWords('hello world', 'hello world')
  assert.deepEqual(ops, [{ type: 'eq', text: 'hello world' }])
})

test('diffWords: 纯新增', () => {
  const ops = diffWords('', 'added text')
  const seen = ops.filter((o) => o.type !== 'eq')
  assert.equal(ops.find((o) => o.type === 'eq')?.text || null, null)
  assert.deepEqual(ops, [{ type: 'add', text: 'added text' }])
  assert.equal(applyAcceptText(ops), 'added text')
})

test('diffWords: 纯删除', () => {
  const ops = diffWords('old text', '')
  assert.deepEqual(ops, [{ type: 'del', text: 'old text' }])
  assert.equal(applyAcceptText(ops), '')
})

test('diffWords: 混合 add/del/eq（英文）', () => {
  const ops = diffWords('the quick brown fox', 'the slow brown dog')
  // 期望：'the ' eq, 'quick' del, 'slow' add, ' brown ' eq, 'fox' del, 'dog' add
  const eqParts = ops.filter((o) => o.type === 'eq').map((o) => o.text).join('')
  assert.match(eqParts, /the/)
  assert.match(eqParts, /brown/)
  assert.ok(ops.some((o) => o.type === 'add' && o.text === 'slow'))
  assert.ok(ops.some((o) => o.type === 'add' && o.text === 'dog'))
  assert.ok(ops.some((o) => o.type === 'del' && o.text === 'quick'))
  assert.ok(ops.some((o) => o.type === 'del' && o.text === 'fox'))
  // 应用差异：得到 'the slow brown dog'
  assert.equal(applyAcceptText(ops), 'the slow brown dog')
})

test('diffWords: 跨标点 / 中英混合', () => {
  const ops = diffWords('你好，TDocs', '你好，TDocs 2.0')
  const out = applyAcceptText(ops)
  assert.equal(out, '你好，TDocs 2.0')
})

test('diffWords: 完全不同的内容', () => {
  const ops = diffWords('aaa', 'bbb')
  assert.ok(ops.some((o) => o.type === 'del' && o.text === 'aaa'))
  assert.ok(ops.some((o) => o.type === 'add' && o.text === 'bbb'))
  assert.equal(applyAcceptText(ops), 'bbb')
})

test('diffWords: 操作数组结构单调且无覆盖', () => {
  const ops = diffWords('foo bar', 'foo baz qux')
  for (let i = 1; i < ops.length; i += 1) {
    assert.notEqual(ops[i].type, ops[i - 1].type, '相邻同类型应被合并')
  }
  assert.deepEqual([...ops].reverse().map((o) => o.type), ops.map((o) => o.type).slice().reverse())
})

test('applyAcceptText 跳过 del', () => {
  const ops = [
    { type: 'eq', text: 'a' },
    { type: 'del', text: 'X' },
    { type: 'add', text: 'Y' },
    { type: 'eq', text: 'b' },
  ]
  assert.equal(applyAcceptText(ops), 'aYb')
})

test('diffWords: 接受差异的输出与原 a 文本无关（即使修改率高）', () => {
  const before = 'completely different text here'
  const after = 'something else entirely now'
  const accepted = applyAcceptText(diffWords(before, after))
  assert.equal(accepted, after)
})

test('diff.js 文件 ≤ 200 行（满足"手写 LCS，无新依赖"约束）', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const lines = fs.readFileSync(path.resolve(here, '..', 'src/lib/diff.js'), 'utf8').split('\n').length
  assert.ok(lines <= 200, `diff.js 当前 ${lines} 行，超过 200 行上限`)
})
