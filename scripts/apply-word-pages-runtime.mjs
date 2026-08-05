import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const file = (name) => path.join(root, name)
const read = (name) => fs.readFileSync(file(name), 'utf8')
const write = (name, value) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true })
  fs.writeFileSync(file(name), value)
}

function replaceOnce(source, search, replacement, label) {
  const next = source.replace(search, replacement)
  if (next === source) throw new Error(`未找到修改位置：${label}`)
  return next
}

function replaceBetween(source, start, end, replacement, label) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`未找到修改区间：${label}`)
  return source.slice(0, from) + replacement + source.slice(to)
}

write('src/lib/viewModes.js', `export const PAPER_PRESETS = Object.freeze({
  wide: Object.freeze(['文档', 880, 0]),
  // 96 CSS DPI：210 × 297 mm。100% 缩放时保持稳定版式，不再按窗口任意放大。
  a4: Object.freeze(['A4', 794, 1123]),
  // ISO B5：176 × 250 mm。
  b5: Object.freeze(['B5', 665, 945]),
})

export function normalizePaper(value) {
  return Object.hasOwn(PAPER_PRESETS, value) ? value : 'wide'
}

export function viewModeForPaper(paper) {
  return normalizePaper(paper) === 'wide' ? 'document' : 'page'
}

export function resolvePageSize(paper) {
  const normalized = normalizePaper(paper)
  const [, w, h] = PAPER_PRESETS[normalized]
  return { w, h }
}
`)

let app = read('src/App.jsx')
app = replaceBetween(
  app,
  '  // 分页模式页面尺寸：WPS 式“适应宽度”',
  '  // 分页样式：dashed=虚线分页',
  `  // 页面模式使用固定物理基准尺寸。缩放只改变整张纸的视觉比例，不改变排版容量。
  const pageSize = useMemo(() => resolvePageSize(paper), [paper])
`,
  '固定纸张尺寸',
)
app = replaceOnce(
  app,
  '  const rulerRef = useRef(null)\n  const rulerDownRef = useRef(null)',
  `  const rulerRef = useRef(null)
  const rulerDownRef = useRef(null)
  const zoomAnchorRef = useRef(null)
  const [zoomMenuPos, setZoomMenuPos] = useState(null)`,
  '缩放锚点状态',
)
app = replaceOnce(
  app,
  `    const startX = e.clientX
    const startPad = pagePad
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const next = Math.min(160, Math.max(24, startPad + dx))`,
  `    const startX = e.clientX
    const startPad = pagePad
    const scale = paper === 'wide' ? 1 : zoom
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale
      const next = Math.min(160, Math.max(24, startPad + dx))`,
  '标尺按页面缩放换算',
)
app = replaceOnce(
  app,
  `  useEffect(() => {
    localStorage.setItem('inkdocs.zoom', String(zoom))
  }, [zoom])`,
  `  useEffect(() => {
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
  }, [zoomMenuOpen, showOutline, sidebarCollapsed])`,
  '缩放菜单锚定逻辑',
)
app = replaceOnce(
  app,
  `<main className="main" ref={mainRef} style={{ '--doc-zoom': zoom, '--page-width': \`${pageSize.w}px\`, '--page-h': \`${pageSize.h}px\`, '--page-pad': \`${pagePad}px\` }}>`,
  `<main
          className="main"
          ref={mainRef}
          style={{
            '--doc-zoom': paper === 'wide' ? zoom : 1,
            '--page-width': \`${paper === 'wide' ? pageSize.w : Math.round(pageSize.w * zoom)}px\`,
            '--page-base-width': \`${pageSize.w}px\`,
            '--page-h': \`${pageSize.h}px\`,
            '--page-scale': paper === 'wide' ? 1 : zoom,
            '--page-pad': \`${pagePad}px\`,
          }}
        >`,
  '页面缩放变量',
)
app = app.replaceAll(
  'style={{ width: `${pagePad}px` }}',
  "style={{ width: `${Math.round(pagePad * (paper === 'wide' ? 1 : zoom))}px` }}",
)
app = replaceOnce(
  app,
  'style={{ left: `${pagePad}px` }}',
  "style={{ left: `${Math.round(pagePad * (paper === 'wide' ? 1 : zoom))}px` }}",
  '左标尺缩放',
)
app = replaceOnce(
  app,
  'style={{ right: `${pagePad}px` }}',
  "style={{ right: `${Math.round(pagePad * (paper === 'wide' ? 1 : zoom))}px` }}",
  '右标尺缩放',
)
app = replaceOnce(
  app,
  '                aiKeepSelection={!!aiPrompt}',
  '                aiSelection={aiPrompt?.selection || null}',
  '固定 AI 选区',
)
app = replaceOnce(
  app,
  '<div className="menu-wrap zoom-wrap">',
  '<div className="menu-wrap zoom-wrap" ref={zoomAnchorRef}>',
  '缩放按钮 ref',
)
app = replaceOnce(
  app,
  '<div className="menu zoom-menu" onClick={(e) => e.stopPropagation()}>',
  '<div className="menu zoom-menu" style={zoomMenuPos || undefined} onClick={(e) => e.stopPropagation()}>',
  '缩放菜单动态位置',
)
write('src/App.jsx', app)

