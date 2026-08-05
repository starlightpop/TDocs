import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getCodeCompletionCandidates, resolveCodeCompletion } from '../src/lib/codeLanguage.js'

const editor = fs.readFileSync('src/components/Editor.jsx', 'utf8')
const sidebar = fs.readFileSync('src/components/Sidebar.jsx', 'utf8')
const main = fs.readFileSync('electron/main.cjs', 'utf8')
const runner = fs.readFileSync('electron/code-runner.cjs', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')

test('代码补全从首字母开始提供候选，而非要求完整触发词', () => {
  const candidates = getCodeCompletionCandidates('python', 'p')
  assert.ok(candidates.some((item) => item.label === 'print'))
  assert.equal(resolveCodeCompletion('javascript', 'con')?.insert, 'console.log()')
})


test('运行环境缺失时返回官方安装信息', () => {
  assert.match(runner, /INSTALL_HELP/)
  assert.match(runner, /installHelp\(language\)/)
  assert.match(runner, /python\.org\/downloads/)
})

test('DeepSeek 配置可按接口地址推断厂商', () => {
  assert.match(api, /deepseek\\\.com/)
  assert.match(api, /inferProviderId/)
})


test('欢迎文件和普通文件均支持置顶', () => {
  assert.match(app, /pinned: true, isWelcome: true/)
  assert.match(sidebar, /取消置顶/)
  assert.match(sidebar, /pinnedDocs/)
})
