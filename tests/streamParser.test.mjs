// streamParser 单元测试：SSE 解析纯函数 + OpenAI delta 抽取。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSseParser, extractDeltaText, parseSseStream } from '../src/lib/streamParser.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.resolve(here, '..', 'src/lib/streamParser.js'), 'utf8')

test('streamParser 源文件存在并导出关键 API', () => {
  assert.match(src, /export function createSseParser/)
  assert.match(src, /export function parseSseStream/)
  assert.match(src, /export function extractDeltaText/)
})

test('createSseParser: data: {...}\\n\\n 触发 onEvent，并取 delta.content', () => {
  const events = []
  const parser = createSseParser({ onEvent: (e) => events.push(e) })
  parser.push('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')
  assert.equal(events.length, 1)
  assert.match(events[0].data, /"content":"Hi"/)
})

test('parseSseStream: 多个 chunk + [DONE] 终止', () => {
  const chunks = []
  const lines = [
    'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    'data: {"choices":[{"delta":{"content":", world"}}]}',
    'data: {"choices":[{"delta":{"content":"!"}}]}',
    'data: [DONE]',
  ]
  let onEventCount = 0
  const parser = createSseParser({
    onEvent: (e) => {
      const text = extractDeltaText(e.data)
      if (text) {
        chunks.push(text)
        onEventCount += 1
      }
    },
  })
  for (const line of lines) parser.push(line + '\n\n')
  parser.flush()
  assert.deepEqual(chunks, ['Hello', ', world', '!'])
  assert.equal(onEventCount, 3)
})

test('parseSseStream: 缺失尾部换行容错（flush 仍能解出残余事件）', () => {
  const seen = []
  parseSseStream(['data: {"choices":[{"delta":{"content":"abc"}}]}'], (text) => seen.push(text))
  assert.deepEqual(seen, ['abc'])
})

test('extractDeltaText 兼容 choices[0].delta.content 字符串', () => {
  assert.equal(extractDeltaText('{"choices":[{"delta":{"content":"ok"}}]}'), 'ok')
})

test('extractDeltaText 兼容 choices[0].text', () => {
  assert.equal(extractDeltaText('{"choices":[{"text":"fallback"}]}'), 'fallback')
})

test('extractDeltaText 对非法 JSON 返回空串', () => {
  assert.equal(extractDeltaText('not json'), '')
  assert.equal(extractDeltaText(''), '')
})

test('createSseParser: 多个 data 字段折叠（多行 event）', () => {
  const events = []
  const parser = createSseParser({ onEvent: (e) => events.push(e) })
  parser.push('data: line1\ndata: line2\n\n')
  assert.equal(events.length, 1)
  assert.equal(events[0].data, 'line1\nline2')
})

test('createSseParser: [DONE] 触发 done', () => {
  let done = false
  const parser = createSseParser({
    onEvent: () => {},
    onDone: () => { done = true },
  })
  parser.push('data: [DONE]\n\n')
  assert.equal(done, true)
})

test('extractDeltaText: 流式多 chunk 拼接=完整文本', () => {
  const full = ['Hello', ',', ' ', 'world', '!'].reduce(
    (acc, chunk) => acc + (chunk.length ? extractDeltaText(`{"choices":[{"delta":{"content":"${chunk}"}}]}`) : ''),
    '',
  )
  assert.equal(full, 'Hello, world!')
})

test('parseSseStream: 标点/中文 delta 顺序正确', () => {
  const collected = []
  parseSseStream(
    [
      'data: {"choices":[{"delta":{"content":"你好"}}]}',
      'data: {"choices":[{"delta":{"content":"，"}}]}',
      'data: {"choices":[{"delta":{"content":"TDocs"}}]}',
      'data: {"choices":[{"delta":{"content":"。"}}]}',
      'data: [DONE]',
    ],
    (t) => collected.push(t),
  )
  assert.equal(collected.join(''), '你好，TDocs。')
})

test('streamParser.js 不依赖 fetch / 浏览器 API', () => {
  // 不应 import fetch / DOMParser / document / window，便于 Node 环境测试
  assert.doesNotMatch(src, /import\s+.*fetch/)
  assert.doesNotMatch(src, /\bfetch\(/)
  assert.doesNotMatch(src, /DOMParser/)
  assert.doesNotMatch(src, /\bdocument\./)
})