let editor = read('src/components/Editor.jsx')
editor = replaceOnce(
  editor,
  "import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model'",
  "import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model'\nimport { canSplit } from '@tiptap/pm/transform'",
  '导入 canSplit',
)
editor = replaceOnce(
  editor,
  `  defining: true,
  parseHTML:`,
  `  defining: true,
  isolating: true,
  selectable: false,
  allowGapCursor: false,
  parseHTML:`,
  '禁止页间光标',
)
editor = replaceOnce(
  editor,
  `        update: (nextNode) => {
          if (nextNode.type.name !== 'page') return false
          currentNode = nextNode
          return true
        },
        destroy:`,
  `        update: (nextNode) => {
          if (nextNode.type.name !== 'page') return false
          currentNode = nextNode
          return true
        },
        // 页间距属于画布，不属于可编辑内容。
        stopEvent: (event) => event.target === wrap,
        destroy:`,
  '页 NodeView 阻止间隙事件',
)
editor = replaceOnce(
  editor,
  `      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'`,
  `      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'`,
  '行号不可编辑',
)
editor = replaceOnce(
  editor,
  `      const render = () => {
        gutter.textContent = (node.textContent || '').split('\\n').map((_, i) => i + 1).join('\\n')
      }`,
  `      const render = () => {
        const count = Math.max(1, ((node.textContent || '').match(/\\n/g)?.length || 0) + 1)
        gutter.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\\n')
      }`,
  '稳定代码行号',
)
editor = replaceOnce(
  editor,
  `export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, aiKeepSelection = false, aiInline = null, onResolveInline }) {`,
  `export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, aiSelection = null, aiInline = null, onResolveInline }) {`,
  'Editor AI 选区参数',
)
editor = replaceOnce(
  editor,
  `  const reflowRafRef = useRef(0)
  const reflowRunRef = useRef(0)`,
  `  const reflowRafRef = useRef(0)
  const reflowRunRef = useRef(0)
  const pagedRef = useRef(paged)
  pagedRef.current = paged`,
  '分页事件 ref',
)
editor = replaceOnce(
  editor,
  `        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用带行号的自定义 CodeBlock`,
  `        heading: { levels: [1, 2, 3, 4, 5, 6] },
        gapcursor: false,
        codeBlock: false, // 用带行号的自定义 CodeBlock`,
  '关闭 GapCursor',
)
editor = replaceOnce(
  editor,
  `    editorProps: {
      attributes: { class: 'editor-content' },
      handleDrop:`,
  `    editorProps: {
      attributes: { class: 'editor-content' },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          if (!pagedRef.current) return false
          const target = event.target instanceof Element ? event.target : event.target?.parentElement
          if (target?.closest?.('[data-page]')) return false
          event.preventDefault()
          return true
        },
      },
      handleDrop:`,
  '阻止页外点击',
)
const reflowBlock = `  // 溢出重排：按真实纸张内容区测量。文本块跨页时先在可见行末拆分，再移动尾部。
  const getPageContentBottom = (pageEl) => {
    const rect = pageEl.getBoundingClientRect()
    const scale = pageEl.offsetHeight ? rect.height / pageEl.offsetHeight : 1
    const paddingBottom = Number.parseFloat(getComputedStyle(pageEl).paddingBottom) || 0
    return rect.bottom - paddingBottom * scale
  }

  const findTextSplitPosition = (state, view, pageEl, child, childPos) => {
    const start = childPos + 1
    const end = start + child.content.size
    if (!child.isTextblock || end - start < 2) return null
    const limit = getPageContentBottom(pageEl) - 2
    let low = start + 1
    let high = end - 1
    let best = null
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const rect = view.coordsAtPos(mid)
      if (rect.bottom <= limit) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    if (!best) return null
    let candidate = best
    if (child.type.name === 'codeBlock') {
      const offset = Math.max(0, candidate - start)
      const prefix = child.textBetween(0, offset, '\\n', '\\n')
      const lineEnd = prefix.lastIndexOf('\\n')
      if (lineEnd > 0) candidate = start + lineEnd + 1
    }
    while (candidate > start && !canSplit(state.doc, candidate)) candidate -= 1
    if (candidate <= start || candidate >= end || !canSplit(state.doc, candidate)) return null
    return candidate
  }

  const reflow = () => {
    if (!editor || !paged) return false
    const { view, state } = editor
    let target = null
    state.doc.descendants((node, pos) => {
      if (target || node.type.name !== 'page') return
      const dom = view.nodeDOM(pos)
      if (!dom) return
      const pageEl = dom.nodeType === 1 && dom.matches('[data-page]') ? dom : dom.querySelector('[data-page]')
      if (!pageEl) return
      if (pageEl.scrollHeight - pageEl.clientHeight > 2) target = { node, pos, pageEl }
    })
    if (!target) return false

    const { node, pos, pageEl } = target
    const contentBottom = getPageContentBottom(pageEl)
    let offset = 0
    let firstOverflow = null
    node.forEach((child) => {
      const childPos = pos + 1 + offset
      const childDom = view.nodeDOM(childPos)
      const rect = childDom?.getBoundingClientRect?.()
      if (!firstOverflow && rect && rect.bottom > contentBottom + 1) {
        firstOverflow = { child, childPos, rect }
      }
      offset += child.nodeSize
    })

    if (firstOverflow?.child.isTextblock && firstOverflow.rect.top < contentBottom - 4) {
      const splitPos = findTextSplitPosition(state, view, pageEl, firstOverflow.child, firstOverflow.childPos)
      if (splitPos) {
        view.dispatch(state.tr.split(splitPos))
        return true
      }
    }

    if (node.childCount <= 1) return false
    const last = node.lastChild
    const lastFrom = pos + 1 + node.content.size - last.nodeSize
    const lastTo = lastFrom + last.nodeSize
    const frag = last.copy(last.content)
    let tr = state.tr.delete(lastFrom, lastTo)
    const pageSize = tr.doc.nodeAt(pos)?.nodeSize || 1
    const nextPos = pos + pageSize
    const after = tr.doc.nodeAt(nextPos)
    if (after?.type.name === 'page') {
      tr = tr.insert(nextPos + 1, frag)
    } else {
      tr = tr.insert(nextPos, state.schema.nodes.page.create(null, frag))
    }
    view.dispatch(tr)
    return true
  }
`
editor = replaceBetween(
  editor,
  '  // 溢出重排：每页内容超出页高时',
  '  // 每一帧只执行一次分页事务',
  reflowBlock,
  '分页重排算法',
)
editor = replaceOnce(
  editor,
  `  // AI 改写窗口打开时：保持选区高亮可见（编辑器失焦也不消失）
  useEffect(() => {
    if (!editor) return
    const decos = []
    if (aiKeepSelection) {
      const { from, to } = editor.state.selection
      if (from !== to) {
        decos.push(Decoration.inline(from, to, { class: 'ai-sel-highlight' }))
      }
    }
    editor.view.dispatch(editor.state.tr.setMeta(aiSelKey, decos.length ? decos : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiKeepSelection, editor])`,
  `  // AI 面板打开后使用请求发起时保存的范围，不受后续光标移动影响。
  useEffect(() => {
    if (!editor) return
    const max = editor.state.doc.content.size
    const from = Math.max(0, Math.min(max, Number(aiSelection?.from)))
    const to = Math.max(from, Math.min(max, Number(aiSelection?.to)))
    const decos = Number.isFinite(from) && Number.isFinite(to) && from < to
      ? [Decoration.inline(from, to, { class: 'ai-sel-highlight' })]
      : []
    editor.view.dispatch(editor.state.tr.setMeta(aiSelKey, decos.length ? decos : null))
  }, [aiSelection, editor])`,
  'AI 固定选区高亮',
)
editor = replaceOnce(
  editor,
  `        if (!editor || !content || content.contains(e.target)) return
        if (e.target.closest?.('.bubble-wrap, .ai-accept-card, .menu, .overlay')) return`,
  `        if (!editor || !content || content.contains(e.target)) return
        if (paged) return
        if (e.target.closest?.('.bubble-wrap, .ai-accept-card, .menu, .overlay')) return`,
  '分页模式不在画布放置光标',
)
write('src/components/Editor.jsx', editor)

