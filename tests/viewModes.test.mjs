import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePaper, resolvePageSize, viewModeForPaper } from '../src/lib/viewModes.js'

test('未知纸张回退到文档模式', () => {
  assert.equal(normalizePaper('unknown'), 'wide')
  assert.equal(viewModeForPaper('unknown'), 'document')
})

test('A4 在 100% 下使用固定 96 CSS DPI 尺寸', () => {
  assert.deepEqual(resolvePageSize('a4'), { w: 794, h: 1123 })
  assert.ok(Math.abs(794 / 1123 - 210 / 297) < 0.001)
})

test('B5 使用固定纸张比例', () => {
  assert.deepEqual(resolvePageSize('b5'), { w: 665, h: 945 })
  assert.ok(Math.abs(665 / 945 - 176 / 250) < 0.002)
})

test('文档模式没有固定页高', () => {
  assert.deepEqual(resolvePageSize('wide'), { w: 880, h: 0 })
})
