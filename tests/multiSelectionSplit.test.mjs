// 多选区拆分 / 合并 纯函数测试（不发起 HTTP）
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  joinChunksWithMarker,
  splitHtmlByMarker,
  reconcileChunks,
  SPLIT_MARKER,
} from '../src/lib/multiSelection.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.resolve(here, '..', 'src/lib/multiSelection.js'), 'utf8')

test('multiSelection.js 源码导出 joinChunksWithMarker / splitHtmlByMarker / reconcileChunks', () => {
  assert.match(src, /export function joinChunksWithMarker/)
  assert.match(src, /export function splitHtmlByMarker/)
  assert.match(src, /export function reconcileChunks/)
  assert.match(src, /SPLIT_MARKER/)
})

test('joinChunksWithMarker: 在每段前注入对应编号的占位符', () => {
  const joined = joinChunksWithMarker(['<p>A</p>', '<p>B</p>'])
  assert.match(joined, /<!--\s*TDOCS_SPLIT\s*0\s*-->/)
  assert.match(joined, /<!--\s*TDOCS_SPLIT\s*1\s*-->/)
  assert.match(joined, /<p>A<\/p>/)
  assert.match(joined, /<p>B<\/p>/)
})

test('splitHtmlByMarker: 按 TDOCS_SPLIT 拆分回独立段落', () => {
  const llm = [
    '<!--TDOCS_SPLIT 0--><p>Hello A!</p><!--TDOCS_SPLIT 1--><p>Bye B.</p><!--TDOCS_SPLIT 2-->',
  ].join('\n')
  const parts = splitHtmlByMarker(llm, SPLIT_MARKER)
  assert.equal(parts.length, 2)
  assert.equal(parts[0].trim(), '<p>Hello A!</p>')
  assert.equal(parts[1].trim(), '<p>Bye B.</p>')
})

test('splitHtmlByMarker: 缺失尾部标记仅返回 markers-1 段（补不到末尾段，交给 reconcile 回退原文）', () => {
  const llm = '<!--TDOCS_SPLIT 0--><p>X</p><!--TDOCS_SPLIT 1--><p>Y</p>'
  const parts = splitHtmlByMarker(llm, SPLIT_MARKER)
  // 2 个 markers → 返回 1 段。reconcile 阶段会以 fallback 填补缺失段。
  assert.equal(parts.length, 1)
  assert.equal(parts[0], '<p>X</p>')
})

test('reconcileChunks: 标准情况下未返回的最后一段 → fallback', () => {
  // LLM 只报告了 N-1 段（这不是预期，但属于容错场景）
  const chunks = ['<p>one</p>', '<p>two</p>']
  // 模拟返回只有第 0 段：“0 1”两 marker 只返 1 段。
  const segs = splitHtmlByMarker('<!--TDOCS_SPLIT 0--><p>ONE</p><!--TDOCS_SPLIT 1-->', SPLIT_MARKER)
  assert.equal(segs.length, 1)
  const r = reconcileChunks(chunks, segs)
  assert.equal(r.length, 2)
  assert.equal(r[0].status, 'ok')
  assert.equal(r[1].status, 'fallback')
})

test('splitHtmlByMarker: 空字符串返回空数组', () => {
  assert.deepEqual(splitHtmlByMarker('', SPLIT_MARKER), [])
  assert.deepEqual(splitHtmlByMarker(null, SPLIT_MARKER), [])
})

test('splitHtmlByMarker: 没有标记返回空数组（让 reconcileChunks 全部回退原文）', () => {
  const llm = '<p>no markers here</p>'
  const parts = splitHtmlByMarker(llm, SPLIT_MARKER)
  assert.deepEqual(parts, [])
})

test('reconcileChunks: 缺失段回退原文', () => {
  const original = ['<p>one</p>', '<p>two</p>', '<p>three</p>']
  const segs = ['<p>ONE</p>'] // 只返回了第 0 段
  const r = reconcileChunks(original, segs)
  assert.equal(r.length, 3)
  assert.equal(r[0].status, 'ok')
  assert.equal(r[1].status, 'fallback')
  assert.equal(r[1].html, '<p>two</p>')
  assert.equal(r[2].status, 'fallback')
  assert.equal(r[2].html, '<p>three</p>')
})

test('reconcileChunks: 段返回空字符串视为失败', () => {
  const original = ['<p>a</p>', '<p>b</p>']
  const segs = ['', '<p>B</p>']
  const r = reconcileChunks(original, segs)
  assert.equal(r[0].status, 'fallback')
  assert.equal(r[1].status, 'ok')
})

test('splitHtmlByMarker 标记可在大段文字内被正确切分（含换行/空白）', () => {
  const llm = [
    '<!--TDOCS_SPLIT 0-->',
    '<p>改写 1，包含</p><strong>HTML</strong>。',
    '<!--TDOCS_SPLIT 1-->',
    '<h2>改写 2</h2>',
    '<!--TDOCS_SPLIT 2-->',
  ].join('\n')
  const parts = splitHtmlByMarker(llm, SPLIT_MARKER)
  assert.equal(parts.length, 2)
  assert.match(parts[0], /改写 1/)
  assert.match(parts[0], /<strong>HTML<\/strong>/)
  assert.match(parts[1], /<h2>改写 2<\/h2>/)
})

test('多选区流式拆段：模拟一边收增量一边回填', () => {
  const chunks = ['<p>A</p>', '<p>B</p>', '<p>C</p>']
  // 假装 LLM 一次只给出一段
  let buffer = ''
  buffer += '<!--TDOCS_SPLIT 0--><p>A!</p><!--TDOCS_SPLIT 1-->'
  let reconciled = reconcileChunks(chunks, splitHtmlByMarker(buffer, SPLIT_MARKER))
  assert.equal(reconciled.length, 3)
  assert.equal(reconciled[0].status, 'ok')
  assert.equal(reconciled[0].html, '<p>A!</p>')
  assert.equal(reconciled[1].status, 'fallback')
  // 继续收到第二段
  buffer += '<p>B!</p><!--TDOCS_SPLIT 2--><p>C!</p><!--TDOCS_SPLIT 3-->'
  reconciled = reconcileChunks(chunks, splitHtmlByMarker(buffer, SPLIT_MARKER))
  assert.equal(reconciled[0].html, '<p>A!</p>')
  assert.equal(reconciled[1].html, '<p>B!</p>')
  assert.equal(reconciled[2].html, '<p>C!</p>')
})