let toolbar = read('src/components/Toolbar.jsx')
toolbar = toolbar.replace(
  "  const [runOutput, setRunOutput] = useState(null) // {text, ok, top, left}",
  "  const [runOutput, setRunOutput] = useState(null) // 本地运行状态与标准输出",
)
const runBlock = `  const getActiveCodeBlock = () => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)
      if (node.type.name === 'codeBlock') return { node, pos: $from.before(depth) }
    }
    return null
  }

  // 代码在 Electron 主进程的独立子进程中运行，标准输出和错误输出原样返回。
  const runCode = async () => {
    const active = getActiveCodeBlock()
    if (!active) return
    const selectedLanguage = editor.getAttributes('codeBlock').language || 'plaintext'
    const dom = editor.view.nodeDOM(active.pos)
    const rect = dom?.getBoundingClientRect?.()
    const width = 480
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect?.left || 180))
    const preferredTop = (rect?.bottom || 110) + 10
    const top = preferredTop + 230 < window.innerHeight
      ? preferredTop
      : Math.max(12, (rect?.top || 250) - 240)
    setRunOutput({ running: true, ok: true, stdout: '', stderr: '', language: selectedLanguage, top, left })
    if (!window.tdocs?.runCode) {
      setRunOutput({ running: false, ok: false, stdout: '', stderr: '代码运行仅在 TDocs 桌面应用中可用。', language: selectedLanguage, top, left })
      return
    }
    try {
      const result = await window.tdocs.runCode({ language: selectedLanguage, code: active.node.textContent })
      setRunOutput({ running: false, ...result, top, left })
    } catch (error) {
      setRunOutput({ running: false, ok: false, stdout: '', stderr: String(error?.message || error), language: selectedLanguage, top, left })
    }
  }
`
toolbar = replaceBetween(
  toolbar,
  '  // 运行代码块（JavaScript/纯文本可执行，其余语言提示）',
  '  const insertImage =',
  runBlock + '\n  const insertImage =',
  '本地代码运行入口',
)
toolbar = replaceOnce(
  toolbar,
  '<button className="tb-sup-sub tb-run-btn" title="运行代码（JavaScript/纯文本）" onClick={runCode}>▶</button>',
  '<button className="tb-sup-sub tb-run-btn" title="在本机运行当前代码块" disabled={runOutput?.running} onClick={runCode}>▶</button>',
  '运行按钮',
)
toolbar = replaceBetween(
  toolbar,
  '      {runOutput && (',
  '      <div className="divider" />',
  `      {runOutput && (
        <div className="code-terminal" style={{ top: runOutput.top, left: runOutput.left }}>
          <div className="code-terminal-head">
            <span className="code-terminal-dots"><i /><i /><i /></span>
            <span className="code-terminal-title">
              {runOutput.running ? '正在运行' : '运行结果'} · {CODE_LANGS.find(([value]) => value === runOutput.language)?.[1] || runOutput.language}
            </span>
            {!runOutput.running && (
              <span className={\`code-terminal-status\${runOutput.ok ? ' ok' : ' fail'}\`}>
                {runOutput.ok ? '成功' : runOutput.timedOut ? '超时' : '失败'}
              </span>
            )}
            <button className="icon-btn" title="关闭" onClick={() => setRunOutput(null)}><Icon name="x" size={12} /></button>
          </div>
          <div className="code-terminal-body">
            {runOutput.running ? (
              <pre className="term-running">正在启动本地运行环境…</pre>
            ) : (
              <>
                {runOutput.stdout ? <pre className="term-out">{runOutput.stdout}</pre> : null}
                {runOutput.stderr ? <pre className="term-out err">{runOutput.stderr}</pre> : null}
                {!runOutput.stdout && !runOutput.stderr && runOutput.ok ? <pre className="term-empty">程序运行完成，没有输出。</pre> : null}
              </>
            )}
          </div>
        </div>
      )}
`,
  '运行结果界面',
)
write('src/components/Toolbar.jsx', toolbar)

