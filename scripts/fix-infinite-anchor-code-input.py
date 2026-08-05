from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# Editor: grow the bounded document before its bottom can enter the viewport.
# ---------------------------------------------------------------------------
editor = read('src/components/Editor.jsx')
ref_anchor = "  const canvasRef = useRef(null)\n"
if "const infiniteHeightRef = useRef(0)" not in editor:
    if ref_anchor not in editor:
        raise RuntimeError('Editor canvas ref anchor not found')
    editor = editor.replace(ref_anchor, ref_anchor + "  const infiniteHeightRef = useRef(0)\n", 1)

cleanup_anchor = """  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (editor) onChange?.(editor.getHTML())
  }, [editor, onChange])

"""
infinite_effect = """  useEffect(() => {
    const canvas = canvasRef.current
    const page = wrapRef.current?.querySelector('.document-page')
    if (!canvas || !page) return undefined

    const setHeight = (height) => {
      const next = Math.ceil(height)
      if (next <= infiniteHeightRef.current + 1) return
      infiniteHeightRef.current = next
      page.style.setProperty('--infinite-document-min-height', `${next}px`)
    }

    const ensureReserve = () => {
      const viewport = Math.max(480, canvas.clientHeight || 0)
      const baseline = Math.max(4800, viewport * 5)
      const inlineHeight = Number.parseFloat(page.style.getPropertyValue('--infinite-document-min-height')) || 0
      const current = Math.max(infiniteHeightRef.current, inlineHeight, page.offsetHeight)

      if (current < baseline) {
        setHeight(baseline)
        return
      }

      // Extend the document while its bottom is still well outside the viewport.
      // The user never hits a visible page bottom, while real content keeps growing normally.
      const remaining = canvas.scrollHeight - canvas.scrollTop - viewport
      if (remaining < viewport * 1.75) {
        setHeight(current + viewport * 3)
      }
    }

    ensureReserve()
    canvas.addEventListener('scroll', ensureReserve, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(ensureReserve) : null
    observer?.observe(canvas)
    return () => {
      canvas.removeEventListener('scroll', ensureReserve)
      observer?.disconnect()
    }
  }, [editor, doc?.id])

"""
if "const remaining = canvas.scrollHeight - canvas.scrollTop - viewport" not in editor:
    if cleanup_anchor not in editor:
        raise RuntimeError('Editor cleanup effect anchor not found')
    editor = editor.replace(cleanup_anchor, cleanup_anchor + infinite_effect, 1)
write('src/components/Editor.jsx', editor)


# ---------------------------------------------------------------------------
# Heading navigation: exact canvas-top positioning and enough tail reserve for
# the final heading to reach the top, like an infinite Google Docs document.
# ---------------------------------------------------------------------------
headings = read('src/lib/headings.js')
old_scroll = """export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const el = nodes?.[index]
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // 光标同步移到标题处，避免停留在原地
  const pos = editor.view.posAtDOM(el, 0)
  if (pos != null) {
    editor.chain().focus().setTextSelection(pos).run()
  }
}
"""
new_scroll = """export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const el = nodes?.[index]
  if (!el) return

  const canvas = el.closest('.canvas') || document.querySelector('.canvas')
  const page = el.closest('.document-page')

  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect()
    const elementRect = el.getBoundingClientRect()
    const topOffset = 20
    const targetTop = Math.max(0, canvas.scrollTop + elementRect.top - canvasRect.top - topOffset)

    if (page) {
      const pageRect = page.getBoundingClientRect()
      const pageTopInCanvas = canvas.scrollTop + pageRect.top - canvasRect.top
      const headingTopInPage = Math.max(0, targetTop - pageTopInCanvas)
      const requiredHeight = headingTopInPage + canvas.clientHeight * 2.25
      const currentHeight = Number.parseFloat(page.style.getPropertyValue('--infinite-document-min-height')) || page.offsetHeight
      if (requiredHeight > currentHeight) {
        page.style.setProperty('--infinite-document-min-height', `${Math.ceil(requiredHeight)}px`)
      }
    }

    requestAnimationFrame(() => {
      canvas.scrollTo({ top: targetTop, behavior: 'smooth' })
    })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 同步文档选区，但不调用 focus()，避免 ProseMirror 再次改写滚动位置。
  const pos = editor.view.posAtDOM(el, 0)
  if (pos != null) editor.commands.setTextSelection(pos)
}
"""
if old_scroll in headings:
    headings = headings.replace(old_scroll, new_scroll, 1)
