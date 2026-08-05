from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


editor = read('src/components/Editor.jsx')
editor = editor.replace(
    "import { Mark, mergeAttributes } from '@tiptap/core'",
    "import { Extension, Mark, mergeAttributes, markInputRule } from '@tiptap/core'",
    1,
)
editor = editor.replace(
    "import { looksLikeMarkdown, renderMarkdown } from '../lib/markdown.js'",
    "import { looksLikeMarkdown, renderMarkdown, shouldPreferMarkdownPaste } from '../lib/markdown.js'",
    1,
)

markdown_typing = r'''
// ---------- Markdown 直接输入识别 ----------
// StarterKit 已处理标题、列表、引用、分割线与代码围栏；这里补齐行内 Markdown。
const MarkdownTyping = Extension.create({
  name: 'markdownTyping',
  addInputRules() {
    const marks = this.editor.schema.marks
    return [
      markInputRule({ find: /(?:^|\s)((?:\*\*)((?:[^*\n]+))(?:\*\*))$/, type: marks.bold }),
      markInputRule({ find: /(?:^|\s)((?:__)((?:[^_\n]+))(?:__))$/, type: marks.bold }),
      markInputRule({ find: /(?:^|\s)((?:\*)((?:[^*\n]+))(?:\*))$/, type: marks.italic }),
      markInputRule({ find: /(?:^|\s)((?:_)((?:[^_\n]+))(?:_))$/, type: marks.italic }),
      markInputRule({ find: /(?:^|\s)((?:~~)((?:[^~\n]+))(?:~~))$/, type: marks.strike }),
      markInputRule({ find: /(?:^|\s)((?:`)((?:[^`\n]+))(?:`))$/, type: marks.code }),
    ].filter((rule) => Boolean(rule))
  },
})

'''
anchor = "// ---------- 代码块：语法高亮、连续行号、当前行高亮与块内运行 ----------\n"
if 'const MarkdownTyping = Extension.create' not in editor:
    if anchor not in editor:
        raise RuntimeError('Markdown typing insertion anchor not found')
    editor = editor.replace(anchor, markdown_typing + anchor, 1)

if '      MarkdownTyping,\n' not in editor:
    editor = editor.replace('      CodeBlock,\n', '      CodeBlock,\n      MarkdownTyping,\n', 1)

old_paste = r'''        // 粘贴纯文本且形似 Markdown → 自动转换
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        if (!html && text) {
          if (looksLikeMarkdown(text)) {
            event.preventDefault()
            insertMarkdownText(view, text, null)
            return true
          }
          // 多行纯文本 → 每行一段，避免粘成一坨
          if (text.includes('\n')) {
            event.preventDefault()
            const paras = text
              .replace(/\r/g, '')
              .split('\n')
              .map((l) => `<p>${escapeHtmlText(l) || '<br>'}</p>`)
              .join('')
            insertHtmlContent(view, paras, null)
            return true
          }
        }
'''
new_paste = r'''        // 剪贴板常同时带 text/plain 与 text/html；明确的 Markdown 应优先解析。
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        if (text && shouldPreferMarkdownPaste(text, html)) {
          event.preventDefault()
          insertMarkdownText(view, text, null)
          return true
        }
        // 普通多行纯文本仍按段落插入，不影响真正的富文本粘贴。
        if (!html && text?.includes('\n')) {
          event.preventDefault()
          const paras = text
            .replace(/\r/g, '')
            .split('\n')
            .map((l) => `<p>${escapeHtmlText(l) || '<br>'}</p>`)
            .join('')
          insertHtmlContent(view, paras, null)
          return true
        }
'''
if old_paste in editor:
    editor = editor.replace(old_paste, new_paste, 1)
elif 'shouldPreferMarkdownPaste(text, html)' not in editor:
    raise RuntimeError('Markdown paste block not found')
write('src/components/Editor.jsx', editor)


app = read('src/App.jsx')
app = app.replace(
    '标题、列表、任务清单、引用、表格、图片、链接及 Markdown 粘贴',
    '标题、列表、任务清单、引用、表格、图片、链接，以及 Markdown 粘贴与直接输入自动识别',
    1,
)
write('src/App.jsx', app)


test = r'''import test from 'node:test'
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
'''
write('tests/markdownAutoDetection.test.mjs', test)

notes = read('RELEASE_NOTES.md')
heading = '## 主要变化\n\n'
lines = (
    '- 恢复 Markdown 自动识别：剪贴板同时携带 HTML 时，明确的 Markdown 纯文本仍优先转换。\n'
    '- 恢复 Markdown 直接输入规则：标题、列表、引用、代码围栏以及加粗、斜体、删除线、行内代码均自动应用格式。\n'
)
if '恢复 Markdown 自动识别' not in notes:
    notes = notes.replace(heading, heading + lines, 1)
write('RELEASE_NOTES.md', notes)

print('Markdown auto-detection repair applied')
