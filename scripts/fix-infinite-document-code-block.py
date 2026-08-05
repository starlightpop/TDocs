from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


editor = read('src/components/Editor.jsx')

# Preserve CodeBlockLowlight's native Enter/newline behavior. The previous
# insertContent('\n') override bypassed the parent command chain and made
# normal code editing unreliable.
shortcut_pattern = re.compile(
    r"    return \{\n"
    r"      Enter: \(\) => \{\n"
    r"        if \(!this\.editor\.isActive\('codeBlock'\)\) return false\n"
    r"        return this\.editor\.commands\.insertContent\('\\n'\)\n"
    r"      \},\n"
    r"      Tab:",
)
editor, count = shortcut_pattern.subn(
    "    return {\n      ...this.parent?.(),\n      Tab:",
    editor,
    count=1,
)
if count != 1:
    raise RuntimeError('code shortcut anchor not found')

# Add IDE-style unindent without changing the parent Enter behavior.
tab_anchor = """        view.dispatch(tr)
        return true
      },
      Escape: () => {"""
tab_replacement = """        view.dispatch(tr)
        return true
      },
      'Shift-Tab': () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const lineStart = state.selection.from - $from.parent.textBetween(0, $from.parentOffset, '\\n', '\\n').split('\\n').at(-1).length
        const lineText = $from.parent.textBetween(lineStart - $from.start(), $from.parentOffset, '\\n', '\\n')
        const remove = lineText.startsWith('  ') ? 2 : lineText.startsWith('\\t') ? 1 : 0
        if (!remove) return true
        view.dispatch(state.tr.delete(lineStart, lineStart + remove))
        return true
      },
      Escape: () => {"""
if tab_anchor not in editor:
    raise RuntimeError('tab shortcut anchor not found')
editor = editor.replace(tab_anchor, tab_replacement, 1)

# Replace invalid <pre><div gutter><code> structure. A div inside pre is
# invalid HTML and browsers may reparent it, disconnecting ProseMirror's
# contentDOM and causing input/selection/line-number failures.
dom_pattern = re.compile(
    r"      const pre = document\.createElement\('pre'\)\n"
    r"      const gutter = document\.createElement\('div'\)\n"
    r"      gutter\.className = 'code-gutter'\n"
    r"      gutter\.setAttribute\('aria-hidden', 'true'\)\n"
    r"      gutter\.contentEditable = 'false'\n"
    r"      const code = document\.createElement\('code'\)\n"
    r"      pre\.append\(gutter, code\)\n\n"
    r"      const completionMenu = document\.createElement\('div'\)\n"
    r"      completionMenu\.className = 'code-completion-menu'\n"
    r"      completionMenu\.hidden = true\n\n"
    r"      const footer = document\.createElement\('div'\)\n"
    r"      footer\.className = 'code-block-footer'\n"
    r"      footer\.contentEditable = 'false'\n"
    r"      footer\.textContent = 'Tab 补全 · ⌘C / Ctrl\+C 退出代码块'\n"
    r"      shell\.append\(head, pre, footer, completionMenu\)",
)
valid_dom = """      const body = document.createElement('div')
      body.className = 'code-block-body'
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'
      const scroller = document.createElement('div')
      scroller.className = 'code-scroll'
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.className = 'code-editable'
      pre.append(code)
      scroller.append(pre)
      body.append(gutter, scroller)

      const completionMenu = document.createElement('div')
      completionMenu.className = 'code-completion-menu'
      completionMenu.hidden = true

      const footer = document.createElement('div')
      footer.className = 'code-block-footer'
      footer.contentEditable = 'false'
      footer.textContent = 'Tab 补全 · Shift+Tab 减少缩进 · ⌘C / Ctrl+C 退出代码块'
      shell.append(head, body, footer, completionMenu)"""
editor, count = dom_pattern.subn(valid_dom, editor, count=1)
if count != 1:
    raise RuntimeError('code node-view DOM anchor not found')

# Completion popup should close when the user clicks elsewhere.
hide_anchor = """      const onSelection = () => { syncActiveLine(); requestAnimationFrame(renderCompletions) }
      const hideCompletions = () => { completionMenu.hidden = true }
      view.dom.addEventListener('tdocs:code-selection', onSelection)
      view.dom.addEventListener('tdocs:hide-code-completions', hideCompletions)
      render()"""
hide_replacement = """      const onSelection = () => { syncActiveLine(); requestAnimationFrame(renderCompletions) }
      const hideCompletions = () => { completionMenu.hidden = true }
      const onDocumentPointerDown = (event) => {
        if (!shell.contains(event.target)) hideCompletions()
      }
      view.dom.addEventListener('tdocs:code-selection', onSelection)
      view.dom.addEventListener('tdocs:hide-code-completions', hideCompletions)
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      render()"""
if hide_anchor not in editor:
    raise RuntimeError('completion listener anchor not found')
