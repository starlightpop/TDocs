from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def sub_once(pattern, repl, text, label, flags=re.S):
    result, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 replacement, got {count}')
    return result

# ---------- App: document-only workspace ----------
app = read('src/App.jsx')
app = app.replace("import { PAPER_PRESETS as PAPER, normalizePaper, resolvePageSize, viewModeForPaper } from './lib/viewModes.js'\n", '')
welcome = r'''const WELCOME_HTML = `
<h1>欢迎使用 TDocs</h1>
<p>TDocs 0.2.0-preview 聚焦稳定的本地文档编辑，不再包含尚未完成的 Word/A4/B5 工作区。欢迎文件默认置顶，也可以删除。</p>
<h2>文档编辑</h2>
<ul>
  <li>连续画布、标题大纲、查找替换、自动保存与本地版本历史</li>
  <li>标题、列表、任务清单、引用、表格、图片、链接及 Markdown 粘贴</li>
  <li>浅色、深色、跟随系统主题和多档界面缩放</li>
</ul>
<h2>代码块</h2>
<ul>
  <li>C、C++、Java、JavaScript、Python、Rust、MATLAB / Octave 语法高亮</li>
  <li>统一行高、当前行号高亮、前缀补全、块内语言选择和运行按钮</li>
  <li>JavaScript 使用应用自带环境；其他语言调用电脑中已安装并加入 PATH 的运行环境</li>
  <li>缺少运行环境时会说明原因，并提供官方安装页面与系统对应命令</li>
</ul>
<h2>AI 改写</h2>
<ul>
  <li>选中文字后保持 AI 专属高亮，支持润色、精简、扩写、正式化、口语化和自定义指令</li>
  <li>模型按厂商独立配置，改写窗口只显示已经完成配置的模型</li>
  <li>支持内联差异预览、接受和撤销</li>
</ul>
<h2>文件与输出</h2>
<ul>
  <li>文件夹、置顶、拖拽移动、内联重命名和本地文件导入</li>
  <li>导出 PDF、DOCX、EPUB、Markdown、HTML 和纯文本</li>
  <li>中文右键菜单支持撤销、重做、剪切、复制、粘贴、全选，以及文字格式和 AI 操作</li>
</ul>
<h2>常用快捷键</h2>
<table><tbody>
<tr><th><p>操作</p></th><th><p>快捷键</p></th></tr>
<tr><td><p>查找与替换</p></td><td><p>⌘ / Ctrl + F</p></td></tr>
<tr><td><p>撤销 / 重做</p></td><td><p>⌘ / Ctrl + Z / Shift + Z</p></td></tr>
<tr><td><p>代码补全</p></td><td><p>Tab</p></td></tr>
<tr><td><p>退出代码块</p></td><td><p>空选区时 ⌘ / Ctrl + C，或点击代码块外</p></td></tr>
</tbody></table>
<hr>
<h2>版本更新</h2>
<h3>0.2.0-preview（当前版本）</h3>
<ul>
  <li>删除不稳定的 Word/A4/B5、分页节点、分页符和代码块拆分逻辑</li>
  <li>统一文档工作区、设置中心、菜单层级和整体视觉</li>
  <li>恢复中文完整右键菜单，修复代码块行号、语言选择和 macOS 窗口交互</li>
  <li>保留并稳定 AI 改写、查找替换、版本历史、代码运行和多格式导出</li>
</ul>
<h3>0.1.2-preview（上一开发版本）</h3>
<ul>
  <li>建立 AI 选区高亮、多厂商配置、查找替换、本地版本历史和代码运行基础</li>
  <li>曾试验分页工作区；该试验没有达到发布标准，已从 0.2.0-preview 中完整移除</li>
</ul>
<blockquote><p>文档内容与配置默认保存在本机。AI 请求和外部下载只在你主动使用对应功能时发生。</p></blockquote>
`

const WELCOME_SEED_KEY = 'inkdocs.welcomeSeed.0.2.0-document-preview' '''
app = sub_once(r"const WELCOME_HTML = `.*?`\n\nconst WELCOME_SEED_KEY = '[^']+'", welcome.strip(), app, 'welcome')
app = sub_once(r"\n  // ---------- 工作模式：.*?\n  // ---------- 文档 ----------", "\n  // ---------- 文档 ----------", app, 'word state block')
app = app.replace("  const [showPageMenu, setShowPageMenu] = useState(false)\n", '')
app = app.replace("  const [rulerOpen, setRulerOpen] = useState(false)\n  const rulerRef = useRef(null)\n  const rulerDownRef = useRef(null)\n", '')
app = sub_once(r"\n  // 拖动标尺灰白交界：.*?\n  const \[headings,", "\n  const [headings,", app, 'ruler handler')
app = sub_once(r"\n  useEffect\(\(\) => \{\n    if \(!activeDoc\) return\n    const nextPaper.*?\n  \}, \[activeDoc\?\.id, activeDoc\?\.kind, activeDoc\?\.paper\]\)\n", "\n", app, 'paper sync')
app = sub_once(r"\n  // 页面缩放后按比例修正滚动坐标.*?\n  // 缩放菜单始终锚定状态栏按钮", "\n  // 缩放菜单始终锚定状态栏按钮", app, 'page zoom and change paper')
app = sub_once(r"  const handleCreate = \(kind = 'document', group = ''\) => \{.*?\n  \}\n\n  const handleSelect", "  const handleCreate = (group = '') => {\n    const doc = createDoc('无标题文档', '', { group })\n    doc.group = group || ''\n    persist([doc, ...docs])\n    setActiveId(doc.id)\n    setEditor(null)\n    setHeadings([])\n  }\n\n  const handleSelect", app, 'create handler')
app = re.sub(r"\n    const target = docs\.find\(\(doc\) => doc\.id === id\)\n    setPaper\([^\n]+\)", '', app)
app = app.replace("    const fallback = doc.kind === 'word' ? '无标题 Word' : '无标题文档'", "    const fallback = '无标题文档'")
app = app.replace("    setShowPageMenu(false)\n", '')
app = app.replace("    setRulerOpen(false)\n", '')
app = app.replace("    if (!showExportMenu && !showPageMenu && !zoomMenuOpen && !rulerOpen) return", "    if (!showExportMenu && !zoomMenuOpen) return")
app = app.replace("  }, [showExportMenu, showPageMenu, zoomMenuOpen, rulerOpen])", "  }, [showExportMenu, zoomMenuOpen])")
app = app.replace("placeholder={activeDoc?.kind === 'word' ? '无标题 Word' : '无标题文档'}", "placeholder=\"无标题文档\"")
app = sub_once(r"\n          \{activeDoc\?\.kind === 'word' \? \(.*?\) : <span className=\"workspace-mode-badge\"><Icon name=\"doc\" size=\{13\} />文档</span>\}", "\n          <span className=\"workspace-mode-badge\"><Icon name=\"doc\" size={13} />文档</span>", app, 'topbar workspace')
app = app.replace('Word (.docx)', 'DOCX (.docx)')
app = app.replace('data-workspace={activeDoc?.kind || \'document\'}', 'data-workspace="document"')
app = sub_once(r"\n          style=\{\{\n            '--doc-zoom':.*?\n          \}\}", "\n          style={{ '--doc-zoom': zoom }}", app, 'main style')
app = app.replace('<Toolbar editor={editor} onAi={openAi} isWord={activeDoc.kind === \'word\'} />', '<Toolbar editor={editor} onAi={openAi} />')
app = sub_once(r"\n              \{activeDoc\.kind === 'word' && \(.*?\n              \)\}\n              \{\/\* key 保证", "\n              {/* key 保证", app, 'ruler jsx')
for line in [
    "                paged={activeDoc.kind === 'word'}\n",
    "                pageH={pageSize.h}\n",
    "                breakStyle={breakStyle}\n",
    "                pageLabelStyle={pageLabelStyle}\n",
    "                layoutKey={`${activeDoc.kind}:${paper}:${pageSize.w}:${pageSize.h}:${pagePad}`}\n",
    "                visualScale={zoom}\n",
    "          isWord={activeDoc?.kind === 'word'}\n",
    "          breakStyle={breakStyle}\n",
    "          setBreakStyle={setBreakStyle}\n",
    "          pageLabelStyle={pageLabelStyle}\n",
    "          setPageLabelStyle={setPageLabelStyle}\n",
    "          pagePad={pagePad}\n",
    "          setPagePad={setPagePad}\n",
]:
    app = app.replace(line, '')
