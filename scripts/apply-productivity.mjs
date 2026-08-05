import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, content) => fs.writeFileSync(path.join(root, file), content)

function replaceOnce(content, search, replacement, label) {
  const next = content.replace(search, replacement)
  if (next === content) throw new Error(`未找到待修改片段：${label}`)
  return next
}

let editor = read('src/components/Editor.jsx')
if (!editor.includes("../extensions/SearchHighlight.js")) {
  editor = replaceOnce(
    editor,
    "import { Icon } from './Icons.jsx'",
    "import { Icon } from './Icons.jsx'\nimport { SearchHighlightExtension } from '../extensions/SearchHighlight.js'",
    'Editor 搜索扩展导入',
  )
  editor = replaceOnce(
    editor,
    '      AiSelPlugin,\n    ],',
    '      AiSelPlugin,\n      SearchHighlightExtension,\n    ],',
    'Editor 搜索扩展注册',
  )
  write('src/components/Editor.jsx', editor)
}

let app = read('src/App.jsx')
if (!app.includes("./components/FindReplace.jsx")) {
  app = replaceOnce(
    app,
    "import AiPrompt from './components/AiPrompt.jsx'",
    "import AiPrompt from './components/AiPrompt.jsx'\nimport FindReplace from './components/FindReplace.jsx'\nimport VersionHistory from './components/VersionHistory.jsx'",
    'App 面板导入',
  )
  app = replaceOnce(
    app,
    "import { PAPER_PRESETS as PAPER, normalizePaper, resolvePageSize, viewModeForPaper } from './lib/viewModes.js'",
    "import { PAPER_PRESETS as PAPER, normalizePaper, resolvePageSize, viewModeForPaper } from './lib/viewModes.js'\nimport { saveVersionSnapshot } from './lib/versionHistory.js'",
    'App 版本存储导入',
  )
  app = replaceOnce(
    app,
    "  const [showOutline, setShowOutline] = useState(false)",
    "  const [showOutline, setShowOutline] = useState(false)\n  const [showFindReplace, setShowFindReplace] = useState(false)\n  const [showVersionHistory, setShowVersionHistory] = useState(false)",
    'App 面板状态',
  )
  app = replaceOnce(
    app,
    '  const rulerDownRef = useRef(null)',
    "  const rulerDownRef = useRef(null)\n  const versionCheckpointRef = useRef(new Map())",
    'App 版本时间戳',
  )
  app = replaceOnce(
    app,
    "  useEffect(() => {\n    localStorage.setItem('inkdocs.zoom', String(zoom))\n  }, [zoom])",
    `  useEffect(() => {
    localStorage.setItem('inkdocs.zoom', String(zoom))
  }, [zoom])

  // 桌面文档的标准查找快捷键；拦截浏览器查找，定位到编辑器内文本。
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setShowFindReplace(true)
      }
      if (event.key === 'Escape') setShowFindReplace(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])`,
    'App 查找快捷键',
  )
  app = replaceOnce(
    app,
    `  const handleSelect = (id) => {
    if (id === activeId) {`,
    `  const handleSelect = (id) => {
    if (id !== activeId && activeDoc) {
      saveVersionSnapshot(activeDoc, { label: '切换前版本' })
    }
    if (id === activeId) {`,
    '切换文档前快照',
  )
  app = replaceOnce(
    app,
    `        const next = prev.map((d) => {
          if (d.id !== activeId) return d
          return { ...d, content: html, updatedAt: Date.now() }
        })`,
    `        const now = Date.now()
        const next = prev.map((d) => {
          if (d.id !== activeId) return d
          const updated = { ...d, content: html, updatedAt: now }
          const lastCheckpoint = versionCheckpointRef.current.get(d.id) || 0
          if (now - lastCheckpoint >= 5 * 60 * 1000) {
            saveVersionSnapshot(updated, { label: '自动版本' })
            versionCheckpointRef.current.set(d.id, now)
          }
          return updated
        })`,
    '自动版本快照',
  )
  app = replaceOnce(
    app,
    `  const handleTitleChange = (title) => {
    persist(docs.map((d) => (d.id === activeId ? { ...d, title, autoTitle: false, updatedAt: Date.now() } : d)))
  }

  const handleDelete`,
    `  const handleTitleChange = (title) => {
    persist(docs.map((d) => (d.id === activeId ? { ...d, title, autoTitle: false, updatedAt: Date.now() } : d)))
  }

  const handleRestoreVersion = (version) => {
    if (!activeDoc || !version) return
    saveVersionSnapshot(activeDoc, { label: '恢复前版本', force: true })
    const restored = {
      ...activeDoc,
      title: version.title || activeDoc.title,
      content: version.content || '',
      autoTitle: false,
      updatedAt: Date.now(),
    }
    persist(docs.map((d) => (d.id === activeId ? restored : d)))
    editor?.commands.setContent(restored.content, true)
    setShowVersionHistory(false)
  }

  const handleDelete`,
    '版本恢复处理',
  )
  app = replaceOnce(
    app,
    `          </span>

          {/* 页面：宽屏 / A4 / B5（自定义菜单，与其余下拉风格统一） */}`,
    `          </span>
          <button
            className={\`icon-btn\${showFindReplace ? ' active' : ''}\`}
            data-tip="查找和替换（⌘/Ctrl+F）"
            onClick={() => setShowFindReplace((value) => !value)}
          >
            <Icon name="search" />
          </button>
          <button
            className={\`icon-btn\${showVersionHistory ? ' active' : ''}\`}
            data-tip="版本历史"
            onClick={() => setShowVersionHistory((value) => !value)}
          >
            <Icon name="undo" />
          </button>

          {/* 页面：宽屏 / A4 / B5（自定义菜单，与其余下拉风格统一） */}`,
    '顶部查找和历史入口',
  )
  app = replaceOnce(
    app,
    `          {/* AI 配置面板（只做配置与连接测试） */}`,
    `          {showFindReplace && (
            <FindReplace editor={editor} onClose={() => setShowFindReplace(false)} />
          )}
          {showVersionHistory && activeDoc && (
            <VersionHistory
              doc={activeDoc}
              onRestore={handleRestoreVersion}
              onClose={() => setShowVersionHistory(false)}
            />
          )}
          {/* AI 配置面板（只做配置与连接测试） */}`,
    '渲染查找和历史面板',
  )
  write('src/App.jsx', app)
}

