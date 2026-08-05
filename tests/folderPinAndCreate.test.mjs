import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sidebar = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const storage = readFileSync(new URL('../src/lib/storage.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('folders can be pinned and create documents from their context menu', () => {
  assert.match(storage, /pinned: Boolean\(group\.pinned\)/)
  assert.match(sidebar, /label: '新建文档'[\s\S]*onCreate\(group\.id\)/)
  assert.match(sidebar, /group\.pinned \? '取消置顶' : '置顶'/)
  assert.match(sidebar, /orderedGroups\.map\(renderGroupSection\)/)
  assert.match(app, /onToggleGroupPin=\{handleToggleGroupPin\}/)
})

test('new document button is centered text without a plus icon', () => {
  assert.match(sidebar, />新建文档<\/button>/)
  assert.doesNotMatch(sidebar, /new-doc-button[^\n]*<Icon name="plus"/)
})