app = app.replace("handleCreate('document')", 'handleCreate()')
app = app.replace('onCreate={handleCreate}', 'onCreate={handleCreate}')
app = app.replace('<header className="topbar">', '<header className="topbar" onDoubleClick={handleTitlebarDoubleClick}>')
insert_anchor = "  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId])\n"
insert = insert_anchor + "\n  const handleTitlebarDoubleClick = (event) => {\n    if (event.target.closest?.('button, input, select, textarea, a, [data-no-drag]')) return\n    window.tdocs?.toggleMaximize?.()\n  }\n"
if insert_anchor not in app:
    raise RuntimeError('titlebar insertion anchor missing')
app = app.replace(insert_anchor, insert, 1)
# remove stale Word wording in comments
app = app.replace('整体配色主题：浅色系 / 深色系各 4 套', '整体配色主题：浅色系 / 深色系各 4 套')
app = app.replace('每套定义整套界面 + 纸张配色', '每套定义完整界面与编辑区域配色')
write('src/App.jsx', app)

# ---------- Settings dialog ----------
settings = r'''import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import AiPanel from './AiPanel.jsx'

const TABS = [
  ['general', '常规', 'doc'],
  ['appearance', '外观', 'highlight'],
  ['ai', 'AI 模型', 'sparkle'],
]

export default function SettingsDialog({
  onClose, themePref, setThemePref, themes, themeGroups, theme,
  lightKey, darkKey, setLightKey, setDarkKey,
}) {
  const [tab, setTab] = useState('general')
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="settings-dialog-mask" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-dialog-head">
          <div><strong>设置</strong><span>应用、外观和 AI 配置</span></div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15} /></button>
        </header>
        <div className="settings-dialog-body">
          <nav className="settings-nav">
            {TABS.map(([id, label, icon]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon name={icon} size={15} /><span>{label}</span></button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === 'general' && (
              <div className="settings-page">
                <h2>文档工作区</h2>
                <div className="workspace-settings-card">
                  <div className="workspace-kind-icon"><Icon name="doc" size={24} /></div>
                  <div><strong>本地优先的连续文档</strong><p>所有文件使用统一的连续画布。内容自动保存在本机，并支持大纲、查找替换、版本历史、代码块和多格式导出。</p></div>
                </div>
                <div className="settings-note">0.2.0-preview 已移除未达到发布标准的 Word/A4/B5 试验功能。</div>
              </div>
            )}
            {tab === 'appearance' && (
              <div className="settings-page">
                <h2>外观</h2>
                <div className="settings-field-group">
                  <label>明暗模式</label>
                  <div className="settings-seg settings-seg-wide">
                    <button className={themePref === 'light' ? 'active' : ''} onClick={() => setThemePref('light')}>浅色</button>
                    <button className={themePref === 'dark' ? 'active' : ''} onClick={() => setThemePref('dark')}>深色</button>
                    <button className={themePref === 'system' ? 'active' : ''} onClick={() => setThemePref('system')}>跟随系统</button>
                  </div>
                </div>
                {themeGroups.map(([groupName, keys]) => (
                  <div className="settings-field-group" key={groupName}>
                    <label>{groupName}</label>
                    <div className="settings-theme-grid">
                      {keys.map((key) => {
                        const item = themes[key]
                        const current = theme === 'dark' ? darkKey : lightKey
                        return (
                          <button key={key} className={`settings-theme-card${current === key ? ' active' : ''}`} onClick={() => {
                            if (item.mode === 'dark') { setDarkKey(key); setThemePref('dark') }
                            else { setLightKey(key); setThemePref('light') }
                          }}>
                            <span className="settings-theme-preview" style={{ background: item.colors['surface-2'], borderColor: item.accent }}><i style={{ background: item.accent }} /></span>
                            <span>{item.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'ai' && <div className="settings-page"><h2>AI 模型</h2><AiPanel embedded /></div>}
          </div>
        </div>
      </section>
    </div>
  )
}
'''
write('src/components/SettingsDialog.jsx', settings)