let preload = read('electron/preload.cjs')
preload = replaceOnce(
  preload,
  `  // 打开本地文件（系统对话框），返回 [{name, content}]
  openFiles: () => ipcRenderer.invoke('open-files'),`,
  `  // 打开本地文件（系统对话框），返回 [{name, content}]
  openFiles: () => ipcRenderer.invoke('open-files'),
  // 在独立本地进程中运行当前代码块，返回 stdout / stderr / exitCode。
  runCode: (payload) => ipcRenderer.invoke('run-code', payload),`,
  'preload 代码运行 API',
)
write('electron/preload.cjs', preload)

let main = read('electron/main.cjs')
main = replaceOnce(
  main,
  "const path = require('path')",
  "const path = require('path')\nconst { runCode } = require('./code-runner.cjs')",
  '主进程导入 runner',
)
main = replaceOnce(
  main,
  `function registerIpc() {
  // 文件拖出窗口`,
  `function registerIpc() {
  ipcMain.handle('run-code', async (_event, payload) => runCode(payload))

  // 文件拖出窗口`,
  '主进程运行 IPC',
)
write('electron/main.cjs', main)

write('electron/code-runner.cjs', `const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX_CODE_BYTES = 256 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024
const DEFAULT_TIMEOUT = 8000

function normalizeLanguage(value) {
  const key = String(value || 'plaintext').toLowerCase()
  const aliases = { js: 'javascript', node: 'javascript', py: 'python', cxx: 'cpp', 'c++': 'cpp', rs: 'rust', m: 'matlab', text: 'plaintext' }
  return aliases[key] || key
}

function inferLanguage(code) {
  const text = String(code || '')
  if (/^\\s*#include\\s*</m.test(text)) return /std::|cout\\s*<</.test(text) ? 'cpp' : 'c'
  if (/\\bfn\\s+main\\s*\\(/.test(text)) return 'rust'
  if (/\\b(public\\s+)?class\\s+\\w+|System\\.out\\./.test(text)) return 'java'
  if (/\\bconsole\\.(log|error)\\s*\\(|\\b(const|let|var)\\s+\\w+|=>/.test(text)) return 'javascript'
  if (/^\\s*(from\\s+\\w+\\s+import|import\\s+\\w+)|\\bprint\\s*\\(/m.test(text)) return 'python'
  return 'plaintext'
}

function cleanOutput(value) {
  return String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\n$/, '')
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputLimited = false
    let settled = false
    let child
    const finish = (payload) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        ...payload,
        stdout: cleanOutput(stdout.toString('utf8')),
        stderr: cleanOutput(stderr.toString('utf8')),
        timedOut,
        outputLimited,
        durationMs: Date.now() - startedAt,
      })
    }
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, missing: error?.code === 'ENOENT', stdout: '', stderr: String(error?.message || error), durationMs: 0 })
      return
    }
    const append = (target, chunk) => {
      const next = Buffer.concat([target, Buffer.from(chunk)])
      if (next.length <= MAX_OUTPUT_BYTES) return next
      outputLimited = true
      child.kill('SIGKILL')
      return Buffer.concat([next.subarray(0, MAX_OUTPUT_BYTES), Buffer.from('\n[输出超过限制，程序已终止]')])
    }
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
    child.on('error', (error) => finish({ ok: false, missing: error?.code === 'ENOENT', exitCode: null, error }))
    child.on('close', (exitCode, signal) => finish({ ok: exitCode === 0 && !timedOut && !outputLimited, missing: false, exitCode, signal }))
    const timeout = Math.min(30000, Math.max(500, Number(options.timeoutMs) || DEFAULT_TIMEOUT))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeout)
  })
}

async function firstAvailable(candidates, options) {
  let last = null
  for (const candidate of candidates) {
    const result = await runProcess(candidate.command, candidate.args, { ...options, env: candidate.env || options?.env })
    if (!result.missing) return { ...result, runtime: candidate.label || candidate.command }
    last = result
  }
  return last || { ok: false, missing: true, stdout: '', stderr: '未找到运行环境。' }
}

async function compileAndRun(compilers, executable, cwd, timeoutMs) {
  const compiled = await firstAvailable(compilers, { cwd, timeoutMs })
  if (!compiled.ok) return compiled
  const result = await runProcess(executable, [], { cwd, timeoutMs })
  return { ...result, runtime: compiled.runtime }
}

async function runCode(payload = {}) {
  const code = String(payload.code || '')
  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    return { ok: false, language: normalizeLanguage(payload.language), stdout: '', stderr: '代码超过 256 KB，已拒绝运行。', exitCode: null }
  }
  const requested = normalizeLanguage(payload.language)
  const language = requested === 'plaintext' ? inferLanguage(code) : requested
  if (language === 'plaintext') {
    return { ok: false, language, stdout: '', stderr: '无法判断代码语言。请先在工具栏选择 Python、JavaScript 或其他语言。', exitCode: null }
  }
  const timeoutMs = payload.timeoutMs
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tdocs-run-'))
  try {
    let result
    if (language === 'javascript') {
      const source = path.join(dir, 'main.cjs')
      await fs.promises.writeFile(source, code, 'utf8')
      result = await runProcess(process.execPath, [source], {
        cwd: dir,
        timeoutMs,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      result.runtime = 'Node.js'
    } else if (language === 'python') {
      const source = path.join(dir, 'main.py')
      await fs.promises.writeFile(source, code, 'utf8')
      result = await firstAvailable([
        { command: process.env.TDOCS_PYTHON || 'python3', args: [source], label: 'Python 3' },
        { command: 'python', args: [source], label: 'Python' },
        { command: 'py', args: ['-3', source], label: 'Python Launcher' },
      ], { cwd: dir, timeoutMs })
    } else if (language === 'c' || language === 'cpp') {
      const ext = language === 'c' ? 'c' : 'cpp'
      const source = path.join(dir, 'main.' + ext)
      const executable = path.join(dir, process.platform === 'win32' ? 'tdocs-program.exe' : 'tdocs-program')
      await fs.promises.writeFile(source, code, 'utf8')
      const names = language === 'c' ? ['cc', 'clang', 'gcc'] : ['c++', 'clang++', 'g++']
      result = await compileAndRun(names.map((command) => ({ command, args: [source, '-o', executable], label: command })), executable, dir, timeoutMs)
    } else if (language === 'rust') {
      const source = path.join(dir, 'main.rs')
      const executable = path.join(dir, process.platform === 'win32' ? 'tdocs-program.exe' : 'tdocs-program')
      await fs.promises.writeFile(source, code, 'utf8')
      result = await compileAndRun([{ command: 'rustc', args: [source, '-o', executable], label: 'rustc' }], executable, dir, timeoutMs)
    } else if (language === 'java') {
      const match = code.match(/\\bpublic\\s+class\\s+([A-Za-z_$][\\w$]*)/) || code.match(/\\bclass\\s+([A-Za-z_$][\\w$]*)/)
      const className = match?.[1] || 'Main'
      const sourceCode = match ? code : 'public class Main { public static void main(String[] args) throws Exception {\\n' + code + '\\n} }'
      const source = path.join(dir, className + '.java')
      await fs.promises.writeFile(source, sourceCode, 'utf8')
      const compiled = await firstAvailable([{ command: 'javac', args: [source], label: 'javac' }], { cwd: dir, timeoutMs })
      result = compiled.ok
        ? { ...(await firstAvailable([{ command: 'java', args: ['-cp', dir, className], label: 'Java' }], { cwd: dir, timeoutMs })) }
        : compiled
    } else if (language === 'matlab') {
      const source = path.join(dir, 'main.m')
      await fs.promises.writeFile(source, code, 'utf8')
      const escaped = source.replace(/'/g, "''")
      result = await firstAvailable([
        { command: 'octave', args: ['--quiet', '--no-gui', source], label: 'GNU Octave' },
        { command: 'matlab', args: ['-batch', `run('${escaped}')`], label: 'MATLAB' },
      ], { cwd: dir, timeoutMs })
    } else {
      result = { ok: false, stdout: '', stderr: `当前版本没有配置 ${language} 的本地运行器。`, exitCode: null }
    }
    if (result.missing) {
      result.stderr = `本机没有安装 ${language} 运行环境，或运行程序不在 PATH 中。`
    }
    return { language, ...result }
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = { inferLanguage, normalizeLanguage, runCode }
`)

