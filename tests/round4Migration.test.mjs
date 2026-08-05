import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const toolbar = fs.readFileSync('src/components/Toolbar.jsx', 'utf8')

test('欢迎文件刷新一次且删除后不会自动重建', () => {
  assert.match(app, /WELCOME_SEED_KEY/)
  assert.match(app, /localStorage\.getItem\(WELCOME_SEED_KEY\) !== '1'/)
  assert.match(app, /return existing/)
})

test('DeepSeek URL 优先于旧版错误的 OpenAI 标签', () => {
  const start = api.indexOf('export function inferProviderId')
  const end = api.indexOf('function normalizeProfile')
  const body = api.slice(start, end)
  assert.ok(body.indexOf('deepseek\.com') < body.indexOf("return profile.provider"))
  assert.match(api, /const id = inferProviderId\(profile\)/)
})

test('代码块使用独立顶部工具栏状态', () => {
  assert.match(toolbar, /inCodeBlock/)
  assert.match(toolbar, /code-context-toolbar/)
  assert.match(toolbar, /语言、补全和运行位于代码块内部/)
})