# ---------- AI select menus: mutually exclusive ----------
ai = read('src/components/AiPanel.jsx')
ai = ai.replace("function SelectMenu({ value, options, onChange }) {\n  const [open, setOpen] = useState(false)", "function SelectMenu({ menuId, openMenu, setOpenMenu, value, options, onChange }) {\n  const open = openMenu === menuId")
ai = sub_once(r"  useEffect\(\(\) => \{\n    if \(!open\) return undefined.*?\n  \}, \[open\]\)\n", '', ai, 'ai local outside effect')
ai = ai.replace("setOpen((value) => !value)", "setOpenMenu(open ? null : menuId)")
ai = ai.replace("setOpen(false)", "setOpenMenu(null)")
ai = ai.replace("  const [keyMenu, setKeyMenu] = useState(null)\n", "  const [keyMenu, setKeyMenu] = useState(null)\n  const [openMenu, setOpenMenu] = useState(null)\n\n  useEffect(() => {\n    if (!openMenu) return undefined\n    const close = (event) => { if (!event.target.closest?.('.ai-select')) setOpenMenu(null) }\n    document.addEventListener('mousedown', close, true)\n    return () => document.removeEventListener('mousedown', close, true)\n  }, [openMenu])\n")
ai = ai.replace('<SelectMenu value={providerId} options={PROVIDERS.map((item) => [item.id, item.name])} onChange={selectProvider} />', '<SelectMenu menuId="provider" openMenu={openMenu} setOpenMenu={setOpenMenu} value={providerId} options={PROVIDERS.map((item) => [item.id, item.name])} onChange={selectProvider} />')
ai = ai.replace('          <SelectMenu\n            value={inList ? cfg.model : \'__custom__\'}', '          <SelectMenu\n            menuId="model"\n            openMenu={openMenu}\n            setOpenMenu={setOpenMenu}\n            value={inList ? cfg.model : \'__custom__\'}')
write('src/components/AiPanel.jsx', ai)

