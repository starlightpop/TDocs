import test from 'node:test'
import assert from 'node:assert/strict'
import { findAllTextRanges } from '../src/lib/search.js'
import { appendVersion } from '../src/lib/versionHistory.js'

test('查找返回全部非重叠文本范围', () => {
  assert.deepEqual(findAllTextRanges('one two one', 'one'), [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ])
})

test('查找默认不区分大小写', () => {
  assert.equal(findAllTextRanges('TDocs tdocs', 'tdocs').length, 2)
  assert.equal(findAllTextRanges('TDocs tdocs', 'tdocs', true).length, 1)
})

test('相同内容不会重复保存自动版本', () => {
  const first = appendVersion([], { title: 'A', content: '<p>x</p>', createdAt: 1 })
  const second = appendVersion(first, { title: 'A', content: '<p>x</p>', createdAt: 2 })
  assert.equal(second.length, 1)
})

test('手动版本可强制保存并遵守数量上限', () => {
  let versions = []
  for (let i = 0; i < 5; i += 1) {
    versions = appendVersion(versions, { title: 'A', content: String(i), force: true, createdAt: i + 1 }, 3)
  }
  assert.equal(versions.length, 3)
  assert.equal(versions[0].content, '4')
})
