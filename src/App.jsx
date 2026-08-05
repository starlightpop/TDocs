import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoUrl from './assets/logo.svg'
import Sidebar from './components/Sidebar.jsx'
import Toolbar from './components/Toolbar.jsx'
import Editor from './components/Editor.jsx'
import Outline from './components/Outline.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import AiPrompt from './components/AiPrompt.jsx'
import FindReplace from './components/FindReplace.jsx'
import VersionHistory from './components/VersionHistory.jsx'
import { Icon } from './components/Icons.jsx'
import {
  loadDocs, saveDocs, loadActiveId, saveActiveId, createDoc,
  loadTheme, saveTheme, stripHtml,
  loadGroups, saveGroups, createGroup,
} from './lib/storage.js'
import { exportHtml, exportMarkdown, exportText, exportDocx, exportEpub } from './lib/exporter.js'
import { scrollToHeadingByIndex, setHeadingsLevel } from './lib/headings.js'
import { renderMarkdown } from './lib/markdown.js'
import { saveVersionSnapshot } from './lib/versionHistory.js'

const WELCOME_HTML = `
<h1>欢迎使用 TDocs</h1>
<p>TDocs 0.2.0-preview 聚焦稳定的本地文档编辑，不再包含尚未完成的 Word/A4/B5 工作区。欢迎文件默认置顶，也可以删除。</p>
<h2>文档编辑</h2>
<ul>
  <li>连续画布、标题大纲、查找替换、自动保存与本地版本历史</li>
  <li>标题、列表、任务清单、引用、表格、图片、链接，以及 Markdown 粘贴与直接输入自动识别</li>
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

const WELCOME_SEED_KEY = 'inkdocs.welcomeSeed.0.2.0-document-preview'

export default function App() {
  // ---------- 主题：支持 跟随系统 / 浅色 / 深色 ----------
  const [themePref, setThemePref] = useState(loadTheme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  // 监听系统深浅色变化，跟随系统时实时切换
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const theme = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref

  // ---------- 整体配色主题：浅色系 / 深色系各 4 套 ----------
  // 每套定义完整界面与编辑区域配色，不再是单独的“页面颜色”
  const THEMES = {
    clean: {
      name: '清新白', mode: 'light', accent: '#4f6ef7',
      colors: {
        'bg': '#f2f4f7', 'bg-canvas': '#e9ebef', 'surface': '#ffffff', 'surface-2': '#f1f3f6', 'surface-3': '#e7eaf0',
        'text': '#1c1e21', 'text-2': '#4b5563', 'text-3': '#8a919c',
        'border': '#dde1e8', 'border-strong': '#c9cfd9',
        'accent': '#4f6ef7', 'accent-hover': '#3f5ce0', 'accent-soft': 'rgba(79,110,247,0.12)', 'accent-text': '#ffffff',
        'page-bg': '#ffffff', 'selection': 'rgba(79,110,247,0.2)', 'scrollbar-thumb': '#c4cad4',
      },
    },
    cream: {
      name: '暖米', mode: 'light', accent: '#c98a2d',
      colors: {
        'bg': '#f4eee2', 'bg-canvas': '#ede5d4', 'surface': '#fdf9f0', 'surface-2': '#f8f1e3', 'surface-3': '#f0e6d2',
        'text': '#2b2620', 'text-2': '#6d6253', 'text-3': '#9c907c',
        'border': '#e7dcc6', 'border-strong': '#d6c8ac',
        'accent': '#c98a2d', 'accent-hover': '#b5781f', 'accent-soft': 'rgba(201,138,45,0.14)', 'accent-text': '#ffffff',
        'page-bg': '#fdf8ee', 'selection': 'rgba(201,138,45,0.22)', 'scrollbar-thumb': '#d2c4a8',
      },
    },
    mint: {
      name: '薄荷', mode: 'light', accent: '#2f9e6e',
      colors: {
        'bg': '#edf4ef', 'bg-canvas': '#e2ece5', 'surface': '#f8fbf9', 'surface-2': '#f0f7f2', 'surface-3': '#e5f0e8',
        'text': '#1f2a24', 'text-2': '#4e6257', 'text-3': '#83938a',
        'border': '#dce7df', 'border-strong': '#c6d8cc',
        'accent': '#2f9e6e', 'accent-hover': '#26885d', 'accent-soft': 'rgba(47,158,110,0.13)', 'accent-text': '#ffffff',
        'page-bg': '#f6faf7', 'selection': 'rgba(47,158,110,0.2)', 'scrollbar-thumb': '#bdd0c3',
      },
    },
    lavender: {
      name: '淡紫', mode: 'light', accent: '#8b5cf6',
      colors: {
        'bg': '#f1eefb', 'bg-canvas': '#e7e2f6', 'surface': '#faf9fe', 'surface-2': '#f3f0fb', 'surface-3': '#eae5f6',
        'text': '#26223a', 'text-2': '#5d5578', 'text-3': '#948cb0',
        'border': '#e2ddf2', 'border-strong': '#cfc7e8',
        'accent': '#8b5cf6', 'accent-hover': '#7c4ee0', 'accent-soft': 'rgba(139,92,246,0.13)', 'accent-text': '#ffffff',
        'page-bg': '#f8f6fd', 'selection': 'rgba(139,92,246,0.2)', 'scrollbar-thumb': '#c9c0e4',
      },
    },
    night: {
      name: '暗夜', mode: 'dark', accent: '#6d8aff',
      colors: {
        'bg': '#0e1013', 'bg-canvas': '#0a0c0f', 'surface': '#16191f', 'surface-2': '#1d2129', 'surface-3': '#242933',
        'text': '#e6e8ec', 'text-2': '#a7adba', 'text-3': '#6b7280',
        'border': '#2a2f3a', 'border-strong': '#383f4d',
        'accent': '#6d8aff', 'accent-hover': '#85a0ff', 'accent-soft': 'rgba(109,138,255,0.16)', 'accent-text': '#0e1013',
        'page-bg': '#16191f', 'selection': 'rgba(109,138,255,0.3)', 'scrollbar-thumb': '#3a4050',
      },
    },
    ocean: {
      name: '深海', mode: 'dark', accent: '#4f8ef7',
      colors: {
        'bg': '#0b1220', 'bg-canvas': '#070d18', 'surface': '#111a2c', 'surface-2': '#172238', 'surface-3': '#1e2b45',
        'text': '#dbe6f5', 'text-2': '#93a4bf', 'text-3': '#5c6b85',
        'border': '#1f2c42', 'border-strong': '#2b3c58',
        'accent': '#4f8ef7', 'accent-hover': '#6ba3ff', 'accent-soft': 'rgba(79,142,247,0.17)', 'accent-text': '#0b1220',
        'page-bg': '#101a2e', 'selection': 'rgba(79,142,247,0.3)', 'scrollbar-thumb': '#2c3b55',
      },
    },
    forest: {
      name: '墨绿', mode: 'dark', accent: '#3dbb84',
      colors: {
        'bg': '#0c1210', 'bg-canvas': '#080e0c', 'surface': '#121a16', 'surface-2': '#18221c', 'surface-3': '#202c24',
        'text': '#dce8e0', 'text-2': '#8fa397', 'text-3': '#5c6e64',
        'border': '#22302a', 'border-strong': '#2f423a',
        'accent': '#3dbb84', 'accent-hover': '#58cf9a', 'accent-soft': 'rgba(61,187,132,0.16)', 'accent-text': '#0c1210',
        'page-bg': '#101713', 'selection': 'rgba(61,187,132,0.28)', 'scrollbar-thumb': '#2c3b33',
      },
    },
    grape: {
      name: '暗紫', mode: 'dark', accent: '#a78bfa',
      colors: {
        'bg': '#120f1a', 'bg-canvas': '#0d0b14', 'surface': '#1a1626', 'surface-2': '#211c30', 'surface-3': '#2a243c',
        'text': '#e6e0f0', 'text-2': '#a196c0', 'text-3': '#6f6588',
        'border': '#2c2540', 'border-strong': '#3b3254',
        'accent': '#a78bfa', 'accent-hover': '#bda4fc', 'accent-soft': 'rgba(167,139,250,0.16)', 'accent-text': '#120f1a',
        'page-bg': '#181424', 'selection': 'rgba(167,139,250,0.3)', 'scrollbar-thumb': '#3b3254',
      },
    },
  }
  // 浅色系 / 深色系分组（菜单展示顺序）
  const THEME_GROUPS = [
    ['浅色系', ['clean', 'cream', 'mint', 'lavender']],
    ['深色系', ['night', 'ocean', 'forest', 'grape']],
  ]

  // 浅色/深色组各自记住最后选择的主题，跟随系统时自动切换
  useEffect(() => {
    saveTheme(themePref)
  }, [themePref])

  const [lightKey, setLightKey] = useState(() => {
    const saved = localStorage.getItem('inkdocs.themeLight')
    return THEMES[saved] ? saved : 'clean'
  })
  const [darkKey, setDarkKey] = useState(() => {
    const saved = localStorage.getItem('inkdocs.themeDark')
    return THEMES[saved] ? saved : 'night'
  })
  const activeThemeKey = theme === 'dark' ? darkKey : lightKey
  const activeTheme = THEMES[activeThemeKey]

  useEffect(() => {
    localStorage.setItem('inkdocs.themeLight', lightKey)
  }, [lightKey])
  useEffect(() => {
    localStorage.setItem('inkdocs.themeDark', darkKey)
  }, [darkKey])

  // 应用主题：data-theme + 整套 CSS 变量
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme.mode)
    const root = document.documentElement
    for (const [k, v] of Object.entries(activeTheme.colors)) {
      root.style.setProperty(`--${k}`, v)
    }
    localStorage.setItem('inkdocs.accent', activeTheme.accent)
  }, [activeTheme])

  // ---------- 文档 ----------
  const [docs, setDocs] = useState(() => {
    const existing = loadDocs()
    const welcomeIndex = existing.findIndex((doc) => doc.isWelcome || doc.title === '欢迎使用 TDocs')
    if (welcomeIndex >= 0) {
      const current = existing[welcomeIndex]
      const welcomeDoc = {
        ...current,
        title: '欢迎使用 TDocs',
        content: WELCOME_HTML,
        pinned: true,
        isWelcome: true,
        group: '',
      }
      const next = [welcomeDoc, ...existing.filter((_doc, index) => index !== welcomeIndex)]
      localStorage.setItem(WELCOME_SEED_KEY, '1')
      saveDocs(next)
      return next
    }
    if (localStorage.getItem(WELCOME_SEED_KEY) !== '1') {
      const welcomeDoc = createDoc('欢迎使用 TDocs', WELCOME_HTML, { pinned: true, isWelcome: true })
      const next = [welcomeDoc, ...existing]
      localStorage.setItem(WELCOME_SEED_KEY, '1')
      saveDocs(next)
      return next
    }
    return existing
  })
  const [activeId, setActiveId] = useState(() => {
    const id = loadActiveId()
    return id || loadDocs()[0]?.id || null
  })
  const [saveState, setSaveState] = useState('saved') // saved | saving
  const [stats, setStats] = useState({ words: 0, chars: 0 })
  const [selectedChars, setSelectedChars] = useState(0)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editor, setEditor] = useState(null)
  const zoomAnchorRef = useRef(null)
  const [zoomMenuPos, setZoomMenuPos] = useState(null)
  const versionCheckpointRef = useRef(new Map())
  const lastSelectionRef = useRef(null)

  const [headings, setHeadings] = useState([])
  const [activeHeadingIdx, setActiveHeadingIdx] = useState(-1)
  const [modal, setModal] = useState(null) // {type:'rename'|'delete', doc}

  // ---------- 分组 ----------
  const [groups, setGroups] = useState(loadGroups)
  const [editingGroupId, setEditingGroupId] = useState(null)
  // 侧边栏标题树展开状态（点击已打开的文档可收起）
  const [treeOpen, setTreeOpen] = useState(true)

  // ---------- 字号缩放（⌘/Ctrl + 滚轮） ----------
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('inkdocs.zoom')) || 1)
  const previousZoomRef = useRef(zoom)
  const mainRef = useRef(null)

  // ---------- AI ----------
  const [aiPrompt, setAiPrompt] = useState(null) // {editor, selection, pos}
  const [aiInline, setAiInline] = useState(null) // 内联 diff 接受/撤销 {from, to, oldHtml, newHtml}

  // 大纲点击跳转后的滚动抑制，避免高亮被滚回上一个标题
  const jumpSuppressRef = useRef(0)

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId])

  const handleTitlebarDoubleClick = (event) => {
    if (event.target.closest?.('button, input, select, textarea, a, [data-no-drag]')) return
    window.tdocs?.toggleMaximize?.()
  }


  // 初次加载修正 activeId
  useEffect(() => {
    if (!activeDoc && docs.length) setActiveId(docs[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  useEffect(() => {
    localStorage.setItem('inkdocs.zoom', String(zoom))
  }, [zoom])

  // 缩放菜单始终锚定状态栏按钮。大纲、侧边栏或窗口尺寸变化时重新计算。
  useEffect(() => {
    if (!zoomMenuOpen) {
      setZoomMenuPos(null)
      return undefined
    }
    const anchor = zoomAnchorRef.current
    if (!anchor) return undefined
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const width = 144
      const height = 304
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width))
      const top = Math.max(8, rect.top - height - 8)
      setZoomMenuPos({ top, left })
    }
    const frame = requestAnimationFrame(update)
    const Observer = window.ResizeObserver
    const observer = Observer ? new Observer(update) : null
    observer?.observe(anchor)
    if (mainRef.current) observer?.observe(mainRef.current)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [zoomMenuOpen, showOutline, sidebarCollapsed])

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
  }, [])

  // ⌘/Ctrl + 滚轮调节字号
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom((z) => {
        const next = z + (e.deltaY < 0 ? 0.1 : -0.1)
        return Math.min(2, Math.max(0.6, Number(next.toFixed(2))))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 保存全部文档（防抖由调用点控制，这里直接写）
  const persist = useCallback((next) => {
    setDocs(next)
    setSaveState('saving')
    saveDocs(next)
    setTimeout(() => setSaveState('saved'), 400)
  }, [])

  // ---------- 操作 ----------
  const handleCreate = (group = '') => {
    const doc = createDoc('无标题文档', '', { group })
    doc.group = group || ''
    persist([doc, ...docs])
    setActiveId(doc.id)
    setEditor(null)
    setHeadings([])
  }

  const handleSelect = (id) => {
    if (id !== activeId && activeDoc) {
      saveVersionSnapshot(activeDoc, { label: '切换前版本' })
    }
    if (id === activeId) {
      // 再次点击当前文档：展开/收起标题树
      setTreeOpen((v) => !v)
      return
    }
    setActiveId(id)
    setEditor(null)
    setHeadings([])
    setTreeOpen(true)
  }

  const handleContentChange = useCallback(
    (html) => {
      setDocs((prev) => {
        const now = Date.now()
        const next = prev.map((d) => {
          if (d.id !== activeId) return d
          const updated = { ...d, content: html, updatedAt: now }
          const lastCheckpoint = versionCheckpointRef.current.get(d.id) || 0
          if (now - lastCheckpoint >= 5 * 60 * 1000) {
            saveVersionSnapshot(updated, { label: '自动版本' })
            versionCheckpointRef.current.set(d.id, now)
          }
          return updated
        })
        saveDocs(next)
        return next
      })
      setSaveState('saving')
      setTimeout(() => setSaveState('saved'), 350)
    },
    [activeId],
  )

  const handleTitleChange = (title) => {
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

  const handleDelete = (doc) => {
    setModal({
      type: 'delete',
      doc,
      confirm: () => {
        const next = docs.filter((d) => d.id !== doc.id)
        persist(next)
        if (activeId === doc.id) {
          setActiveId(next[0]?.id || null)
          setEditor(null)
        }
        setModal(null)
      },
    })
  }

  // 文件重命名：直接原处内联编辑后提交
  const doRenameDoc = (doc, name) => {
    const fallback = '无标题文档'
    persist(docs.map((d) => (d.id === doc.id ? { ...d, title: name?.trim() || fallback, updatedAt: Date.now() } : d)))
  }

  const handleTogglePin = (doc) => {
    persist(docs.map((d) => (d.id === doc.id ? { ...d, pinned: !d.pinned, updatedAt: Date.now() } : d)))
  }

  // ---------- 分组操作 ----------
  const persistGroups = (next) => {
    setGroups(next)
    saveGroups(next)
  }

  const handleToggleGroupPin = (group) => {
    persistGroups(groups.map((item) => (
      item.id === group.id ? { ...item, pinned: !item.pinned } : item
    )))
  }

  const handleAddGroup = () => {
    // 直接创建并进入内联重命名，不依赖浏览器 prompt
    let name = '新建文件夹'
    let n = 1
    while (groups.some((g) => g.name === name)) {
      n += 1
      name = `新建文件夹 ${n}`
    }
    const g = createGroup(name)
    persistGroups([...groups, g])
    setEditingGroupId(g.id)
  }

  const handleRenameGroup = (group) => {
    setEditingGroupId(group.id)
  }

  const commitGroupName = (gid, name) => {
    const trimmed = name?.trim()
    if (trimmed) {
      persistGroups(groups.map((g) => (g.id === gid ? { ...g, name: trimmed } : g)))
    }
    setEditingGroupId(null)
  }

  const handleDeleteGroup = (group) => {
    setModal({
      type: 'deleteGroup',
      group,
      confirm: () => {
        persistGroups(groups.filter((g) => g.id !== group.id))
        persist(docs.map((d) => (d.group === group.id ? { ...d, group: '' } : d)))
        setModal(null)
      },
    })
  }

  const handleMoveDoc = (docId, groupId) => {
    persist(docs.map((d) => (d.id === docId ? { ...d, group: groupId } : d)))
  }

  // 文件拖出窗口 → 导出为本地 HTML 文件（系统拖拽）
  const handleDragExport = async (doc) => {
    try {
      await window.tdocs?.dragExport?.({ title: doc.title || '无标题文档', html: doc.content })
    } catch { /* 拖出导出失败时静默 */ }
  }

  // 外部文件 → 文档（支持 md/txt/html）
  const importFiles = (files) => {
    if (!files?.length) return
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    const newDocs = files.map((f) => {
      const title = String(f.name || '未命名').replace(/\.(md|markdown|txt|html?)$/i, '') || '未命名'
      let content = ''
      if (/\.(md|markdown)$/i.test(f.name)) content = renderMarkdown(f.content)
      else if (/\.(html?)$/i.test(f.name)) content = f.content
      else content = String(f.content).split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join('')
      return { ...createDoc(title, content, { kind: activeDoc?.kind || 'document', paper: activeDoc?.paper || 'a4' }), group: '' }
    })
    persist([...newDocs, ...docs])
    setActiveId(newDocs[0].id)
    setEditor(null)
    setHeadings([])
  }

  // 从系统对话框打开本地文件
  const handleOpenFiles = async () => {
    const files = await window.tdocs?.openFiles?.()
    importFiles(files)
  }

  // 外部文件拖入窗口任意位置 → 导入（应用内拖拽不受影响）
  const handleWindowDrop = (e) => {
    const docId = e.dataTransfer.getData('text/tdocs-doc')
    if (docId) return // 应用内拖拽，交给文件夹 drop 处理
    const files = [...(e.dataTransfer.files || [])]
      .filter((f) => /\.(md|markdown|txt|html?)$/i.test(f.name))
      .map((f) => ({ name: f.name, read: f.text() }))
    if (!files.length) return
    e.preventDefault()
    Promise.all(files.map(async (f) => ({ name: f.name, content: await f.read }))).then(importFiles)
  }

  // 文件夹拖拽排序：把 gid 移到 targetId 前面
  const handleReorderGroups = (gid, targetId) => {
    const next = groups.filter((g) => g.id !== gid)
    const targetIdx = next.findIndex((g) => g.id === targetId)
    const moved = groups.find((g) => g.id === gid)
    if (!moved || targetIdx < 0) return
    next.splice(targetIdx, 0, moved)
    persistGroups(next)
  }

  // ---------- AI ----------
  const openAi = (e) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selection = from !== to ? { from, to } : lastSelectionRef.current
    let pos = null
    if (selection) {
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        // 优先显示在选区上方；空间不足时放下方，均不遮挡选中文字
        pos = {
          top: rect.top,
          left: rect.left + rect.width / 2,
          anchor: rect.top > 240 ? 'above' : 'below',
        }
      }
    }
    if (!pos) {
      // 顶栏 AI 按钮下方弹出
      const btn = e?.currentTarget
      const r = btn?.getBoundingClientRect?.() || { bottom: 90, left: window.innerWidth / 2, width: 0 }
      pos = { top: r.bottom, left: r.left + (r.width || 0) / 2, anchor: 'below' }
    }
    setAiPrompt({ editor, selection, pos })
  }

  // 选中改写结果：在文档内呈现内联 diff（原文划线 + 新内容高亮），供接受/撤销
  const handleInlineDiff = ({ oldHtml, newHtml, range }) => {
    if (!editor) return
    const fallback = editor.state.selection
    const from = Number.isInteger(range?.from) ? range.from : fallback.from
    const to = Number.isInteger(range?.to) ? range.to : fallback.to
    if (from >= to || to > editor.state.doc.content.size) return
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    const oldText = stripHtml(oldHtml).replace(/\s+/g, ' ').trim()
    const diffHtml = `<span class="ai-inline-old">${esc(oldText)}</span><span class="ai-inline-new">${newHtml}</span>`
    editor.chain().focus().insertContentAt({ from, to }, diffHtml).run()
    const view = editor.view
    setTimeout(() => {
      const oldEl = view.dom.querySelector('.ai-inline-old')
      const newEl = view.dom.querySelector('.ai-inline-new')
      if (oldEl && newEl) {
        const f = view.posAtDOM(oldEl, 0)
        const t = view.posAtDOM(newEl, newEl.childNodes.length)
        setAiInline({ from: f, to: t, oldHtml, newHtml })
      }
    }, 60)
  }

  // ---------- 导出 ----------
  const doExport = async (kind) => {
    if (!activeDoc) return
    const title = activeDoc.title || '无标题文档'
    if (kind === 'html') exportHtml(title, activeDoc.content)
    else if (kind === 'md') exportMarkdown(title, activeDoc.content)
    else if (kind === 'txt') exportText(title, stripHtml(activeDoc.content))
    else if (kind === 'docx') await exportDocx(title, activeDoc.content)
    else if (kind === 'epub') await exportEpub(title, activeDoc.content)
    else if (kind === 'pdf') {
      if (window.tdocs?.exportPdf) {
        try {
          const buf = await window.tdocs.exportPdf({ title, html: activeDoc.content })
          const blob = new Blob([buf], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${title || '未命名'}.pdf`
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (err) {
          console.error('PDF 导出失败', err)
        }
      }
    }
    setShowExportMenu(false)
  }

  // 统一菜单互斥：打开任意一个，关闭其他所有（含缩放/标尺）
  const closeAllMenus = () => {
    setShowExportMenu(false)
    setZoomMenuOpen(false)
  }

  // 点击外部关闭所有浮层菜单（互斥 + 全局关闭统一）
  useEffect(() => {
    if (!showExportMenu && !zoomMenuOpen) return
    const close = () => closeAllMenus()
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [showExportMenu, zoomMenuOpen])

  // 窗口过窄时自动收起侧边栏大纲树，避免页面被挤压遮挡
  useEffect(() => {
    const onResize = () => {
      const main = mainRef.current
      if (!main) return
      const w = main.clientWidth
      if (w < 700) setTreeOpen(false)
      else setTreeOpen(true)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const handleOutlineJump = (i) => {
    setActiveHeadingIdx(i)
    jumpSuppressRef.current = Date.now() + 900
  }

  // 从侧边栏标题树跳转
  const jumpToHeading = (i) => {
    scrollToHeadingByIndex(editor, i)
    handleOutlineJump(i)
  }

  // 大纲打开时，根据滚动位置高亮当前标题
  useEffect(() => {
    if (!showOutline) return
    const canvas = document.querySelector('.canvas')
    if (!canvas) return
    const onScroll = () => {
      if (Date.now() < jumpSuppressRef.current) return
      const els = document.querySelectorAll('.editor-content h1, .editor-content h2, .editor-content h3, .editor-content h4, .editor-content h5, .editor-content h6')
      if (!els.length) {
        setActiveHeadingIdx(-1)
        return
      }
      // 滚动到底部时高亮最后一个标题（短文档也能命中末章）
      if (canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 8) {
        setActiveHeadingIdx(els.length - 1)
        return
      }
      let idx = -1
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top < 140) idx = i
      })
      setActiveHeadingIdx(idx)
    }
    canvas.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => canvas.removeEventListener('scroll', onScroll)
  }, [showOutline, activeId, headings.length])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        // 允许外部文件拖入（应用内拖拽不影响）
        if ([...(e.dataTransfer.files || [])].some((f) => f.name && /\.(md|markdown|txt|html?)$/i.test(f.name))) {
          e.preventDefault()
        }
      }}
      onDrop={handleWindowDrop}
    >
      {/* 顶部栏 */}
      <header className="topbar" onDoubleClick={handleTitlebarDoubleClick}>
        <button className="icon-btn" data-tip="切换侧边栏" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <Icon name="sidebar" />
        </button>
        <div className="brand">
          <img src={logoUrl} alt="TDocs" />
          <span>TDocs</span>
        </div>
        <input
          className="doc-title-input"
          value={activeDoc?.title || ''}
          placeholder="无标题文档"
          disabled={!activeDoc}
          onChange={(e) => handleTitleChange(e.target.value)}
        />
        <div className="topbar-right">
          <span className={`save-status${saveState === 'saving' ? ' saving' : ''}`}>
            <span className="dot" />
            {saveState === 'saving' ? '保存中…' : '已保存'}
          </span>
          <button
            className={`icon-btn${showFindReplace ? ' active' : ''}`}
            data-tip="查找和替换（⌘/Ctrl+F）"
            onClick={() => setShowFindReplace((value) => !value)}
          >
            <Icon name="search" />
          </button>
          <button
            className={`icon-btn${showVersionHistory ? ' active' : ''}`}
            data-tip="版本历史"
            onClick={() => { setShowOutline(false); setShowVersionHistory((value) => !value) }}
          >
            <Icon name="undo" />
          </button>

          <span className="workspace-mode-badge"><Icon name="doc" size={13} />文档</span>

          {/* 设置统一使用中央分类窗口。 */}
          <button className={`icon-btn${showSettings ? ' active' : ''}`} data-tip="设置" onClick={(e) => { e.stopPropagation(); closeAllMenus(); setShowSettings(true) }}>
            <Icon name="settings" />
          </button>

          {/* 页边距（左右宽距）——已迁移到正文上方标尺，点击标尺弹出阈值切换 */}

          {/* 大纲面板开关（状态栏已有同功能入口，顶栏不再重复） */}


          {activeDoc && (
            <div className="menu-wrap">
              <button className="btn" onClick={(e) => { e.stopPropagation(); closeAllMenus(); setShowExportMenu(!showExportMenu) }}>
                <Icon name="download" size={15} />导出
              </button>
              {showExportMenu && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  <button className="menu-item" onClick={() => doExport('pdf')}>
                    <Icon name="download" size={15} />PDF (.pdf)
                  </button>
                  <button className="menu-item" onClick={() => doExport('docx')}>
                    <Icon name="doc" size={15} />DOCX (.docx)
                  </button>
                  <button className="menu-item" onClick={() => doExport('epub')}>
                    <Icon name="doc" size={15} />EPUB (.epub)
                  </button>
                  <button className="menu-item" onClick={() => doExport('md')}>
                    <Icon name="doc" size={15} />Markdown (.md)
                  </button>
                  <button className="menu-item" onClick={() => doExport('html')}>
                    <Icon name="doc" size={15} />网页 (.html)
                  </button>
                  <button className="menu-item" onClick={() => doExport('txt')}>
                    <Icon name="doc" size={15} />纯文本 (.txt)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 主体 */}
      <div className="body">
        <Sidebar
          docs={docs}
          groups={groups}
          activeId={activeId}
          collapsed={sidebarCollapsed}
          headings={headings}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
          onMoveDoc={handleMoveDoc}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onJumpHeading={jumpToHeading}
          treeOpen={treeOpen}
          editingGroupId={editingGroupId}
          onCommitGroupName={commitGroupName}
          onRenameDoc={doRenameDoc}
          onSetHeadingLevel={setHeadingsLevel}
          onDragExport={handleDragExport}
          onReorderGroups={handleReorderGroups}
          onOpenFiles={handleOpenFiles}
          onTogglePin={handleTogglePin}
          onToggleGroupPin={handleToggleGroupPin}
        />

        <main
          className="main"
          data-workspace="document"
          ref={mainRef}
          style={{ '--doc-zoom': zoom }}
        >
          {activeDoc ? (
            <div className="main-col">
              <Toolbar editor={editor} onAi={openAi} />
              {showFindReplace && (
                <FindReplace editor={editor} onClose={() => setShowFindReplace(false)} />
              )}
              {/* key 保证切换文档时编辑器重新初始化 */}
              <Editor
                key={activeDoc.id}
                doc={activeDoc}
                onChange={handleContentChange}
                onStats={setStats}
                onHeadings={setHeadings}
                onReady={setEditor}
                onAi={openAi}
                onSelection={setSelectedChars}
                onSelectionRange={(range) => { lastSelectionRef.current = range }}
                aiSelection={aiPrompt?.selection || null}
                aiInline={aiInline}
                onResolveInline={() => setAiInline(null)}
              />
              <div className="statusbar">
                <span>{stats.words} 词</span>
                <span>{stats.chars} 字符</span>
                {selectedChars > 0 && <span className="statusbar-selected">已选 {selectedChars} 字符</span>}
                <div className="right">
                  <div className="menu-wrap zoom-wrap" ref={zoomAnchorRef}>
                    <button
                      className="statusbar-link zoom-main"
                      title="点击恢复 100%；⌘/Ctrl + 滚轮可微调"
                      onClick={() => setZoom(1)}
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      className="zoom-arrow"
                      title="选择缩放比例"
                      onClick={(e) => { e.stopPropagation(); closeAllMenus(); setZoomMenuOpen(!zoomMenuOpen) }}
                    >
                      <Icon name="chevronDown" size={10} />
                    </button>
                    {zoomMenuOpen && (
                      <div className="menu zoom-menu" style={zoomMenuPos || undefined} onClick={(e) => e.stopPropagation()}>
                        {[25, 50, 75, 100, 125, 150, 175, 200].map((v) => (
                          <button
                            key={v}
                            className={`menu-item${Math.round(zoom * 100) === v ? ' active' : ''}`}
                            onClick={() => { setZoom(v / 100); setZoomMenuOpen(false) }}
                          >
                            <span>{v}%</span>
                            {Math.round(zoom * 100) === v && <span className="menu-item-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className={`statusbar-link${showOutline ? ' active' : ''}`}
                    onClick={() => { setShowVersionHistory(false); setShowOutline(!showOutline) }}
                  >
                    大纲 {headings.length ? `(${headings.length})` : ''}
                  </button>
                  <span>自动保存 · 本地</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="welcome">
              <div className="big-icon"><Icon name="doc" size={64} /></div>
              <h2>还没有文档</h2>
              <button className="btn btn-primary" onClick={() => handleCreate()}>
                <Icon name="plus" size={15} />创建第一篇文档
              </button>
            </div>
          )}
          {showVersionHistory && activeDoc && (
            <VersionHistory
              doc={activeDoc}
              onRestore={handleRestoreVersion}
              onClose={() => setShowVersionHistory(false)}
            />
          )}
          {/* AI 改写浮动输入框（选中处上方/顶栏下方，不遮挡选中文字） */}
          {aiPrompt && (
            <AiPrompt
              editor={aiPrompt.editor}
              selection={aiPrompt.selection}
              pos={aiPrompt.pos}
              onClose={() => setAiPrompt(null)}
              onInlineDiff={handleInlineDiff}
            />
          )}
          {/* AI 内联 diff 接受卡片（Editor 内渲染，这里只传状态） */}
          {activeDoc && showOutline && (
            <Outline
              key={activeDoc.id}
              headings={headings}
              editor={editor}
              activeIndex={activeHeadingIdx}
              onJump={handleOutlineJump}
              onClose={() => setShowOutline(false)}
            />
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          themePref={themePref}
          setThemePref={setThemePref}
          themes={THEMES}
          themeGroups={THEME_GROUPS}
          theme={theme}
          lightKey={lightKey}
          darkKey={darkKey}
          setLightKey={setLightKey}
          setDarkKey={setDarkKey}
        />
      )}

      {/* 模态框 */}
      {modal?.type === 'delete' && (
        <div className="modal-mask" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>删除文档</h3>
            <p>确定删除「{modal.doc.title || '无标题文档'}」吗？此操作无法撤销。</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal(null)}>取消</button>
              <button className="btn btn-danger" onClick={modal.confirm}>删除</button>
            </div>
          </div>
        </div>
      )}
      {modal?.type === 'deleteGroup' && (
        <div className="modal-mask" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>删除文件夹</h3>
            <p>确定删除「{modal.group.name}」吗？组内文档会移到未分组，文档本身不会删除。</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal(null)}>取消</button>
              <button className="btn btn-danger" onClick={modal.confirm}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
