import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const editor = fs.readFileSync('src/components/Editor.jsx', 'utf8')
const sidebar = fs.readFileSync('src/components/Sidebar.jsx', 'utf8')
const settings = fs.readFileSync('src/components/SettingsDialog.jsx', 'utf8')
const main = fs.readFileSync('electron/main.cjs', 'utf8')

test('0.2.0 仅保留文档工作区', () => {
  assert.doesNotMatch(app, /kind === 'word'|showPageMenu|pagePad|changePaper/)
  assert.doesNotMatch(editor, /const Page =|PageBreak|runReflow|splitCodeBlockAcrossPages|pm-page/)
  assert.doesNotMatch(sidebar, /新建.*Word|A4|B5/)
  assert.doesNotMatch(settings, /Word 排版|tab === 'word'/)
})

test('新建入口是单一文档按钮', () => {
  assert.match(sidebar, /new-doc-button/)
  assert.doesNotMatch(sidebar, /new-doc-split|new-doc-arrow/)
})

test('代码块使用统一行高和可点击语言选择', () => {
  const css = fs.readFileSync('src/app.css', 'utf8')
  assert.match(css, /--code-line-height: 25px/)
  assert.match(css, /code-language-select[\s\S]*pointer-events: auto/)
  assert.match(editor, /className = 'code-language-select'/)
})

test('编辑器保留中文完整右键菜单', () => {
  for (const label of ['撤销', '重做', '剪切', '复制', '粘贴', '全选', '加粗', '斜体', '高亮', '清除格式', 'AI 改写']) {
    assert.match(editor, new RegExp(label))
  }
  assert.match(main, /编辑器使用应用内中文菜单/)
})

test('macOS 双击标题栏通过主进程切换最大化', () => {
  assert.match(app, /handleTitlebarDoubleClick/)
  assert.match(main, /toggle-maximize/)
})