let css = read('src/design-system.css')
if (!css.includes('/* productivity panels */')) {
  css += `

/* productivity panels */
.search-match {
  border-radius: 2px;
  background: color-mix(in srgb, var(--warn) 36%, transparent);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--warn) 70%, transparent);
}
.search-match-active {
  background: color-mix(in srgb, var(--accent) 32%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
}
.find-replace {
  position: fixed;
  z-index: 1200;
  top: calc(var(--topbar-h) + 8px);
  right: 18px;
  width: min(560px, calc(100vw - 36px));
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface) 97%, transparent);
  box-shadow: var(--floating-shadow);
  backdrop-filter: blur(18px) saturate(1.15);
}
.find-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.replace-row { margin-top: 6px; }
.find-row input,
.replace-row input {
  min-width: 0;
  height: 32px;
  flex: 1;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  color: var(--text);
}
.find-row input:focus,
.replace-row input:focus {
  border-color: var(--accent);
  background: var(--surface);
}
.find-count {
  min-width: 46px;
  color: var(--text-3);
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.find-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 7px 0 0 24px;
  color: var(--text-2);
  font-size: 12px;
}
.version-history {
  position: fixed;
  z-index: 1100;
  top: var(--topbar-h);
  right: 0;
  bottom: 30px;
  width: min(360px, calc(100vw - 28px));
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 98%, transparent);
  box-shadow: -12px 0 36px rgba(17,24,39,.13);
  backdrop-filter: blur(18px) saturate(1.1);
}
.panel-head {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.panel-head > div { display: grid; gap: 3px; }
.panel-head span { color: var(--text-3); font-size: 12px; }
.version-actions { padding: 10px 14px; border-bottom: 1px solid var(--border); }
.version-list { overflow: auto; padding: 10px; }
.version-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  background: var(--surface-2);
}
.version-item + .version-item { margin-top: 8px; }
.version-meta { display: flex; justify-content: space-between; gap: 8px; }
.version-meta time { color: var(--text-3); font-size: 11px; }
.version-title { margin-top: 7px; font-weight: 600; }
.version-item p { margin: 6px 0 10px; color: var(--text-2); font-size: 12px; line-height: 1.55; }
.version-item-actions { display: flex; gap: 6px; }
.version-delete { color: var(--danger); }
.panel-empty { padding: 28px 16px; color: var(--text-3); text-align: center; line-height: 1.6; }
@media (max-width: 640px) {
  .find-replace { right: 8px; width: calc(100vw - 16px); }
  .replace-row { flex-wrap: wrap; }
  .replace-row input { flex-basis: calc(100% - 24px); }
}
`
  write('src/design-system.css', css)
}

console.log('TDocs productivity refactor applied successfully.')