elif "const requiredHeight = headingTopInPage + canvas.clientHeight * 2.25" not in headings:
    raise RuntimeError('Heading scroll function anchor not found')
write('src/lib/headings.js', headings)


# ---------------------------------------------------------------------------
# Runner: remove only the common incidental indentation of an embedded snippet.
# Relative indentation remains intact, so Python blocks still execute correctly.
# ---------------------------------------------------------------------------
runner = read('electron/code-runner.cjs')
if "function normalizeSource(value)" not in runner:
    infer_anchor = "\nfunction inferLanguage(code) {"
    if infer_anchor not in runner:
        raise RuntimeError('Runner inferLanguage anchor not found')
    normalize_source = r'''
function normalizeSource(value) {
  const text = String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (!lines.length) return ''

  const indents = lines
    .filter((line) => line.trim())
    .map((line) => (line.match(/^[ \t]*/) || [''])[0].length)
  const common = indents.length ? Math.min(...indents) : 0
  if (!common) return lines.join('\n')

  return lines.map((line) => {
    if (!line.trim()) return ''
    const leading = (line.match(/^[ \t]*/) || [''])[0].length
    return line.slice(Math.min(common, leading))
  }).join('\n')
}
'''
    runner = runner.replace(infer_anchor, normalize_source + infer_anchor, 1)
runner = runner.replace(
    "  const code = String(payload.code || '')\n",
    "  const code = normalizeSource(payload.code || '')\n",
    1,
)
if "  normalizeSource,\n" not in runner:
    export_anchor = "module.exports = {\n"
    if export_anchor not in runner:
        raise RuntimeError('Runner exports anchor not found')
    runner = runner.replace(export_anchor, export_anchor + "  normalizeSource,\n", 1)
write('electron/code-runner.cjs', runner)


# ---------------------------------------------------------------------------
# CSS: reset legacy absolute gutter rules and use a dynamic infinite height.
# ---------------------------------------------------------------------------
css = read('src/app.css')
marker = '/* 0.2.0-preview infinite-anchor and code-input repair */'
if marker in css:
    css = css[:css.index(marker)].rstrip()
css += r'''

/* 0.2.0-preview infinite-anchor and code-input repair */
/* Keep the document boundary, but extend it before the bottom can enter view. */
.main[data-workspace="document"] .document-page {
  min-height: var(--infinite-document-min-height, max(4800px, calc(100vh * 5))) !important;
  padding-bottom: max(960px, calc(100vh + 180px)) !important;
}
.editor-content h1,
.editor-content h2,
.editor-content h3,
.editor-content h4,
.editor-content h5,
.editor-content h6 {
  scroll-margin-top: 20px;
}

/* The old gutter was position:absolute; reset every legacy geometry property. */
.code-block-body {
  display: grid !important;
  grid-template-columns: 52px minmax(0, 1fr) !important;
  align-items: stretch !important;
}
.code-block-body > .code-gutter {
  position: static !important;
  inset: auto !important;
  grid-column: 1 !important;
  grid-row: 1 !important;
  width: 52px !important;
  min-width: 52px !important;
  height: auto !important;
  pointer-events: none !important;
  text-align: right !important;
}
.code-block-body > .code-scroll {
  position: relative !important;
  grid-column: 2 !important;
  grid-row: 1 !important;
  width: 100% !important;
  min-width: 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scroll-padding-inline: 16px;
}
.code-block-body > .code-scroll > pre {
  position: static !important;
  display: block !important;
  width: max-content !important;
  min-width: 100% !important;
  overflow: visible !important;
}
.editor-content .code-block-shell .code-scroll > pre > .code-editable {
  position: static !important;
  left: auto !important;
  transform: none !important;
  display: block !important;
  min-width: 100% !important;
  padding: 14px 16px !important;
  background: transparent !important;
  border-radius: 0 !important;
  color: var(--text) !important;
  caret-color: var(--text) !important;
  white-space: pre !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
'''
write('src/app.css', css)


