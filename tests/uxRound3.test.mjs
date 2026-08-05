import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const editor = fs.readFileSync('src/components/Editor.jsx', 'utf8')
const toolbar = fs.readFileSync('src/components/Toolbar.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const prompt = fs.readFileSync('src/components/AiPrompt.jsx', 'utf8')
const storage = fs.readFileSync('src/lib/storage.js', 'utf8')

test('代码运行入口位于代码块并支持当前行高亮', () => {
  assert.match(editor, /code-run-btn/)
  assert.match(editor, /tdocs:code-selection/)
  assert.doesNotMatch(toolbar, /runCode|runOutput|code-terminal/)
})

test('文档与 Word 是持久化的独立文件类型', () => {
  assert.match(storage, /kind === 'word'/)
  assert.match(app, /activeDoc\.kind === 'word'/)
  assert.doesNotMatch(app, /文档模式（无限画布）/)
})

test('AI 模型菜单只读取已配置厂商', () => {
  assert.match(prompt, /listConfiguredApiConfigs/)
  assert.match(prompt, /尚未配置厂商/)
})
