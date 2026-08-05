import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePaper, resolvePageSize, viewModeForPaper } from '../src/lib/viewModes.js'

test('未知纸张回退到文档模式', () => {
  assert.equal(normalizePaper('unknown'), 'wide')
  assert.equal(viewModeForPaper('unknown'), 'document')
})

test('A4 页面保持纵横比', () => {
  const page = resolvePageSize('a4', 700)
  assert.equal(page.w, 700)
  assert.ok(Math.abs(page.h / page.w - 1123 / 794) < 0.002)
})

test('页面宽度有上下界，窄窗口不会被强制撑到 600px', () => {
  assert.equal(resolvePageSize('a4', 300).w, 420)
  assert.equal(resolvePageSize('a4', 2000).w, Math.round(794 * 1.15))
})

test('文档模式没有固定页高', () => {
  assert.deepEqual(resolvePageSize('wide', 1200), { w: 880, h: 0 })
})