let css = read('src/app.css')
css += `

/* ---------- Word 页面几何与交互修正 ---------- */
.page.paged {
  width: var(--page-width);
  min-height: 0;
  margin: 0 auto;
}
.page.paged .editor-content {
  min-height: 0;
}
.editor-content .pm-page-wrap {
  position: relative;
  width: var(--page-width);
  height: calc(var(--page-h) * var(--page-scale, 1));
  margin: 0 auto calc(28px * var(--page-scale, 1));
  pointer-events: none;
}
.editor-content .pm-page-wrap:last-child {
  margin-bottom: 0;
}
.editor-content [data-page] {
  position: absolute;
  inset: 0 auto auto 0;
  width: var(--page-base-width);
  height: var(--page-h);
  transform: scale(var(--page-scale, 1));
  transform-origin: top left;
  pointer-events: auto;
}

/* 行号和代码正文必须共享完全相同的字体度量，否则误差会逐行累积。 */
.editor-content pre {
  --code-line-height: 1.6;
  line-height: var(--code-line-height);
}
.editor-content pre code,
.editor-content pre .code-gutter {
  font-size: inherit;
  line-height: var(--code-line-height);
  tab-size: 4;
}
.editor-content pre .code-gutter {
  white-space: pre;
  font-variant-numeric: tabular-nums;
}

/* 菜单位置由按钮实时计算，不再写死在视口右下角。 */
.zoom-menu {
  position: fixed !important;
  top: auto;
  right: auto !important;
  left: auto;
  width: 144px;
  min-width: 144px;
  max-height: 304px;
  overflow-y: auto;
}

/* AI 请求中的范围与普通蓝色选区区别开，同时保证文字始终可读。 */
.ai-sel-highlight {
  color: var(--text) !important;
  -webkit-text-fill-color: var(--text);
  background: linear-gradient(110deg, rgba(90, 117, 255, .24), rgba(171, 91, 255, .3), rgba(70, 210, 224, .2));
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 rgba(153, 111, 255, .9), 0 0 0 1px rgba(124, 102, 255, .2);
  animation: aiSelectionGlow 1.8s ease-in-out infinite;
}
@keyframes aiSelectionGlow {
  0%, 100% { box-shadow: inset 0 -1px 0 rgba(153, 111, 255, .75), 0 0 0 1px rgba(124, 102, 255, .16); }
  50% { box-shadow: inset 0 -1px 0 rgba(84, 213, 230, .95), 0 0 8px rgba(126, 100, 255, .24); }
}

.code-terminal-status {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-family: var(--font-sans);
}
.code-terminal-status.ok { color: #7ee2ad; background: rgba(47, 158, 110, .16); }
.code-terminal-status.fail { color: #ff8d90; background: rgba(229, 72, 77, .16); }
.code-terminal-head .icon-btn { margin-left: 0; }
.term-running,
.term-empty { color: #8b93a1; }
.term-out + .term-out { margin-top: 8px !important; padding-top: 8px; border-top: 1px solid #262b33; }
.tb-run-btn:disabled { opacity: .45; cursor: wait; }
`
write('src/app.css', css)