# ---------- Sidebar: one clean document button ----------
side = read('src/components/Sidebar.jsx')
side = side.replace("  const [createMenuOpen, setCreateMenuOpen] = useState(false)\n", '')
side = sub_once(r"\n  useEffect\(\(\) => \{\n    if \(!createMenuOpen\) return undefined.*?\n  \}, \[createMenuOpen\]\)\n", '\n', side, 'sidebar create menu effect')
side = side.replace("{doc.title || (doc.kind === 'word' ? '无标题 Word' : '无标题文档')}", "{doc.title || '无标题文档'}")
side = re.sub(r"<span className=\{`doc-kind-badge .*?</span>", '<span className="doc-kind-badge document">文档</span>', side)
side = sub_once(r"\s*<div className=\"new-doc-split\">.*?</div>\n\s*<div className=\"sidebar-search-row\">", "\n        <button className=\"btn btn-primary new-doc-button\" onClick={() => onCreate('')}><Icon name=\"plus\" size={15} />新建文档</button>\n        <div className=\"sidebar-search-row\">", side, 'sidebar new button')
write('src/components/Sidebar.jsx', side)

# ---------- Toolbar: remove Word controls ----------
toolbar = read('src/components/Toolbar.jsx')
toolbar = toolbar.replace('// 中文字号（参考 Word/WPS）：名称 → 像素值', '// 中文字号名称 → 像素值')
toolbar = toolbar.replace('export default function Toolbar({ editor, onAi, isWord = false })', 'export default function Toolbar({ editor, onAi })')
toolbar = re.sub(r"\n\s*\{isWord && <TB icon=\"page\"[^\n]+\}", '', toolbar)
write('src/components/Toolbar.jsx', toolbar)

