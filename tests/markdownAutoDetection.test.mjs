import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  looksLikeMarkdown,
  renderMarkdown,
  shouldPreferMarkdownPaste,
} from '../src/lib/markdown.js'

const editorSource = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')

test('单行与多行 Markdown 都能被识别', () => {
  assert.equal(looksLikeMarkdown('# 标题'), true)
  assert.equal(looksLikeMarkdown('- 列表项'), true)
  assert.equal(looksLikeMarkdown('**重点内容**'), true)
  assert.equal(looksLikeMarkdown('普通的一句话'), false)
})

test('剪贴板同时携带 HTML 时仍优先识别明确 Markdown', () => {
  assert.equal(shouldPreferMarkdownPaste('# 标题', '<div># 标题</div>'), true)
  assert.equal(shouldPreferMarkdownPaste('**重点内容**', '<span>**重点内容**</span>'), true)
  assert.equal(shouldPreferMarkdownPaste('普通文字', '<strong>普通文字</strong>'), false)
})

test('Markdown 转换覆盖标题、列表与行内格式', () => {
  const html = renderMarkdown('# 标题\n\n- 项目\n\n**重点**')
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<strong>重点<\/strong>/)
})

test('编辑器同时注册粘贴检测和直接输入规则', () => {
  assert.match(editorSource, /shouldPreferMarkdownPaste\(text, html\)/)
  assert.match(editorSource, /const MarkdownTyping = Extension\.create/)
  assert.match(editorSource, /markInputRule/)
  assert.match(editorSource, /MarkdownTyping,/)
})
