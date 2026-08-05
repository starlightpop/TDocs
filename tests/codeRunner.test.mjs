import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { inferLanguage, runCode } = require('../electron/code-runner.cjs')

test('纯文本中的 print 调用识别为 Python', () => {
  assert.equal(inferLanguage('print("p")'), 'python')
})

test('JavaScript 运行返回真实标准输出', async () => {
  const result = await runCode({ language: 'javascript', code: 'console.log("p")' })
  assert.equal(result.ok, true)
  assert.equal(result.stdout, 'p')
  assert.equal(result.stderr, '')
})

test('无法识别的纯文本不会伪装成 JavaScript 执行', async () => {
  const result = await runCode({ language: 'plaintext', code: '普通文字' })
  assert.equal(result.ok, false)
  assert.match(result.stderr, /无法判断代码语言/)
})