# ---------- Storage: document-only migration ----------
storage = r'''const DOCS_KEY = 'inkdocs.documents.v1'
const ACTIVE_KEY = 'inkdocs.activeDoc.v1'
const THEME_KEY = 'inkdocs.theme.v1'
const GROUPS_KEY = 'inkdocs.groups.v1'

export function loadDocs() {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.map(normalizeDoc) : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  localStorage.setItem(DOCS_KEY, JSON.stringify((docs || []).map(normalizeDoc)))
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function loadTheme() {
  const value = localStorage.getItem(THEME_KEY)
  return ['light', 'dark', 'system'].includes(value) ? value : 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveGroups(groups) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups || []))
}

export function createGroup(name = '新建文件夹') {
  return { id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, collapsed: false }
}

export function normalizeDoc(doc = {}) {
  const normalized = {
    ...doc,
    title: doc.title || '无标题文档',
    content: doc.content || '',
    kind: 'document',
    group: doc.isWelcome ? '' : (doc.group || ''),
    pinned: Boolean(doc.pinned || doc.isWelcome),
    isWelcome: Boolean(doc.isWelcome),
    createdAt: Number(doc.createdAt) || Date.now(),
    updatedAt: Number(doc.updatedAt) || Date.now(),
  }
  delete normalized.paper
  return normalized
}

export function createDoc(title = '无标题文档', content = '', options = {}) {
  const now = Date.now()
  return normalizeDoc({
    id: `doc-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: title || '无标题文档',
    content,
    group: options.group || '',
    pinned: Boolean(options.pinned),
    isWelcome: Boolean(options.isWelcome),
    autoTitle: options.autoTitle !== false,
    createdAt: now,
    updatedAt: now,
  })
}

export function stripHtml(html = '') {
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent || element.innerText || ''
}
'''
write('src/lib/storage.js', storage)

# ---------- Editor: delete pagination engine ----------
editor = read('src/components/Editor.jsx')
editor = editor.replace("import { useEditor, EditorContent, Extension } from '@tiptap/react'", "import { useEditor, EditorContent } from '@tiptap/react'")
editor = editor.replace("import { Node, Mark, mergeAttributes } from '@tiptap/core'", "import { Mark, mergeAttributes } from '@tiptap/core'")
editor = editor.replace("import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model'", "import { DOMParser as PMDOMParser } from '@tiptap/pm/model'")
editor = editor.replace("import { canSplit } from '@tiptap/pm/transform'\n", '')
editor = sub_once(r"\n// ---------- 页节点.*?\n// ---------- 代码块", "\n// ---------- 代码块", editor, 'page nodes')
editor = editor.replace("const createCodeId = () => `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`\n", '')
editor = editor.replace("    runButton.title = '运行整个逻辑代码块'", "    runButton.title = '运行当前代码块'")
editor = editor.replace("            codeId: node.attrs.codeId || null,\n", '')
editor = editor.replace("        const start = Math.max(1, Number(node.attrs.lineStart) || 1)\n", "        const start = 1\n")
editor = editor.replace("        title.textContent = node.attrs.continued ? '代码 · 续' : '代码'", "        title.textContent = '代码'")
editor = editor.replace("        shell.dataset.codeId = node.attrs.codeId || ''\n        shell.classList.toggle('continued', Boolean(node.attrs.continued))\n", '')
editor = sub_once(r"\n// ---------- 分页留白：.*?\nexport default function Editor", "\nexport default function Editor", editor, 'page pad extension')
editor = re.sub(r"export default function Editor\(\{ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, onSelectionRange, aiSelection = null, aiInline = null, onResolveInline, layoutKey = '', visualScale = 1 \}\)", "export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, onSelection, onSelectionRange, aiSelection = null, aiInline = null, onResolveInline })", editor)
for line in [
    "  const [breakOffsets, setBreakOffsets] = useState([])\n",
    "  const pageMetaRef = useRef({ top: 64, left: 0, width: 0 })\n",
    "  const lastPagePads = useRef([])\n",
    "  const lastTailPad = useRef(null)\n",
    "  const lastPairsRef = useRef('')\n",
    "  const reflowRafRef = useRef(0)\n",
    "  const reflowRunRef = useRef(0)\n",
    "  const reflowingRef = useRef(false)\n",
    "  const modeRef = useRef(paged)\n",
    "  const layoutKeyRef = useRef(layoutKey)\n",
    "  const pagedRef = useRef(paged)\n",
    "  pagedRef.current = paged\n",
    "      PagePadExtension,\n",
    "      Page,\n",
    "      PageBreak,\n",
]:
    editor = editor.replace(line, '')
