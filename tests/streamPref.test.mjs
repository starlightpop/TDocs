// 验证流式开关的本地存储契约。
// Node 测试环境没有 DOM/localStorage，但我们的实现用 try/catch 兜底。
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadStreamPref, saveStreamPref } from '../src/lib/api.js'

test('默认流式开启（无 localStorage 时返回 true）', () => {
  // 在 Node 里 localStorage 不存在 → catch 路径 → 返回 true
  const original = globalThis.localStorage
  // 故意把 localStorage 干掉，确保走 catch
  delete globalThis.localStorage
  try {
    assert.equal(loadStreamPref(), true)
  } finally {
    if (original !== undefined) globalThis.localStorage = original
  }
})

test('saveStreamPref + loadStreamPref 双向写出与读取', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  try {
    saveStreamPref(false)
    assert.equal(loadStreamPref(), false)
    saveStreamPref(true)
    assert.equal(loadStreamPref(), true)
    // 写入的格式是 '0' / '1'
    assert.equal(store.get('tdocs.ai.stream'), '1')
  } finally {
    delete globalThis.localStorage
  }
})

test('saveStreamPref 在不存在 localStorage 时静默失败', () => {
  delete globalThis.localStorage
  // 不应抛错
  assert.doesNotThrow(() => saveStreamPref(false))
})
