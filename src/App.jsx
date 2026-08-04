import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoUrl from './assets/logo.svg'
import Sidebar from './components/Sidebar.jsx'
import Toolbar from './components/Toolbar.jsx'
import Editor from './components/Editor.jsx'
import Outline from './components/Outline.jsx'
import AiPanel from './components/AiPanel.jsx'
import { Icon } from './components/Icons.jsx'
import {
  loadDocs, saveDocs, loadActiveId, saveActiveId, createDoc,
  loadTheme, saveTheme, stripHtml, firstLineTitle,
  loadGroups, saveGroups, createGroup,
} from './lib/storage.js'
import { exportHtml, exportMarkdown, exportText } from './lib/exporter.js'
import { scrollToHeadingByIndex } from './lib/headings.js'

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    saveTheme(themePref)
  }, [themePref])

  // ---------- 主题色 ----------
  const ACCENTS = [
    ['blue', '蓝', '#4f6ef7'],
    ['purple', '紫', '#8b5cf6'],
    ['green', '绿', '#10b981'],
    ['orange', '橙', '#f59e0b'],
    ['pink', '粉', '#ec4899'],
  ]
  const [accent, setAccent] = useState(() => {
    const saved = localStorage.getItem('inkdocs.accent')
    return ACCENTS.some(([k]) => k === saved) ? saved : 'blue'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    localStorage.setItem('inkdocs.accent', accent)
  }, [accent])

  // ---------- 页面背景色（深浅模式各自适配） ----------
  // [key, 名称, 浅色值, 深色值]
  const PAGE_COLORS = [
    ['white', '白', '#ffffff', '#16191f'],
    ['cream', '米黄', '#faf5e9', '#211e15'],
    ['sunny', '浅黄', '#fdf6dd', '#232012'],
    ['mint', '浅绿', '#e9f6ec', '#14211a'],
    ['sky', '浅蓝', '#e8f2fb', '#131e29'],
    ['lavender', '浅紫', '#f3eefb', '#1c1826'],
    ['stone', '浅灰', '#f1f2f4', '#1b1d21'],
  ]
  const [pageColor, setPageColor] = useState(() => {
    const saved = localStorage.getItem('inkdocs.pageColor')
    return PAGE_COLORS.some(([k]) => k === saved) ? saved : 'white'
  })
  useEffect(() => {
    localStorage.setItem('inkdocs.pageColor', pageColor)
  }, [pageColor])
  const pageBgValue =
    PAGE_COLORS.find(([k]) => k === pageColor)?.[theme === 'dark' ? 3 : 2] || '#ffffff'

  const themeIcon = themePref === 'system' ? 'monitor' : themePref === 'dark' ? 'sun' : 'moon'

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

  // ---------- 页边距（左右宽距） ----------
  const PADS = { narrow: ['窄', 40], normal: ['常规', 72], wide: ['宽', 104] }
  const [pagePad, setPagePad] = useState(() => {
    const saved = localStorage.getItem('inkdocs.pagePad')
    return PADS[saved] ? saved : 'normal'
  })
  useEffect(() => {
    localStorage.setItem('inkdocs.pagePad', pagePad)
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editor, setEditor] = useState(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
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
  const [aiOpen, setAiOpen] = useState(false)
  const aiSelectionRef = useRef(null)

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

  const handleRename = (doc) => setModal({ type: 'rename', doc })

  const doRename = (name) => {
    persist(docs.map((d) => (d.id === modal.doc.id ? { ...d, title: name || '无标题文档', updatedAt: Date.now() } : d)))
    setModal(null)
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

  // ---------- AI ----------
  const openAi = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    aiSelectionRef.current = from !== to ? { from, to } : null
    setAiOpen(true)
  }

  // ---------- 导出 ----------
  const doExport = (kind) => {
    if (!activeDoc) return
    const title = activeDoc.title || '无标题文档'
    if (kind === 'html') exportHtml(title, activeDoc.content)
    else if (kind === 'md') exportMarkdown(title, activeDoc.content)
    else if (kind === 'txt') exportText(title, stripHtml(activeDoc.content))
    setShowExportMenu(false)
  }

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!showExportMenu && !showThemeMenu) return
    const close = () => { setShowExportMenu(false); setShowThemeMenu(false) }
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [showExportMenu, showThemeMenu])

  // 大纲点击跳转：立即高亮目标标题，并短暂抑制滚动重算
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
      const els = document.querySelectorAll('.editor-content h1, .editor-content h2, .editor-content h3')
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
    <div className="app">
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

          {/* 纸张尺寸 */}
          <select
            className="tb-select paper-select"
            value={paper}
            onChange={(e) => setPaper(e.target.value)}
            title="纸张尺寸"
          >
            {Object.entries(PAPER).map(([k, [label]]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>

          {/* 分页样式（仅 A4/B5 时显示） */}
          {paper !== 'wide' && (
            <select
              className="tb-select paper-select"
              value={breakStyle}
              onChange={(e) => setBreakStyle(e.target.value)}
              title="分页样式"
            >
              <option value="dashed">虚线分页</option>
              <option value="split">分离页面</option>
            </select>
          )}

          {/* 页边距（左右宽距） */}
          <select
            className="tb-select paper-select"
            value={pagePad}
            onChange={(e) => setPagePad(e.target.value)}
            title="页边距"
          >
            {Object.entries(PADS).map(([k, [label]]) => (
              <option key={k} value={k}>{label}边距</option>
            ))}
          </select>

          {/* 大纲面板开关 */}
          {activeDoc && (
            <button
              className={`icon-btn${showOutline ? ' active' : ''}`}
              data-tip="文档大纲"
              onClick={() => setShowOutline(!showOutline)}
            >
              <Icon name="outline" />
            </button>
          )}

          {activeDoc && (
            <div className="menu-wrap">
              <button className="btn" onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu) }}>
                <Icon name="download" size={15} /> 导出
              </button>
              {showExportMenu && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  <button className="menu-item" onClick={() => doExport('md')}>
                    <Icon name="doc" size={15} /> Markdown (.md)
                  </button>
                  <button className="menu-item" onClick={() => doExport('html')}>
                    <Icon name="doc" size={15} /> 网页 (.html)
                  </button>
                  <button className="menu-item" onClick={() => doExport('txt')}>
                    <Icon name="doc" size={15} /> 纯文本 (.txt)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 主题：浅色 / 深色 / 跟随系统 */}
          <div className="menu-wrap">
            <button
              className="icon-btn"
              data-tip="主题模式"
              onClick={(e) => { e.stopPropagation(); setShowThemeMenu(!showThemeMenu); setShowExportMenu(false) }}
            >
              <Icon name={themeIcon} />
            </button>
            {showThemeMenu && (
              <div className="menu" onClick={(e) => e.stopPropagation()}>
                {[
                  ['light', '浅色', 'sun'],
                  ['dark', '深色', 'moon'],
                  ['system', '跟随系统', 'monitor'],
                ].map(([v, label, ic]) => (
                  <button
                    key={v}
                    className={`menu-item${themePref === v ? ' active' : ''}`}
                    onClick={() => { setThemePref(v); setShowThemeMenu(false) }}
                  >
                    <Icon name={ic} size={15} />
                    <span>{label}</span>
                    {themePref === v && <span className="menu-item-check">✓</span>}
                  </button>
                ))}
                <div className="menu-sep" />
                <div className="accent-row">
                  {ACCENTS.map(([k, label, color]) => (
                    <button
                      key={k}
                      className={`accent-dot${accent === k ? ' active' : ''}`}
                      style={{ background: color }}
                      data-tip={label}
                      onClick={() => setAccent(k)}
                    />
                  ))}
                </div>
                <div className="pagecolor-row">
                  <span className="pagecolor-label">页面颜色</span>
                  {PAGE_COLORS.map(([k, label, light]) => (
                    <button
                      key={k}
                      className={`pagecolor-dot${pageColor === k ? ' active' : ''}`}
                      style={{ background: light }}
                      data-tip={label}
                      onClick={() => setPageColor(k)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
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
          onRename={handleRename}
          onDelete={handleDelete}
          onMoveDoc={handleMoveDoc}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onJumpHeading={jumpToHeading}
          treeOpen={treeOpen}
          editingGroupId={editingGroupId}
          onCommitGroupName={commitGroupName}
        />

        <main className="main" ref={mainRef} style={{ '--doc-zoom': zoom, '--page-width': `${PAPER[paper]?.[1] ?? 880}px`, '--page-h': `${PAPER[paper]?.[2] || 0}px`, '--page-pad': `${PADS[pagePad]?.[1] ?? 72}px`, '--page-bg': pageBgValue }}>
          {activeDoc ? (
            <div className="main-col">
              <Toolbar editor={editor} onAi={openAi} />
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
              />
              <div className="statusbar">
                <span>{stats.words} 词</span>
                <span>{stats.chars} 字符</span>
                <div className="right">
                  <button
                    className="statusbar-link"
                    title="⌘/Ctrl + 滚轮可调节字号，点击重置"
                    onClick={() => setZoom(1)}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
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
                <Icon name="plus" size={15} /> 创建第一篇文档
              </button>
            </div>
          )}
          {/* AI 面板：与正文同层平级显示，便于对照修改 */}
          {aiOpen && activeDoc && (
            <AiPanel
              editor={editor}
              selection={aiSelectionRef.current}
              onClose={() => setAiOpen(false)}
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
      {modal?.type === 'rename' && (
        <RenameModal doc={modal.doc} onConfirm={doRename} onCancel={() => setModal(null)} />
      )}
    </div>
  )
}

function RenameModal({ doc, onConfirm, onCancel }) {
  // 默认标题时自动预填正文首行内容
  const initial = doc.title && doc.title !== '无标题文档'
    ? doc.title
    : firstLineTitle(doc.content) || ''
  const [name, setName] = useState(initial)
  const inputRef = useRef(null)
  useEffect(() => inputRef.current?.select(), [])
  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>重命名文档</h3>
        <input
          ref={inputRef}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(name) }}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>确定</button>
        </div>
      </div>
    </div>
  )
}