editor = editor.replace("        gapcursor: false,\n", '')
editor = sub_once(r"\n      handleDOMEvents: \{\n        mousedown:.*?\n      \},", '', editor, 'page mousedown')
editor = editor.replace("        onChange?.(getSaveHtml())", "        onChange?.(ed.getHTML())")
editor = sub_once(r"      let code = detail\.code \|\| ''\n      if \(detail\.codeId\) \{.*?\n      \}", "      const code = detail.code || ''", editor, 'code fragment collection')
editor = sub_once(r"\n  const mergeCodeNodes = .*?\n  // 选中文字统计", "\n  useEffect(() => () => {\n    if (saveTimer.current) clearTimeout(saveTimer.current)\n    if (editor) onChange?.(editor.getHTML())\n  }, [editor, onChange])\n\n  // 选中文字统计", editor, 'pagination engine')
editor = sub_once(r"\n  // 分页模式：.*?\n  // 浏览器开发模式", "\n  // 浏览器与桌面端统一使用中文自绘编辑菜单；普通输入框由 Electron 提供中文原生菜单。\n  // 浏览器开发模式", editor, 'page cleanup effect')
editor = editor.replace("        if (paged) return\n", '')
editor = editor.replace("        if (window.tdocs) return\n", '')
editor = editor.replace('<EditorContent editor={editor} className={`page${paged ? \' paged\' : \'\'}`} />', '<EditorContent editor={editor} className="page document-page" />')
editor = sub_once(r"\n        \{\/\* 页码层：.*?\n      \{ctxMenu &&", "\n      {ctxMenu &&", editor, 'pagination render')
write('src/components/Editor.jsx', editor)

