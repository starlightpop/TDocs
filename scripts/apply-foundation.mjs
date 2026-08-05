import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, content) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function replaceOnce(content, search, replacement, label) {
  const next = typeof search === 'string'
    ? content.replace(search, replacement)
    : content.replace(search, replacement)
  if (next === content) throw new Error(`未找到待修改片段：${label}`)
  return next
}

let main = read('src/main.jsx')
if (!main.includes("import './design-system.css'")) {
  main = replaceOnce(main, "import './theme.css'\nimport './app.css'", "import './theme.css'\nimport './app.css'\nimport './design-system.css'", 'main.jsx 设计系统导入')
  write('src/main.jsx', main)
}

let app = read('src/App.jsx')
if (!app.includes("from './lib/viewModes.js'")) {
  app = replaceOnce(
    app,
    "import { renderMarkdown } from './lib/markdown.js'",
    "import { renderMarkdown } from './lib/markdown.js'\nimport { PAPER_PRESETS as PAPER, normalizePaper, resolvePageSize, viewModeForPaper } from './lib/viewModes.js'",
    'App.jsx 引入视图模式配置',
  )

  app = replaceOnce(
    app,
    /  \/\/ ---------- 纸张尺寸（宽屏不分页；A4\/B5 按 Word 式分页显示） ----------\n  const PAPER = \{[\s\S]*?  const \[paper, setPaper\] = useState\(\(\) => \{\n    const saved = localStorage\.getItem\('inkdocs\.paper'\)\n    return PAPER\[saved\] \? saved : 'wide'\n  \}\)/,
    `  // ---------- 工作模式：文档（无限画布）/ 页面（Word/WPS 式纸张） ----------
  const [paper, setPaper] = useState(() => normalizePaper(localStorage.getItem('inkdocs.paper')))
  const viewMode = viewModeForPaper(paper)
  useEffect(() => {
    document.documentElement.setAttribute('data-view-mode', viewMode)
  }, [viewMode])`,
    'App.jsx 视图模式状态',
  )

  app = replaceOnce(
    app,
    /  const \[pageSize, setPageSize\] = useState\(\(\) => \{[\s\S]*?  \}, \[paper\]\)/,
    `  const [pageSize, setPageSize] = useState(() => {
    const available = (window.innerWidth - 312) || 968
    return resolvePageSize(paper, available)
  })
  useEffect(() => {
    const calc = () => {
      const available = (mainRef.current?.clientWidth || 1040) - 48
      setPageSize(resolvePageSize(paper, available))
    }
    calc()
    let timer = null
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(calc, 120)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(timer)
    }
  }, [paper])`,
    'App.jsx 页面尺寸计算',
  )

  app = app
    .replace('宽屏视图 / A4 / B5 纸张', '文档模式 / 页面模式')
    .replace('<div className="settings-label">视图</div>', '<div className="settings-label">工作模式</div>')
    .replace('<span>宽屏（不分页）</span>', '<span>文档模式（无限画布）</span>')
    .replace('<div className="settings-label">纸张</div>', '<div className="settings-label">页面模式</div>')

  app = replaceOnce(
    app,
    /  const handleInlineDiff = \(\{ oldHtml, newHtml \}\) => \{[\s\S]*?\n  \}\n\n  \/\/ ---------- 导出 ----------/,
    `  const handleInlineDiff = ({ oldHtml, newHtml, range }) => {
    if (!editor) return
    const fallback = editor.state.selection
    const from = Number.isInteger(range?.from) ? range.from : fallback.from
    const to = Number.isInteger(range?.to) ? range.to : fallback.to
    if (from >= to || to > editor.state.doc.content.size) return
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    const oldText = stripHtml(oldHtml).replace(/\\s+/g, ' ').trim()
    const diffHtml = \`<span class="ai-inline-old">\${esc(oldText)}</span><span class="ai-inline-new">\${newHtml}</span>\`
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

  // ---------- 导出 ----------`,
    'App.jsx AI 固定选区',
  )

  write('src/App.jsx', app)
}

let aiPrompt = read('src/components/AiPrompt.jsx')
if (!aiPrompt.includes('ai-quick-actions')) {
  aiPrompt = replaceOnce(
    aiPrompt,
    'onInlineDiff?.({ oldHtml: selectionHtml, newHtml })',
    'onInlineDiff?.({ oldHtml: selectionHtml, newHtml, range: { ...selection } })',
    'AiPrompt 固定原始选区',
  )
  aiPrompt = replaceOnce(
    aiPrompt,
    `        <>\n          <textarea`,
    `        <>
          <div className="ai-quick-actions" aria-label="常用 AI 指令">
            {[
              ['润色', '润色这段文字，保持原意和事实不变，使表达更自然。'],
              ['精简', '压缩这段文字，删除重复和空泛表达，保留关键信息。'],
              ['扩写', '在不虚构事实的前提下扩写，补足必要细节和衔接。'],
              ['正式', '改成清晰、克制、专业的正式书面表达。'],
              ['口语', '改成自然、顺畅、像真人交流的口语表达。'],
            ].map(([label, prompt]) => (
              <button key={label} className="ai-quick-action" type="button" onClick={() => setText(prompt)}>
                {label}
              </button>
            ))}
          </div>
          <textarea`,
    'AiPrompt 快捷指令',
  )
  write('src/components/AiPrompt.jsx', aiPrompt)
}

let editor = read('src/components/Editor.jsx')
if (!editor.includes('reflowRunRef')) {
  editor = replaceOnce(
    editor,
    '      // update 返回 true：复用 DOM，避免每次 transaction 重建\n      return { dom: wrap, contentDOM: pageEl, update: () => true }',
    `      let currentNode = null
      return {
        dom: wrap,
        contentDOM: pageEl,
        update: (nextNode) => {
          if (nextNode.type.name !== 'page') return false
          currentNode = nextNode
          return true
        },
        destroy: () => { currentNode = null },
      }`,
    'Page NodeView 更新校验',
  )

  editor = replaceOnce(
    editor,
    '  const lastPairsRef = useRef(\'\')',
    `  const lastPairsRef = useRef('')
  const reflowRafRef = useRef(0)
  const reflowRunRef = useRef(0)`,
    '分页调度引用',
  )

  editor = replaceOnce(
    editor,
    `    view.dispatch(tr)
    return true
  }

  // paged 切换：结构转换 + 重排`,
    `    view.dispatch(tr)
    return true
  }

  // 每一帧只执行一次分页事务，等待 DOM 完成布局后再测量下一页。
  // 旧实现使用同步 while 连续 dispatch，后续测量读取的是旧 DOM，容易产生空页、卡顿和错误分页。
  const runReflow = () => {
    cancelAnimationFrame(reflowRafRef.current)
    const runId = ++reflowRunRef.current
    let steps = 0
    const step = () => {
      if (runId !== reflowRunRef.current || !editor || !paged) return
      const changed = reflow()
      steps += 1
      if (changed && steps < 120) {
        reflowRafRef.current = requestAnimationFrame(step)
      }
    }
    reflowRafRef.current = requestAnimationFrame(step)
  }

  // paged 切换：结构转换 + 重排`,
    '分页逐帧调度函数',
  )

  editor = replaceOnce(
    editor,
    `      // 内容变化后按页高重排（rAF 等 DOM 渲染）
      requestAnimationFrame(() => {
        let guard = 0
        while (reflow() && guard++ < 60) { /* 迭代到稳定 */ }
      })`,
    `      // 等待页面 DOM 布局后逐帧重排
      runReflow()`,
    '分页切换重排',
  )

  editor = replaceOnce(
    editor,
    /  useEffect\(\(\) => \{\n    if \(!editor \|\| !paged\) return\n    let raf = 0[\s\S]*?  \}, \[editor, paged, pageH\]\)/,
    `  useEffect(() => {
    if (!editor || !paged) return
    const schedule = () => runReflow()
    editor.on('transaction', schedule)
    editor.on('update', schedule)
    return () => {
      editor.off('transaction', schedule)
      editor.off('update', schedule)
      reflowRunRef.current += 1
      cancelAnimationFrame(reflowRafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, paged, pageH])`,
    '编辑时分页调度',
  )

  write('src/components/Editor.jsx', editor)
}

const pkg = JSON.parse(read('package.json'))
pkg.scripts = {
  ...pkg.scripts,
  test: 'node --test tests/*.test.mjs',
  'test:ci': 'npm run test && npm run build',
}
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

console.log('TDocs foundation refactor applied successfully.')