write('tests/viewModes.test.mjs', `import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePaper, resolvePageSize, viewModeForPaper } from '../src/lib/viewModes.js'

test('未知纸张回退到文档模式', () => {
  assert.equal(normalizePaper('unknown'), 'wide')
  assert.equal(viewModeForPaper('unknown'), 'document')
})

test('A4 在 100% 下使用固定 96 CSS DPI 尺寸', () => {
  assert.deepEqual(resolvePageSize('a4'), { w: 794, h: 1123 })
  assert.ok(Math.abs(794 / 1123 - 210 / 297) < 0.001)
})

test('B5 使用固定纸张比例', () => {
  assert.deepEqual(resolvePageSize('b5'), { w: 665, h: 945 })
  assert.ok(Math.abs(665 / 945 - 176 / 250) < 0.002)
})

test('文档模式没有固定页高', () => {
  assert.deepEqual(resolvePageSize('wide'), { w: 880, h: 0 })
})
`)

write('tests/codeRunner.test.mjs', `import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { inferLanguage, runCode } = require('../electron/code-runner.cjs')

test('纯文本中的 print 调用识别为 Python', () => {
  assert.equal(inferLanguage('print("p")'), 'python')
})

test('JavaScript 运行返回真实标准输出', async () => {
  const result = await runCode({ language: 'javascript', code: 'console.log("p")' })
  assert.equal(result.ok, true)
  assert.equal(result.stdout, 'p')
  assert.equal(result.stderr, '')
})

test('无法识别的纯文本不会伪装成 JavaScript 执行', async () => {
  const result = await runCode({ language: 'plaintext', code: '普通文字' })
  assert.equal(result.ok, false)
  assert.match(result.stderr, /无法判断代码语言/)
})
`)

console.log('Word page geometry, anchored zoom menu, AI selection and local code runtime applied.')
