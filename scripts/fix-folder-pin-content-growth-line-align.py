from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


# ---------------------------------------------------------------------------
# Storage: normalize and persist folder pin state.
# ---------------------------------------------------------------------------
storage = read('src/lib/storage.js')
if 'function normalizeGroup(group = {})' not in storage:
    anchor = "export function loadGroups() {\n"
    normalize_group = """function normalizeGroup(group = {}) {
  return {
    ...group,
    id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: group.name || '新建文件夹',
    collapsed: Boolean(group.collapsed),
    pinned: Boolean(group.pinned),
  }
}

"""
    if anchor not in storage:
        raise RuntimeError('storage loadGroups anchor not found')
    storage = storage.replace(anchor, normalize_group + anchor, 1)
storage = storage.replace(
    "    return Array.isArray(value) ? value : []\n",
    "    return Array.isArray(value) ? value.map(normalizeGroup) : []\n",
    1,
)
storage = storage.replace(
    "  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups || []))\n",
    "  localStorage.setItem(GROUPS_KEY, JSON.stringify((groups || []).map(normalizeGroup)))\n",
    1,
)
storage = storage.replace(
    "  return { id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, collapsed: false }\n",
    "  return normalizeGroup({ id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, collapsed: false, pinned: false })\n",
    1,
)
write('src/lib/storage.js', storage)


# ---------------------------------------------------------------------------
# App: folder pin handler and Sidebar wiring.
# ---------------------------------------------------------------------------
app = read('src/App.jsx')
if 'const handleToggleGroupPin = (group) =>' not in app:
    anchor = """  const persistGroups = (next) => {
    setGroups(next)
    saveGroups(next)
  }

"""
    handler = """  const handleToggleGroupPin = (group) => {
    persistGroups(groups.map((item) => (
      item.id === group.id ? { ...item, pinned: !item.pinned } : item
    )))
  }

"""
    if anchor not in app:
        raise RuntimeError('App persistGroups anchor not found')
    app = app.replace(anchor, anchor + handler, 1)
if 'onToggleGroupPin={handleToggleGroupPin}' not in app:
    anchor = "          onTogglePin={handleTogglePin}\n"
    if anchor not in app:
        raise RuntimeError('Sidebar toggle pin prop anchor not found')
    app = app.replace(anchor, anchor + "          onToggleGroupPin={handleToggleGroupPin}\n", 1)
write('src/App.jsx', app)


# ---------------------------------------------------------------------------
# Sidebar: folder pin, folder context-create, pinned sorting, centered button.
# ---------------------------------------------------------------------------
sidebar = read('src/components/Sidebar.jsx')
sidebar = sidebar.replace(
    "  onRenameDoc, onSetHeadingLevel, onDragExport, onReorderGroups, onOpenFiles, onTogglePin,\n",
    "  onRenameDoc, onSetHeadingLevel, onDragExport, onReorderGroups, onOpenFiles, onTogglePin, onToggleGroupPin,\n",
    1,
)
if 'const orderedGroups = [...groups]' not in sidebar:
    filtered_anchor = """  const filtered = docs.filter((d) => {
    if (!searching) return true
    const q = query.toLowerCase()
    return d.title.toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q)
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)

"""
    ordered = """  const orderedGroups = [...groups].sort((a, b) => (
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  ))

"""
    if filtered_anchor not in sidebar:
        raise RuntimeError('Sidebar filtered anchor not found')
    sidebar = sidebar.replace(filtered_anchor, filtered_anchor + ordered, 1)

if 'const groupMenuItems = (group) =>' not in sidebar:
    anchor = "  const renderGroupSection = (group) => {\n"
    helper = """  const groupMenuItems = (group) => [
    {
      label: '新建文档',
      icon: <Icon name="doc" size={15} />,
      action: () => {
        setCollapsedGroups((prev) => {
          const next = new Set(prev)
          next.delete(group.id)
          return next
        })
        onCreate(group.id)
      },
    },
    {
      label: group.pinned ? '取消置顶' : '置顶',
      icon: <Icon name="pin" size={15} />,
      action: () => onToggleGroupPin?.(group),
    },
    { sep: true },
    { label: '重命名文件夹', icon: <Icon name="edit" size={15} />, action: () => { setEditName(group.name); onRenameGroup(group) } },
    { label: '删除文件夹', icon: <Icon name="trash" size={15} />, danger: true, action: () => onDeleteGroup(group) },
  ]

"""
    if anchor not in sidebar:
        raise RuntimeError('Sidebar renderGroupSection anchor not found')
    sidebar = sidebar.replace(anchor, helper + anchor, 1)

