// 回归测试：验证 IDB driver 在 memory 后端下能正确写入 / 读出 docs 与 meta。
// 历史 bug：put() 柯里化形态错误，导致 doc 对象根本没传进去 → IDB 抛 DataError。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, createMemoryDriver } from '../src/lib/idb.js'

test('memory driver 写入并读出 doc', async () => {
  const store = createStorage({ driver: createMemoryDriver() })
  await store.setDoc({ id: 'a', title: 'A', content: '<p>hi</p>' })
  const got = await store.getDoc('a')
  assert.equal(got?.title, 'A')
  assert.equal(got?.content, '<p>hi</p>')
})

test('memory driver 写入并读出 meta（key/value 形式）', async () => {
  const store = createStorage({ driver: createMemoryDriver() })
  await store.setMeta('theme', 'night')
  const got = await store.getMeta('theme')
  assert.equal(got, 'night')
})

test('memory driver getAllDocs 返回数组', async () => {
  const store = createStorage({ driver: createMemoryDriver() })
  await store.setDoc({ id: '1', title: 'one', content: '' })
  await store.setDoc({ id: '2', title: 'two', content: '' })
  const all = await store.getAllDocs()
  assert.equal(all.length, 2)
  assert.ok(all.find((d) => d.id === '1'))
  assert.ok(all.find((d) => d.id === '2'))
})

test('memory driver deleteDoc', async () => {
  const store = createStorage({ driver: createMemoryDriver() })
  await store.setDoc({ id: 'x', title: 'X', content: '' })
  await store.deleteDoc('x')
  const got = await store.getDoc('x')
  assert.equal(got, null)
})

test('memory driver 多 meta key 共存', async () => {
  const store = createStorage({ driver: createMemoryDriver() })
  await store.setMeta('theme', 'night')
  await store.setMeta('groups', [{ id: 'g1', name: '我的文件夹' }])
  assert.equal(await store.getMeta('theme'), 'night')
  assert.deepEqual(await store.getMeta('groups'), [{ id: 'g1', name: '我的文件夹' }])
})