# ---------- Electron: Chinese context menus and reliable maximize ----------
main = read('electron/main.cjs')
main = sub_once(r"\n  // 使用系统原生编辑菜单.*?\n  \}\)\n\}", r'''
  // 编辑器使用应用内中文菜单；普通输入框使用中文原生菜单。
  win.webContents.on('context-menu', async (_event, params) => {
    const inEditor = await win.webContents.executeJavaScript(
      `Boolean(document.elementFromPoint(${params.x}, ${params.y})?.closest('.editor-content'))`,
      true,
    ).catch(() => false)
    if (inEditor) return
    if (!params.isEditable && !params.selectionText) return
    const template = []
    if (params.misspelledWord) {
      for (const suggestion of (params.dictionarySuggestions || []).slice(0, 5)) {
        template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
      }
      if ((params.dictionarySuggestions || []).length) template.push({ type: 'separator' })
      template.push({ label: '添加到词典', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
      template.push({ type: 'separator' })
    }
    if (params.isEditable) {
      template.push(
        { label: '撤销', enabled: params.editFlags.canUndo, click: () => win.webContents.undo() },
        { label: '重做', enabled: params.editFlags.canRedo, click: () => win.webContents.redo() },
        { type: 'separator' },
        { label: '剪切', enabled: params.editFlags.canCut, click: () => win.webContents.cut() },
        { label: '复制', enabled: params.editFlags.canCopy, click: () => win.webContents.copy() },
        { label: '粘贴', enabled: params.editFlags.canPaste, click: () => win.webContents.paste() },
        { label: '粘贴并匹配样式', enabled: params.editFlags.canPaste, click: () => win.webContents.pasteAndMatchStyle() },
        { label: '删除', enabled: params.editFlags.canDelete, click: () => win.webContents.delete() },
        { type: 'separator' },
        { label: '全选', enabled: params.editFlags.canSelectAll, click: () => win.webContents.selectAll() },
      )
    } else {
      template.push({ label: '复制', click: () => win.webContents.copy() }, { type: 'separator' }, { label: '全选', click: () => win.webContents.selectAll() })
    }
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}''', main, 'electron context menu')
main = main.replace("  ipcMain.handle('open-external', (_event, url) => {", "  ipcMain.handle('toggle-maximize', (event) => {\n    const win = BrowserWindow.fromWebContents(event.sender)\n    if (!win) return false\n    if (win.isMaximized()) win.unmaximize()\n    else win.maximize()\n    return win.isMaximized()\n  })\n  ipcMain.handle('open-external', (_event, url) => {")
write('electron/main.cjs', main)
preload = read('electron/preload.cjs')
preload = preload.replace("  openExternal: (url) => ipcRenderer.invoke('open-external', url),", "  openExternal: (url) => ipcRenderer.invoke('open-external', url),\n  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),")
write('electron/preload.cjs', preload)