old_context = """            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: '重命名文件夹', icon: <Icon name="edit" size={15} />, action: () => { setEditName(group.name); onRenameGroup(group) } },
                { label: '删除文件夹', icon: <Icon name="trash" size={15} />, danger: true, action: () => onDeleteGroup(group) },
              ],
            })
"""
new_context = """            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              items: groupMenuItems(group),
            })
"""
if old_context in sidebar:
    sidebar = sidebar.replace(old_context, new_context, 1)
elif 'items: groupMenuItems(group)' not in sidebar:
    raise RuntimeError('Sidebar group context menu anchor not found')

sidebar = sidebar.replace(
    "className={`group-header${isCollapsed ? '' : ''}`}\n",
    "className={`group-header${group.pinned ? ' pinned' : ''}`}\n",
    1,
)
folder_icon = "          <Icon name=\"folder\" size={13} />\n"
if "{group.pinned && <Icon name=\"pin\" size={11} />}" not in sidebar:
    if folder_icon not in sidebar:
        raise RuntimeError('Sidebar folder icon anchor not found')
    sidebar = sidebar.replace(folder_icon, "          {group.pinned && <Icon name=\"pin\" size={11} />}\n" + folder_icon, 1)
sidebar = sidebar.replace("            {groups.map(renderGroupSection)}\n", "            {orderedGroups.map(renderGroupSection)}\n", 1)
sidebar = sidebar.replace(
    "        <button className=\"btn btn-primary new-doc-button\" onClick={() => onCreate('')}><Icon name=\"plus\" size={15} />新建文档</button>\n",
    "        <button className=\"btn btn-primary new-doc-button\" onClick={() => onCreate('')}>新建文档</button>\n",
    1,
)
write('src/components/Sidebar.jsx', sidebar)


# ---------------------------------------------------------------------------
# Editor: stop scroll-driven growth. Viewport reserve is resize-driven only;
# real paragraphs and blank paragraphs created by Enter grow the document.
# ---------------------------------------------------------------------------
editor = read('src/components/Editor.jsx')
editor = editor.replace("  const infiniteHeightRef = useRef(0)\n", "", 1)
pattern = re.compile(r"  useEffect\(\(\) => \{\n    const canvas = canvasRef\.current\n    const page = wrapRef\.current\?\.querySelector\('\.document-page'\)\n    if \(!canvas \|\| !page\) return undefined\n\n    const setHeight = \(height\) => \{.*?\n  \}, \[editor, doc\?\.id\]\)\n", re.S)
replacement = """  useEffect(() => {
    const canvas = canvasRef.current
    const page = wrapRef.current?.querySelector('.document-page')
    if (!canvas || !page) return undefined

    const updateViewportReserve = () => {
      const viewport = Math.max(480, canvas.clientHeight || 0)
      page.style.setProperty('--editor-viewport-height', `${Math.ceil(viewport)}px`)
    }

    updateViewportReserve()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateViewportReserve) : null
    observer?.observe(canvas)
    return () => observer?.disconnect()
  }, [editor, doc?.id])
"""
editor, count = pattern.subn(replacement, editor, count=1)
if count != 1 and 'const updateViewportReserve = () =>' not in editor:
    raise RuntimeError('Editor scroll-driven infinite effect not found')
write('src/components/Editor.jsx', editor)


# ---------------------------------------------------------------------------
# Heading jump: bottom reserve is permanent and content-driven, so navigation
# no longer mutates document height.
# ---------------------------------------------------------------------------
headings = read('src/lib/headings.js')
function_pattern = re.compile(r"export function scrollToHeadingByIndex\(editor, index\) \{.*?\n\}\n\n/\*\*", re.S)
new_function = """export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const el = nodes?.[index]
  if (!el) return

  const canvas = el.closest('.canvas') || document.querySelector('.canvas')
  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect()
    const elementRect = el.getBoundingClientRect()
    const targetTop = Math.max(0, canvas.scrollTop + elementRect.top - canvasRect.top - 20)
    canvas.scrollTo({ top: targetTop, behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 同步选区，不调用 focus()，避免编辑器重新改写滚动位置。
  const pos = editor.view.posAtDOM(el, 0)
  if (pos != null) editor.commands.setTextSelection(pos)
}

/**"""
headings, count = function_pattern.subn(new_function, headings, count=1)
if count != 1:
    raise RuntimeError('heading jump function not found')
write('src/lib/headings.js', headings)


# ---------------------------------------------------------------------------
# CSS: content-driven tail reserve and exact code baseline metrics.
# ---------------------------------------------------------------------------
css = read('src/app.css')
marker = '/* 0.2.0-preview folder pin, content growth and code baseline repair */'
if marker in css:
    css = css[:css.index(marker)].rstrip()