editor = editor.replace(hide_anchor, hide_replacement, 1)

return_anchor = """        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer')),
        destroy: () => {
          view.dom.removeEventListener('tdocs:code-selection', onSelection)
          view.dom.removeEventListener('tdocs:hide-code-completions', hideCompletions)
        },"""
return_replacement = """        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer, .code-completion-menu')),
        ignoreMutation: (mutation) => !code.contains(mutation.target),
        destroy: () => {
          view.dom.removeEventListener('tdocs:code-selection', onSelection)
          view.dom.removeEventListener('tdocs:hide-code-completions', hideCompletions)
          document.removeEventListener('pointerdown', onDocumentPointerDown, true)
        },"""
if return_anchor not in editor:
    raise RuntimeError('node-view return anchor not found')
editor = editor.replace(return_anchor, return_replacement, 1)
write('src/components/Editor.jsx', editor)

css = read('src/app.css')
marker = '/* 0.2.0-preview infinite-document and stable code editor repair */'
block = r'''

/* 0.2.0-preview infinite-document and stable code editor repair */
/* Keep the visible document boundary, but always prepare substantial editable
   space below the viewport. Content naturally extends this element further. */
.main[data-workspace="document"] .page-wrap {
  width: min(960px, 100%);
  margin: 0 auto;
}
.main[data-workspace="document"] .document-page {
  box-sizing: border-box;
  width: 100%;
  min-height: max(1800px, calc(100vh + 900px)) !important;
  height: auto !important;
  overflow: visible !important;
}

/* Code block uses valid sibling layers: gutter + independently scrollable code. */
.code-block-shell {
  --code-font-size: 14px;
  --code-line-height: 26px;
  position: relative;
  overflow: visible !important;
}
.code-block-body {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: stretch;
  min-width: 0;
  overflow: hidden;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.code-scroll {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-gutter: stable;
}
.code-block-shell .code-scroll > pre {
  display: block !important;
  box-sizing: border-box;
  width: max-content;
  min-width: 100%;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  overflow: visible !important;
  font: 400 var(--code-font-size)/var(--code-line-height) var(--font-mono) !important;
}
.code-block-shell .code-scroll > pre > code,
.code-block-shell .code-scroll > pre > .code-editable {
  display: block !important;
  box-sizing: border-box;
  min-width: 100%;
  margin: 0 !important;
  padding: 14px 16px !important;
  white-space: pre !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
  tab-size: 2;
  font: inherit !important;
  line-height: var(--code-line-height) !important;
}
.code-block-shell .code-gutter {
  display: flex !important;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 52px;
  margin: 0 !important;
  padding: 14px 0 !important;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-3) 84%, transparent);
  color: var(--text-3);
  font: 400 var(--code-font-size)/var(--code-line-height) var(--font-mono) !important;
  user-select: none;
}
.code-block-shell .code-gutter > span {
  display: block;
  flex: 0 0 var(--code-line-height);
  height: var(--code-line-height);
  padding: 0 10px 0 4px;
  line-height: var(--code-line-height) !important;
  text-align: right;
  box-sizing: border-box;
}
.code-block-shell .code-gutter > span.active {
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 700;
}
.code-block-shell .code-completion-menu {
  max-width: min(320px, calc(100% - 24px));
}
'''
if marker in css:
    css = css[:css.index(marker)].rstrip() + block
else:
    css = css.rstrip() + block
write('src/app.css', css)

release_notes = read('RELEASE_NOTES.md')
line = '- 修复无限文档高度回退：保留文档边界，同时让空文档始终比当前视口更长，并随内容自然延伸。\n- 重构代码块 DOM 与行号布局，恢复正常换行、缩进、选择、补全和横向滚动。\n'
heading = '## 主要变化\n\n'
if '修复无限文档高度回退' not in release_notes:
    release_notes = release_notes.replace(heading, heading + line, 1)
write('RELEASE_NOTES.md', release_notes)

# Source-level regression tests protect the two architecture constraints.
test = r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')

test('code block keeps native newline behavior and valid DOM structure', () => {
  assert.match(editor, /\.\.\.this\.parent\?\.\(\)/)
  assert.doesNotMatch(editor, /pre\.append\(gutter, code\)/)
  assert.match(editor, /body\.append\(gutter, scroller\)/)
  assert.match(editor, /ignoreMutation: \(mutation\) => !code\.contains\(mutation\.target\)/)
})

test('continuous document remains bounded but extends below every viewport', () => {
  assert.match(css, /min-height: max\(1800px, calc\(100vh \+ 900px\)\) !important/)
  assert.match(css, /\.main\[data-workspace="document"\] \.page-wrap/)
  assert.match(css, /white-space: pre !important/)
})
'''
write('tests/infiniteDocumentCodeBlock.test.mjs', test)

print('infinite document and code block repair applied')