# ---------- Package metadata ----------
pkg = json.loads(read('package.json'))
pkg['version'] = '0.2.0-preview'
pkg['description'] = 'TDocs — 本地优先的智能文档编辑器（深色模式 / AI 改写 / 代码块 / 版本历史）· Preview 预览版'
write('package.json', json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')
lock = read('package-lock.json').replace('"version": "0.1.1-preview"', '"version": "0.2.0-preview"', 2)
write('package-lock.json', lock)

# ---------- Styles ----------
css = read('src/app.css')
css += r'''

/* ===== 0.2.0-preview：文档工作区统一视觉 ===== */
.new-doc-split, .new-doc-arrow, .new-doc-menu { display: none !important; }
.new-doc-button {
  width: 100%; min-height: 42px; justify-content: center; gap: 8px;
  border-radius: 11px !important; font-weight: 650; letter-spacing: .01em;
  box-shadow: 0 1px 2px rgba(0,0,0,.08);
}
.main[data-workspace="document"] .canvas { padding: 30px clamp(18px, 4vw, 64px) 96px; }
.main[data-workspace="document"] .page-wrap { width: min(960px, 100%); margin: 0 auto; }
.main[data-workspace="document"] .document-page {
  width: 100%; min-height: calc(100vh - 220px); padding: clamp(44px, 6vw, 78px);
  border: 1px solid var(--border); border-radius: 16px; background: var(--page-bg);
  box-shadow: 0 12px 36px rgba(20, 24, 32, .08); transform-origin: top center;
}
.settings-dialog { width: min(840px, calc(100vw - 32px)); height: min(620px, calc(100vh - 32px)); overflow: hidden; }
.settings-dialog-body { min-height: 0; overflow: hidden; }
.settings-nav { overflow-y: auto; overscroll-behavior: contain; }
.settings-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.settings-page { min-width: 0; }
.ai-cfg-grid { align-items: start; }
.ai-select { position: relative; min-width: 0; }
.ai-select-btn { width: 100%; min-height: 38px; position: relative; z-index: 1; }
.ai-select-menu {
  position: absolute !important; top: calc(100% + 6px) !important; left: 0 !important; right: auto !important;
  width: min(300px, calc(100vw - 80px)); max-height: 248px; overflow-y: auto;
  overscroll-behavior: contain; z-index: 980 !important; scrollbar-gutter: stable;
}
.ai-cfg-fields > label:nth-child(2) .ai-select-menu { left: auto !important; right: 0 !important; }
.code-block-shell { --code-font-size: 14px; --code-line-height: 25px; overflow: visible; }
.code-block-head { min-height: 38px; }
.code-block-head-actions { display: flex; align-items: center; gap: 8px; position: relative; z-index: 8; }
.code-language-select {
  width: 148px; height: 32px; padding: 0 32px 0 10px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font: 500 12px/1 var(--font-ui); cursor: pointer; pointer-events: auto;
}
.code-run-btn { min-height: 32px; border-radius: 8px; }
.code-block-shell pre {
  display: grid !important; grid-template-columns: 48px minmax(0, 1fr); align-items: stretch;
  margin: 0 !important; padding: 0 !important; font: 400 var(--code-font-size)/var(--code-line-height) var(--font-mono) !important;
}
.code-block-shell pre code {
  display: block; min-width: 0; padding: 12px 14px !important; margin: 0 !important;
  font: inherit !important; line-height: var(--code-line-height) !important; white-space: pre; tab-size: 2;
}
.code-gutter {
  display: flex !important; flex-direction: column; box-sizing: border-box; padding: 12px 0 !important;
  border-right: 1px solid var(--border); font: 400 var(--code-font-size)/var(--code-line-height) var(--font-mono) !important;
}
.code-gutter > span {
  display: block; height: var(--code-line-height); min-height: var(--code-line-height);
  line-height: var(--code-line-height) !important; padding: 0 10px 0 4px; box-sizing: border-box;
  text-align: right; color: var(--text-3);
}
.code-gutter > span.active { color: var(--accent); background: var(--accent-soft); font-weight: 700; }
.code-block-footer { min-height: 28px; display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; }
.context-menu .menu-item { min-height: 34px; }
.topbar { user-select: none; }
.topbar button, .topbar input, .topbar select, .topbar a { -webkit-app-region: no-drag; }
@media (max-width: 760px) {
  .main[data-workspace="document"] .canvas { padding: 16px 10px 72px; }
  .main[data-workspace="document"] .document-page { padding: 32px 24px; border-radius: 12px; }
  .settings-dialog-body { grid-template-columns: 132px minmax(0, 1fr); }
}
'''
write('src/app.css', css)

# ---------- Remove Word-only module and tests ----------
view_modes = ROOT / 'src/lib/viewModes.js'
if view_modes.exists(): view_modes.unlink()
for path in [ROOT / 'tests/viewModes.test.mjs']:
    if path.exists(): path.unlink()

# Rewrite mixed regression tests to the document-only contract.
for test_path in (ROOT / 'tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    if 'Word 支持显式分页符' in text or '文档与 Word 是持久化的独立文件类型' in text or 'Word 工作区拥有明确纸张图标' in text:
        # Remove complete node:test blocks that mention Word/page-only features.
        text = re.sub(r"\ntest\([^\n]*?(?:Word|纸张|分页).*?\n\}\)\n", '\n', text, flags=re.S)
        test_path.write_text(text, encoding='utf-8')

doc_test = r'''import test from 'node:test'
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
'''
write('tests/documentOnlyRelease.test.mjs', doc_test)

# Changelog makes the corrected version line explicit.
changelog = r'''# 更新记录

## 0.2.0-preview

- 删除未达到发布标准的 Word/A4/B5 工作区、分页节点和内容切分逻辑。
- 产品重新聚焦本地优先的连续文档编辑。
- 统一设置中心、菜单层级、新建入口、代码块行号和语言选择控件。
- 恢复中文完整右键菜单，稳定 macOS 标题栏双击最大化。
- 保留 AI 改写、查找替换、版本历史、代码运行及多格式导出。

## 0.1.2-preview

- 该版本号用于归档此前基于 0.1.x 的开发迭代。
- 包含 AI 选区高亮、多厂商模型配置、查找替换、本地版本历史和代码运行基础。
- 其中的分页试验未达到发布标准，未作为 0.2.0 功能保留。
'''
write('CHANGELOG.md', changelog)

print('document-only 0.2.0-preview refactor applied')
