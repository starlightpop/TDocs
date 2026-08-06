import test from 'node:test'
import assert from 'node:assert/strict'
import { searchDocs, splitHighlight, stripHtml, makeSnippet } from '../src/lib/quickSearch.js'

const docs = [
  { id: 'a', title: '欢迎使用 TDocs', content: '<p>TDocs 0.2.0-preview 聚焦稳定的本地文档编辑。</p>', updatedAt: 3 },
  { id: 'b', title: 'AI 改写指南', content: '<p>介绍如何使用 AI 改写润色精简扩写正式口语。</p>', updatedAt: 2 },
  { id: 'c', title: '代码块使用说明', content: '<p>Python / JavaScript code run。</p>', updatedAt: 1 },
  { id: 'd', title: '关于', content: '<p>本文档描述项目的设计目标。</p>', updatedAt: 4 },
]

test('stripHtml 剥 HTML 标签并压空白', () => {
  assert.equal(stripHtml('<p>hello <b>world</b></p>'), 'hello world')
  assert.equal(stripHtml('<div>  spaced   out  </div>'), 'spaced out')
})

test('空查询返回最近文档（按 updatedAt 倒序）', () => {
  const out = searchDocs(docs, '', { recentLimit: 2 })
  assert.equal(out.length, 2)
  assert.equal(out[0].doc.id, 'd', 'updatedAt=4 排第一')
  assert.equal(out[1].doc.id, 'a', 'updatedAt=3 排第二')
})

test('标题命中优先于正文命中', () => {
  const out = searchDocs(docs, 'AI')
  assert.ok(out.length >= 1)
  // 第一条应该是命中标题的 B
  assert.equal(out[0].doc.id, 'b')
  assert.equal(out[0].inTitle, true)
})

test('中文与英文标题都能匹配', () => {
  assert.ok(searchDocs(docs, '代码').find((r) => r.doc.id === 'c'))
  // "code" 在 Node 测试环境用 fallback stripHtml：<p>...</p> → 内容文本是 'Python / JavaScript code run。' 包含 code
  assert.ok(searchDocs(docs, 'code').find((r) => r.doc.id === 'c'))
  assert.ok(searchDocs(docs, '欢迎').find((r) => r.doc.id === 'a'))
  assert.ok(searchDocs(docs, 'welcome').length === 0)
})

test('正文命中附带高亮片段', () => {
  const out = searchDocs(docs, 'Python')
  assert.equal(out.length, 1)
  assert.equal(out[0].doc.id, 'c')
  assert.equal(out[0].inTitle, false)
  assert.ok(out[0].snippet.includes('Python'), '片段应包含命中词')
})

test('无任何命中返回空数组', () => {
  assert.equal(searchDocs(docs, 'nope').length, 0)
})

test('makeSnippet 在 hit 前后裁 contextWidth 字符', () => {
  const text = '0123456789abcdefghijklmnopqrstuvwxyz'
  const snip = makeSnippet(text, 'cde', 3)
  assert.ok(snip.includes('cde'))
  assert.ok(snip.length < text.length)
})

test('splitHighlight 正确切出命中段', () => {
  const parts = splitHighlight('hello WORLD!', 'world')
  assert.equal(parts.length, 3)
  assert.equal(parts[0].match, false)
  assert.equal(parts[1].match, true)
  assert.equal(parts[1].text, 'WORLD')
  assert.equal(parts[2].match, false)
})