# ---------------------------------------------------------------------------
# Tests and release notes.
# ---------------------------------------------------------------------------
infinite_test = r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const headings = readFileSync(new URL('../src/lib/headings.js', import.meta.url), 'utf8')

test('code block keeps native newline behavior and a valid two-column DOM', () => {
  assert.match(editor, /\.\.\.this\.parent\?\.\(\)/)
  assert.doesNotMatch(editor, /pre\.append\(gutter, code\)/)
  assert.match(editor, /body\.append\(gutter, scroller\)/)
  assert.match(editor, /ignoreMutation: \(mutation\) => !code\.contains\(mutation\.target\)/)
  assert.match(css, /position: static !important;[\s\S]*grid-column: 1 !important/)
  assert.match(css, /grid-column: 2 !important/)
})

test('bounded document extends before its bottom enters the viewport', () => {
  assert.match(editor, /remaining < viewport \* 1\.75/)
  assert.match(editor, /setHeight\(current \+ viewport \* 3\)/)
  assert.match(css, /--infinite-document-min-height/)
  assert.match(css, /max\(4800px, calc\(100vh \* 5\)\)/)
})

test('heading navigation reserves a full tail and aligns the heading to canvas top', () => {
  assert.match(headings, /canvas\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/)
  assert.match(headings, /canvas\.clientHeight \* 2\.25/)
  assert.doesNotMatch(headings, /chain\(\)\.focus\(\)\.setTextSelection/)
})
'''
write('tests/infiniteDocumentCodeBlock.test.mjs', infinite_test)

runner_test = read('tests/codeRunner.test.mjs')
runner_test = runner_test.replace(
    "const { inferLanguage, runCode } = require('../electron/code-runner.cjs')",
    "const { inferLanguage, normalizeSource, runCode } = require('../electron/code-runner.cjs')",
)
if "嵌入代码块的公共缩进会在运行前移除" not in runner_test:
    runner_test += r'''

test('嵌入代码块的公共缩进会在运行前移除', async () => {
  assert.equal(normalizeSource('    print("p")'), 'print("p")')
  assert.equal(normalizeSource('    if True:\n        print("p")'), 'if True:\n    print("p")')
  const result = await runCode({ language: 'python', code: '    print("p")' })
  assert.equal(result.ok, true)
  assert.equal(result.stdout, 'p')
  assert.equal(result.stderr, '')
})
'''
write('tests/codeRunner.test.mjs', runner_test)

notes = read('RELEASE_NOTES.md')
updates = (
    '- 无限文档改为动态增长：保留左右边界，并在底部进入视口前继续延长；末尾标题也能跳到编辑区顶部。\n'
    '- 修复代码块旧绝对定位样式覆盖新布局的问题，恢复正常输入位置、行号对齐和横向滚动。\n'
    '- 运行嵌入代码片段时移除公共外层缩进，避免单行 Python 因文档缩进误报 `unexpected indent`。\n'
)
heading = '## 主要变化\n\n'
if '无限文档改为动态增长' not in notes:
    notes = notes.replace(heading, heading + updates, 1)
write('RELEASE_NOTES.md', notes)

print('infinite anchor and code input repair applied')