css += r'''

/* 0.2.0-preview folder pin, content growth and code baseline repair */
/* The document has one viewport of editable tail. Scrolling alone never grows it;
   paragraphs, including empty paragraphs created with Enter, grow it naturally. */
.main[data-workspace="document"] .document-page {
  min-height: calc(var(--editor-viewport-height, 720px) + 720px) !important;
  padding-bottom: calc(var(--editor-viewport-height, 720px) + 120px) !important;
}

/* Line numbers and source text share one immutable font metric and top inset. */
.code-block-shell {
  --code-font-size: 14px;
  --code-line-height: 28px;
  --code-pad-y: 14px;
}
.code-block-shell .code-gutter,
.code-block-shell .code-scroll > pre,
.code-block-shell .code-scroll > pre > .code-editable {
  font-family: var(--font-mono) !important;
  font-size: var(--code-font-size) !important;
  line-height: var(--code-line-height) !important;
  font-variant-ligatures: none;
  font-synthesis: none;
}
.code-block-shell .code-gutter {
  padding-top: var(--code-pad-y) !important;
  padding-bottom: var(--code-pad-y) !important;
}
.code-block-shell .code-gutter > span {
  display: block !important;
  flex: 0 0 var(--code-line-height) !important;
  width: 100%;
  height: var(--code-line-height) !important;
  min-height: var(--code-line-height) !important;
  padding: 0 10px 0 4px !important;
  line-height: var(--code-line-height) !important;
  box-sizing: border-box;
}
.code-block-shell .code-scroll > pre > .code-editable {
  padding-top: var(--code-pad-y) !important;
  padding-bottom: var(--code-pad-y) !important;
}

.group-header.pinned {
  color: var(--text);
}
.group-header.pinned > svg:first-of-type {
  color: var(--accent);
}
.new-doc-button {
  justify-content: center !important;
  gap: 0 !important;
  text-align: center;
}
'''
write('src/app.css', css)


# ---------------------------------------------------------------------------
# Regression tests.
# ---------------------------------------------------------------------------
infinite_test = r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const headings = readFileSync(new URL('../src/lib/headings.js', import.meta.url), 'utf8')

test('code line numbers and source share exact line metrics', () => {
  assert.match(css, /--code-line-height: 28px/)
  assert.match(css, /--code-pad-y: 14px/)
  assert.match(css, /\.code-gutter,[\s\S]*\.code-editable[\s\S]*font-size: var\(--code-font-size\) !important/)
  assert.match(css, /flex: 0 0 var\(--code-line-height\) !important/)
})

test('document height is driven by content and viewport resize, never scrolling', () => {
  assert.match(editor, /const updateViewportReserve = \(\) =>/)
  assert.match(editor, /ResizeObserver\(updateViewportReserve\)/)
  assert.doesNotMatch(editor, /addEventListener\('scroll', ensureReserve/)
  assert.doesNotMatch(editor, /setHeight\(current \+ viewport \* 3\)/)
  assert.match(css, /padding-bottom: calc\(var\(--editor-viewport-height, 720px\) \+ 120px\)/)
})

test('heading navigation uses existing content tail without mutating page height', () => {
  assert.match(headings, /canvas\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/)
  assert.doesNotMatch(headings, /--infinite-document-min-height/)
  assert.doesNotMatch(headings, /requiredHeight/)
})
'''
write('tests/infiniteDocumentCodeBlock.test.mjs', infinite_test)

folder_test = r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sidebar = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const storage = readFileSync(new URL('../src/lib/storage.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('folders can be pinned and create documents from their context menu', () => {
  assert.match(storage, /pinned: Boolean\(group\.pinned\)/)
  assert.match(sidebar, /label: '新建文档'[\s\S]*onCreate\(group\.id\)/)
  assert.match(sidebar, /group\.pinned \? '取消置顶' : '置顶'/)
  assert.match(sidebar, /orderedGroups\.map\(renderGroupSection\)/)
  assert.match(app, /onToggleGroupPin=\{handleToggleGroupPin\}/)
})

test('new document button is centered text without a plus icon', () => {
  assert.match(sidebar, />新建文档<\/button>/)
  assert.doesNotMatch(sidebar, /new-doc-button[^\n]*<Icon name="plus"/)
})
'''
write('tests/folderPinAndCreate.test.mjs', folder_test)

notes = read('RELEASE_NOTES.md')
updates = (
    '- 文件夹支持置顶、取消置顶，并可通过文件夹右键菜单直接在该文件夹中新建文档。\n'
    '- 文档长度改为内容驱动：滚动和方向键不会继续制造空白，回车创建的空段落会正常撑长文档。\n'
    '- 代码行号与正文统一为相同字体、28px 行高和14px上下内边距。\n'
    '- “新建文档”按钮移除加号并将文字在按钮中居中。\n'
)
heading = '## 主要变化\n\n'
if '文件夹支持置顶、取消置顶' not in notes:
    notes = notes.replace(heading, heading + updates, 1)
write('RELEASE_NOTES.md', notes)

print('folder pin, content growth and code baseline repair applied')
