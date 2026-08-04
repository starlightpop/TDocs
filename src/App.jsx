import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoUrl from './assets/logo.svg'
import Sidebar from './components/Sidebar.jsx'
import Toolbar from './components/Toolbar.jsx'
import Editor from './components/Editor.jsx'
import Outline from './components/Outline.jsx'
import AiPanel from './components/AiPanel.jsx'
import AiPrompt from './components/AiPrompt.jsx'
import { Icon } from './components/Icons.jsx'
import {
  loadDocs, saveDocs, loadActiveId, saveActiveId, createDoc,
  loadTheme, saveTheme, stripHtml,
  loadGroups, saveGroups, createGroup,
} from './lib/storage.js'
import { exportHtml, exportMarkdown, exportText, exportDocx, exportEpub } from './lib/exporter.js'
import { scrollToHeadingByIndex, setHeadingsLevel } from './lib/headings.js'
import { renderMarkdown } from './lib/markdown.js'

const WELCOME_HTML = `
<h1>欢迎使用 TDocs ✨</h1>
<p>一个简洁、快速、支持<strong>深色模式</strong>的本地文档工具。</p>
<h2>你可以做什么</h2>
<ul>
  <li>富文本排版：<strong>加粗</strong>、<em>斜体</em>、<u>下划线</u>、<s>删除线</s>、<mark data-color="#ffe58a" style="background-color:#ffe58a">高亮</mark></li>
  <li>标题、列表、任务清单、引用、代码块</li>
  <li>插入表格、图片、链接</li>
  <li>一键切换深色 / 浅色模式 🌙</li>
</ul>
<h2>快捷键</h2>
<table><tbody>
<tr><th><p>操作</p></th><th><p>快捷键</p></th></tr>
<tr><td><p>加粗</p></td><td><p>⌘ / Ctrl + B</p></td></tr>
<tr><td><p>斜体</p></td><td><p>⌘ / Ctrl + I</p></td></tr>
<tr><td><p>撤销 / 重做</p></td><td><p>⌘ / Ctrl + Z ⇧Z</p></td></tr>
</tbody></table>
<blockquote><p>所有内容自动保存在浏览器本地，无需登录、无需联网。</p></blockquote>
`

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
  // 每套定义整套界面 + 纸张配色，不再是单独的“页面颜色”
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

  // ---------- 纸张尺寸（宽屏不分页；A4/B5 按 Word 式分页显示） ----------
  const PAPER = {
    wide: ['宽屏', 880, 0],
    a4: ['A4', 794, 1123],
    b5: ['B5', 665, 937],
  }
  const [paper, setPaper] = useState(() => {
    const saved = localStorage.getItem('inkdocs.paper')
    return PAPER[saved] ? saved : 'wide'
  })
  // 分页样式：dashed=虚线分页，split=分离页面（WPS 式每页独立）
  const [breakStyle, setBreakStyle] = useState(() => {
    const saved = localStorage.getItem('inkdocs.breakStyle')
    return saved === 'split' ? 'split' : 'dashed'
  })
  useEffect(() => {
    localStorage.setItem('inkdocs.paper', paper)
  }, [paper])
  useEffect(() => {
    localStorage.setItem('inkdocs.breakStyle', breakStyle)
  }, [breakStyle])
  // 页码标签样式：pair=第 1 页 / 第 2 页（上下页），total=第 1 页 / 共 12 页（当前页/总页数）
  const [pageLabelStyle, setPageLabelStyle] = useState(() => {
    const saved = localStorage.getItem('inkdocs.pageLabelStyle')
    return saved === 'pair' ? 'pair' : 'total'
  })
  useEffect(() => {
    localStorage.setItem('inkdocs.pageLabelStyle', pageLabelStyle)
  }, [pageLabelStyle])

  // ---------- 页边距（左右宽距）：数值型，可拖标尺微调，也可点击预设档位 ----------
  const PADS = { narrow: ['窄', 40], normal: ['常规', 72], wide: ['宽', 104] }
  const [pagePad, setPagePad] = useState(() => {
    const saved = localStorage.getItem('inkdocs.pagePad')
    // 兼容旧版档位 key
    if (PADS[saved]) return PADS[saved][1]
    const n = Number(saved)
    return n >= 24 && n <= 160 ? n : 72
  })
  useEffect(() => {
    localStorage.setItem('inkdocs.pagePad', String(pagePad))
  }, [pagePad])

  // ---------- 文档 ----------
  const [docs, setDocs] = useState(() => {
    const existing = loadDocs()
    if (existing.length) return existing
    return [createDoc('欢迎使用 TDocs', WELCOME_HTML)]
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
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editor, setEditor] = useState(null)
  const [rulerOpen, setRulerOpen] = useState(false)
  const rulerRef = useRef(null)
  const rulerDownRef = useRef(null)

  // 拖动标尺灰白交界：连续调整页边距（24~160px）
  const startRulerDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const ruler = rulerRef.current
    if (!ruler) return
    const startX = e.clientX
    const startPad = pagePad
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const next = Math.min(160, Math.max(24, startPad + dx))
      setPagePad(Math.round(next))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
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
  const mainRef = useRef(null)

  // ---------- AI ----------
  const [aiPrompt, setAiPrompt] = useState(null) // {editor, selection, pos}
  const [aiConfigOpen, setAiConfigOpen] = useState(false)

  // 大纲点击跳转后的滚动抑制，避免高亮被滚回上一个标题
  const jumpSuppressRef = useRef(0)

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId])

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
    const doc = createDoc()
    doc.group = group || activeDoc?.group || ''
    persist([doc, ...docs])
    setActiveId(doc.id)
  }

  const handleSelect = (id) => {
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
        const next = prev.map((d) => {
          if (d.id !== activeId) return d
          return { ...d, content: html, updatedAt: Date.now() }
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
    persist(docs.map((d) => (d.id === doc.id ? { ...d, title: name?.trim() || '无标题文档', updatedAt: Date.now() } : d)))
  }

  // ---------- 分组操作 ----------
  const persistGroups = (next) => {
    setGroups(next)
    saveGroups(next)
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
      return { ...createDoc(title), content, group: activeDoc?.group || '' }
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
    const selection = from !== to ? { from, to } : null
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

  // 点击外部关闭缩放菜单 / 设置菜单
  useEffect(() => {
    if (!zoomMenuOpen && !showSettings) return
    const close = () => { setZoomMenuOpen(false); setShowSettings(false) }
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [zoomMenuOpen, showSettings])

  // 点击外部关闭标尺菜单
  useEffect(() => {
    if (!rulerOpen) return
    const close = () => setRulerOpen(false)
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [rulerOpen])

  // 点击外部关闭顶栏菜单（导出 / 页面 / 设置）
  useEffect(() => {
    if (!showExportMenu && !showPageMenu && !showSettings) return
    const close = () => { setShowExportMenu(false); setShowPageMenu(false); setShowSettings(false) }
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [showExportMenu, showPageMenu, showSettings])

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
      <header className="topbar">
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

          {/* 页面：宽屏 / A4 / B5（自定义菜单，与其余下拉风格统一） */}
          <div className="menu-wrap">
            <button
              className="tb-block-btn tb-page-btn"
              title="宽屏视图 / A4 / B5 纸张"
              onClick={(e) => { e.stopPropagation(); setShowExportMenu(false); setShowSettings(false); setShowPageMenu(!showPageMenu) }}
            >
              {PAPER[paper][0]}
              <Icon name="chevronDown" size={13} />
            </button>
            {showPageMenu && (
              <div className="menu page-menu" onClick={(e) => e.stopPropagation()}>
                <div className="settings-label">视图</div>
                <button
                  className={`menu-item${paper === 'wide' ? ' active' : ''}`}
                  onClick={() => { setPaper('wide'); setShowPageMenu(false) }}
                >
                  <span>宽屏（不分页）</span>
                  {paper === 'wide' && <span className="menu-item-check">✓</span>}
                </button>
                <div className="menu-sep" />
                <div className="settings-label">纸张</div>
                <button
                  className={`menu-item${paper === 'a4' ? ' active' : ''}`}
                  onClick={() => { setPaper('a4'); setShowPageMenu(false) }}
                >
                  <span>A4</span>
                  {paper === 'a4' && <span className="menu-item-check">✓</span>}
                </button>
                <button
                  className={`menu-item${paper === 'b5' ? ' active' : ''}`}
                  onClick={() => { setPaper('b5'); setShowPageMenu(false) }}
                >
                  <span>B5</span>
                  {paper === 'b5' && <span className="menu-item-check">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* 设置（⚙️）：主题 + 分页相关设置集中于此 */}
          <div className="menu-wrap">
            <button
              className="icon-btn"
              data-tip="设置"
              onClick={(e) => { e.stopPropagation(); setShowPageMenu(false); setShowExportMenu(false); setShowSettings(!showSettings) }}
            >
              <Icon name="settings" />
            </button>
            {showSettings && (
              <div className="menu settings-menu" onClick={(e) => e.stopPropagation()}>
                <div className="settings-label">明暗模式</div>
                <div className="settings-seg">
                  <button className={themePref === 'light' ? 'active' : ''} onClick={() => setThemePref('light')}>浅色</button>
                  <button className={themePref === 'dark' ? 'active' : ''} onClick={() => setThemePref('dark')}>深色</button>
                  <button className={themePref === 'system' ? 'active' : ''} title="跟随系统自动切换明暗" onClick={() => setThemePref('system')}>跟随系统</button>
                </div>
                <div className="settings-label">主题颜色</div>
                {THEME_GROUPS.map(([gname, keys]) => (
                  <div key={gname} className="theme-group">
                    <span className="theme-group-label">{gname}</span>
                    <div className="theme-row">
                      {keys.map((k) => {
                        const t = THEMES[k]
                        const cur = theme === 'dark' ? darkKey : lightKey
                        return (
                          <button
                            key={k}
                            className={`theme-dot${cur === k ? ' active' : ''}`}
                            style={{ background: t.colors['surface-2'], borderColor: t.accent }}
                            data-tip={t.name}
                            onClick={() => {
                              // 点击色卡立即切换：浅色系 → 浅色主题，深色系 → 深色主题
                              if (t.mode === 'dark') { setDarkKey(k); setThemePref('dark') }
                              else { setLightKey(k); setThemePref('light') }
                            }}
                          >
                            <span className="theme-dot-accent" style={{ background: t.accent }} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {paper !== 'wide' && <div className="menu-sep" />}
                {paper !== 'wide' && (
                  <>
                    <div className="settings-label">分页样式</div>
                    <div className="settings-seg">
                      <button className={breakStyle === 'dashed' ? 'active' : ''} title="页与页之间用虚线标记" onClick={() => setBreakStyle('dashed')}>虚线</button>
                      <button className={breakStyle === 'split' ? 'active' : ''} title="每页独立成块，页间灰带分开" onClick={() => setBreakStyle('split')}>分离</button>
                    </div>
                    <div className="settings-label">页码标签</div>
                    <div className="settings-seg">
                      <button className={pageLabelStyle === 'total' ? 'active' : ''} title="第 1 页 / 共 54 页" onClick={() => setPageLabelStyle('total')}>总数</button>
                      <button className={pageLabelStyle === 'pair' ? 'active' : ''} title="第 1 页 / 第 2 页" onClick={() => setPageLabelStyle('pair')}>相邻</button>
                    </div>
                  </>
                )}
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => { setShowSettings(false); setAiConfigOpen(true) }}
                >
                  <Icon name="sparkle" size={15} />
                  <span>AI 配置</span>
                </button>
              </div>
            )}
          </div>

          {/* 页边距（左右宽距）——已迁移到正文上方标尺，点击标尺弹出阈值切换 */}

          {/* 大纲面板开关（状态栏已有同功能入口，顶栏不再重复） */}


          {activeDoc && (
            <div className="menu-wrap">
              <button className="btn" onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu) }}>
                <Icon name="download" size={15} />导出
              </button>
              {showExportMenu && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  <button className="menu-item" onClick={() => doExport('pdf')}>
                    <Icon name="download" size={15} />PDF (.pdf)
                  </button>
                  <button className="menu-item" onClick={() => doExport('docx')}>
                    <Icon name="doc" size={15} />Word (.docx)
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
        />

        <main className="main" ref={mainRef} style={{ '--doc-zoom': zoom, '--page-width': `${PAPER[paper]?.[1] ?? 880}px`, '--page-h': `${PAPER[paper]?.[2] || 0}px`, '--page-pad': `${pagePad}px` }}>
          {activeDoc ? (
            <div className="main-col">
              <Toolbar editor={editor} onAi={openAi} />
              {/* 边距标尺（Word/WPS 式）：宽度与页面文字区对齐，可拖动灰白交界调边距，点击弹预设档位 */}
              <div
                className="ruler"
                ref={rulerRef}
                title="拖动标尺边缘调整页边距；点击弹出预设档位"
                onMouseDown={(e) => {
                  if (e.target.closest('.ruler-grip-l, .ruler-grip-r')) return
                  // 记录点击位置，避免拖动与弹菜单冲突
                  rulerDownRef.current = { x: e.clientX, y: e.clientY, open: rulerOpen }
                }}
                onClick={(e) => {
                  if (e.target.closest('.ruler-grip-l, .ruler-grip-r')) return
                  const d = rulerDownRef.current
                  if (d && (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4)) return
                  setRulerOpen(!rulerOpen)
                }}
              >
                <div className="ruler-track">
                  <div className="ruler-margin-l" style={{ width: `${pagePad}px` }} />
                  <div className="ruler-text" />
                  <div className="ruler-margin-r" style={{ width: `${pagePad}px` }} />
                </div>
                <div
                  className="ruler-grip-l"
                  style={{ left: `${pagePad}px` }}
                  onMouseDown={(e) => startRulerDrag(e)}
                />
                <div
                  className="ruler-grip-r"
                  style={{ right: `${pagePad}px` }}
                  onMouseDown={(e) => startRulerDrag(e)}
                />
                {rulerOpen && (
                  <div className="menu ruler-menu" onClick={(e) => e.stopPropagation()}>
                    {Object.entries(PADS).map(([k, [label, v]]) => (
                      <button
                        key={k}
                        className={`menu-item${pagePad === v ? ' active' : ''}`}
                        onClick={() => { setPagePad(v); setRulerOpen(false) }}
                      >
                        <span>{label}边距（{v}px）</span>
                        {pagePad === v && <span className="menu-item-check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* key 保证切换文档时编辑器重新初始化 */}
              <Editor
                key={activeDoc.id}
                doc={activeDoc}
                onChange={handleContentChange}
                onStats={setStats}
                onHeadings={setHeadings}
                onReady={setEditor}
                onAi={openAi}
                paged={paper !== 'wide'}
                pageH={PAPER[paper]?.[2] || 0}
                breakStyle={breakStyle}
                pageLabelStyle={pageLabelStyle}
                onSelection={setSelectedChars}
              />
              <div className="statusbar">
                <span>{stats.words} 词</span>
                <span>{stats.chars} 字符</span>
                {selectedChars > 0 && <span className="statusbar-selected">已选 {selectedChars} 字符</span>}
                <div className="right">
                  <div className="menu-wrap zoom-wrap">
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
                      onClick={(e) => { e.stopPropagation(); setZoomMenuOpen(!zoomMenuOpen) }}
                    >
                      <Icon name="chevronDown" size={10} />
                    </button>
                    {zoomMenuOpen && (
                      <div className="menu zoom-menu" onClick={(e) => e.stopPropagation()}>
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
                    onClick={() => setShowOutline(!showOutline)}
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
              <button className="btn btn-primary" onClick={handleCreate}>
                <Icon name="plus" size={15} />创建第一篇文档
              </button>
            </div>
          )}
          {/* AI 配置面板（只做配置与连接测试） */}
          {aiConfigOpen && (
            <AiPanel onClose={() => setAiConfigOpen(false)} />
          )}
          {/* AI 改写浮动输入框（选中处上方/顶栏下方，不遮挡选中文字） */}
          {aiPrompt && (
            <AiPrompt
              editor={aiPrompt.editor}
              selection={aiPrompt.selection}
              pos={aiPrompt.pos}
              onClose={() => setAiPrompt(null)}
              onOpenConfig={() => { setAiConfigOpen(true); setAiPrompt(null) }}
            />
          )}
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
