import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import matlab from 'highlight.js/lib/languages/matlab'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model'
import { looksLikeMarkdown, renderMarkdown } from '../lib/markdown.js'
import { extractHeadings } from '../lib/headings.js'
import ContextMenu from './ContextMenu.jsx'
import BubbleBar from './BubbleBar.jsx'
import { Icon } from './Icons.jsx'

// 将 HTML 内容转换并插入到编辑器指定位置
function insertHtmlContent(view, html, pos) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(doc.body)
  const tr = pos != null ? view.state.tr.insert(pos, slice.content) : view.state.tr.replaceSelection(slice)
  view.dispatch(tr.scrollIntoView())
}

// 将 Markdown 文本转换并插入
function insertMarkdownText(view, text, pos) {
  insertHtmlContent(view, renderMarkdown(text), pos)
}

const escapeHtmlText = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const isMdFile = (file) => /\.(md|markdown|mdown)$/i.test(file?.name || '')

// ---------- 字号 + 字体：基于 TextStyle 扩展两个属性，避免重复注册同名 mark ----------
const FontStyleExt = TextStyle.extend({
  name: 'textStyle',
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el) => el.style.fontFamily || null,
        renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {}),
      },
    }
  },
})

// ---------- 上标 / 下标（图 2 功能） ----------
const Superscript = Mark.create({
  name: 'superscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: () => ['sup', 0],
  addKeyboardShortcuts() {
    return { 'Mod-Shift-=': () => this.editor.commands.toggleMark('superscript') }
  },
})
const Subscript = Mark.create({
  name: 'subscript',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: () => ['sub', 0],
  addKeyboardShortcuts() {
    return { 'Mod-=': () => this.editor.commands.toggleMark('subscript') }
  },
})

// ---------- AI 内联 diff 标记（span class 会被 PM 丢弃，必须用 mark 承载样式） ----------
const AiOldMark = Mark.create({
  name: 'aiOld',
  inclusive: false,
  excludes: '',
  parseHTML: () => [
    { tag: 'span', getAttrs: (el) => (el.classList && el.classList.contains('ai-inline-old') ? {} : false) },
  ],
  renderHTML: () => ['span', { class: 'ai-inline-old' }, 0],
})
const AiNewMark = Mark.create({
  name: 'aiNew',
  inclusive: false,
  excludes: '',
  parseHTML: () => [
    { tag: 'span', getAttrs: (el) => (el.classList && el.classList.contains('ai-inline-new') ? {} : false) },
  ],
  renderHTML: () => ['span', { class: 'ai-inline-new' }, 0],
})

// ---------- AI 改写选区保持高亮（窗口打开时选中范围仍可见） ----------
const aiSelKey = new PluginKey('aiSelectionHighlight')
const AiSelPlugin = new Plugin({
  key: aiSelKey,
  state: {
    init: () => DecorationSet.empty,
    apply: (tr, set) => {
      const meta = tr.getMeta(aiSelKey)
      return meta ? DecorationSet.create(tr.doc, meta) : set.map(tr.mapping, tr.doc)
    },
  },
  props: {
    decorations(state) {
      return aiSelKey.getState(state)
    },
  },
})

// ---------- 页节点（A4/B5 真分页：每页独立 DOM，固定尺寸，页间物理空白） ----------
const Page = Node.create({
  name: 'page',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-page]' }],
  renderHTML: () => ['div', { 'data-page': 'true' }, 0],
  addNodeView() {
    return () => {
      const wrap = document.createElement('div')
      wrap.className = 'pm-page-wrap'
      const pageEl = document.createElement('div')
      pageEl.dataset.page = 'true'
      wrap.append(pageEl)
      let currentNode = null
      return {
        dom: wrap,
        contentDOM: pageEl,
        update: (nextNode) => {
          if (nextNode.type.name !== 'page') return false
          currentNode = nextNode
          return true
        },
        destroy: () => { currentNode = null },
      }
    }
  },
})

// ---------- 代码块：语法高亮（lowlight）+ 默认行号（自定义 NodeView） ----------
const lowlight = createLowlight(common)
lowlight.register('matlab', matlab)
// 可用的语言列表（供语言选择菜单）
const CODE_LANGUAGES = [
  ['plaintext', '纯文本'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['matlab', 'MATLAB'],
  ['javascript', 'JavaScript'],
]

const CodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addNodeView() {
    return ({ node }) => {
      const pre = document.createElement('pre')
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      const code = document.createElement('code')
      pre.append(gutter, code)
      const render = () => {
        gutter.textContent = (node.textContent || '').split('\n').map((_, i) => i + 1).join('\n')
      }
      render()
      return { dom: pre, contentDOM: code, update: (n) => { node = n; render(); return true } }
    }
  },
})

// AI 内联 diff 接受卡片（图 2 样式：原文划线 + 撤销/接受，浮在 diff 上方）
function AiAcceptCard({ editor, diff, onResolve }) {
  const [pos, setPos] = useState(null)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = editor?.view?.dom?.querySelector('.ai-inline-new')
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({ top: r.top - 8, left: r.left + r.width / 2 })
    }, 80)
    return () => clearTimeout(t)
  }, [editor, diff])
  const oldText = (diff.oldHtml || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const resolve = (accept) => {
    if (!editor) return
    editor.chain().focus().insertContentAt({ from: diff.from, to: diff.to }, accept ? diff.newHtml : diff.oldHtml).run()
    onResolve?.(accept)
  }
  if (!pos) return null
  return (
    <div
      className={`ai-accept-card${leaving ? ' leaving' : ''}`}
      style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
      onMouseLeave={() => { setLeaving(true); setTimeout(() => setLeaving(false), 300) }}
    >
      <div className="ai-accept-original">{oldText || '（原文）'}</div>
      <div className="ai-accept-btns">
        <button className="btn ai-accept-undo" onClick={() => resolve(false)}>撤销</button>
        <button className="btn btn-primary ai-accept-ok" onClick={() => resolve(true)}>接受</button>
      </div>
    </div>
  )
}

// ---------- 分页留白：通过 ProseMirror Decoration 给分页边界段落加类名（由编辑器状态管理，不会被重排剥离） ----------
const PAGE_PAD = 96
const pagePadKey = new PluginKey('pagePadPadding')
const PagePadExtension = Extension.create({
  name: 'pagePadPadding',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pagePadKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const meta = tr.getMeta(pagePadKey)
            if (meta) {
              if (!meta.pairs?.length) return DecorationSet.empty
              const decos = []
              for (const p of meta.pairs) {
                // 页尾块底部留白：普通块用 padding；代码块/引用块用 margin（避免背景撑满）；空段不撑
                const node = tr.doc.nodeAt(p.prevFrom)
                const isBox = node && (node.type.name === 'codeBlock' || node.type.name === 'blockquote')
                const isEmpty = node && node.textContent.trim() === ''
                const style = p.prevPad != null && !isEmpty
                  ? (isBox ? `margin-bottom: ${p.prevPad}px` : `padding-bottom: ${p.prevPad}px`)
                  : ''
                decos.push(Decoration.node(p.prevFrom, p.prevTo, {
                  class: isEmpty ? '' : (isBox ? 'page-pad-bottom-box' : 'page-pad-bottom'),
                  style,
                }))
                if (p.nextFrom != null) {
                  decos.push(Decoration.node(p.nextFrom, p.nextTo, { class: 'page-pad-top' }))
                }
              }
              return DecorationSet.create(tr.doc, decos)
            }
            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pagePadKey.getState(state)
          },
        },
      }),
    ]
  },
})

export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, aiKeepSelection = false, aiInline = null, onResolveInline }) {
  const saveTimer = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [breakOffsets, setBreakOffsets] = useState([])
  const wrapRef = useRef(null)
  const pageMetaRef = useRef({ top: 64, left: 0, width: 0 })
  const lastPagePads = useRef([])
  const lastTailPad = useRef(null)
  // 选中文字浮动条位置
  const [bubblePos, setBubblePos] = useState(null)
  const canvasRef = useRef(null)
  const lastPairsRef = useRef('')
  const reflowRafRef = useRef(0)
  const reflowRunRef = useRef(0)

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用带行号的自定义 CodeBlock
      }),
      CodeBlock,
      PagePadExtension,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image,
      Placeholder.configure({
        placeholder: '开始写作，输入 / 或直接输入文字…',
      }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      FontStyleExt,
      Superscript,
      Subscript,
      Page,
      AiOldMark,
      AiNewMark,
      AiSelPlugin,
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content: doc?.content || '',
    editorProps: {
      attributes: { class: 'editor-content' },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0]
        if (!file) return false
        const coords = { left: event.clientX, top: event.clientY }
        if (file.type.startsWith('image/')) {
          event.preventDefault()
          const reader = new FileReader()
          reader.onload = () => {
            const { from } = view.posAtCoords(coords) || {}
            if (from != null) {
              view.dispatch(view.state.tr.insert(from, view.state.schema.nodes.image.create({ src: reader.result })))
            }
          }
          reader.readAsDataURL(file)
          return true
        }
        // 拖入 Markdown 文件自动转换
        if (isMdFile(file)) {
          event.preventDefault()
          const reader = new FileReader()
          reader.onload = () => {
            const { from } = view.posAtCoords(coords) || {}
            insertMarkdownText(view, reader.result, from ?? undefined)
          }
          reader.readAsText(file)
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        // 粘贴 .md 文件
        const file = event.clipboardData?.files?.[0]
        if (file && isMdFile(file)) {
          event.preventDefault()
          const reader = new FileReader()
          reader.onload = () => insertMarkdownText(view, reader.result, null)
          reader.readAsText(file)
          return true
        }
        // 粘贴纯文本且形似 Markdown → 自动转换
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        if (!html && text) {
          if (looksLikeMarkdown(text)) {
            event.preventDefault()
            insertMarkdownText(view, text, null)
            return true
          }
          // 多行纯文本 → 每行一段，避免粘成一坨
          if (text.includes('\n')) {
            event.preventDefault()
            const paras = text
              .replace(/\r/g, '')
              .split('\n')
              .map((l) => `<p>${escapeHtmlText(l) || '<br>'}</p>`)
              .join('')
            insertHtmlContent(view, paras, null)
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      // 统计即时更新
      onStats?.({
        words: ed.storage.characterCount.words(),
        chars: ed.storage.characterCount.characters(),
      })
      // 大纲更新
      onHeadings?.(extractHeadings(ed))
      // 内容防抖保存
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onChange?.(getSaveHtml())
      }, 600)
    },
  })

  // 初始化统计 + 向父级暴露 editor 实例
  useEffect(() => {
    if (editor) {
      onStats?.({
        words: editor.storage.characterCount.words(),
        chars: editor.storage.characterCount.characters(),
      })
      onHeadings?.(extractHeadings(editor))
      onReady?.(editor)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // 保存用的 HTML：分页模式下把 page 节点展开为普通块（page 结构仅用于显示，不持久化）
  const getSaveHtml = () => {
    if (!editor) return ''
    if (!paged || editor.state.doc.firstChild?.type.name !== 'page') return editor.getHTML()
    const blocks = []
    editor.state.doc.forEach((n) => {
      if (n.type.name === 'page') n.forEach((b) => blocks.push(b))
      else blocks.push(n)
    })
    const container = editor.state.schema.nodes.doc.create(null, blocks)
    const dom = DOMSerializer.fromSchema(editor.state.schema).serializeFragment(container.content)
    const tmp = document.createElement('div')
    tmp.appendChild(dom)
    return tmp.innerHTML
  }

  // 卸载前冲刷未保存内容
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        onChange?.(getSaveHtml())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 真分页（A4/B5）：每页独立 DOM、固定尺寸、溢出自动建新页 ----------
  // 结构转换：宽屏（doc>block）<-> 分页（doc>page>block）
  const toPaged = () => {
    if (!editor) return
    const { state } = editor
    if (state.doc.firstChild?.type.name === 'page') return
    const blocks = []
    state.doc.forEach((n) => blocks.push(n))
    if (!blocks.length) return
    const pageNode = state.schema.nodes.page.create(null, blocks)
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, pageNode))
  }
  const toWide = () => {
    if (!editor) return
    const { state } = editor
    if (state.doc.firstChild?.type.name !== 'page') return
    const blocks = []
    state.doc.forEach((n) => {
      if (n.type.name === 'page') n.forEach((b) => blocks.push(b))
      else blocks.push(n)
    })
    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, content))
  }
  // 溢出重排：每页内容超出页高时，把页尾块移到下一页（新建或追加）
  const reflow = () => {
    if (!editor || !paged) return false
    const { view, state } = editor
    // 收集第一个溢出页（不 dispatch，避免遍历中改 state）
    let target = null
    state.doc.descendants((node, pos) => {
      if (target || node.type.name !== 'page') return
      const dom = view.nodeDOM(pos)
      if (!dom) return
      const pageEl = dom.nodeType === 1 && dom.matches('[data-page]') ? dom : dom.querySelector('[data-page]')
      if (!pageEl) return
      const overflow = pageEl.scrollHeight - pageEl.clientHeight
      if (overflow > 2 && node.childCount > 1) {
        target = { node, pos }
      }
    })
    if (!target) return false
    const { node, pos } = target
    const last = node.lastChild
    const lastFrom = pos + 1 + node.content.size - last.nodeSize
    const lastTo = lastFrom + last.nodeSize
    const frag = last.copy(last.content)
    let tr = state.tr
    tr = tr.delete(lastFrom, lastTo)
    const pageSize = tr.doc.nodeAt(pos)?.nodeSize || 1
    const nextPos = pos + pageSize
    const after = tr.doc.nodeAt(nextPos)
    if (after?.type.name === 'page') {
      tr = tr.insert(nextPos + 1, frag)
    } else {
      const newPage = state.schema.nodes.page.create(null, frag)
      tr = tr.insert(nextPos, newPage)
    }
    view.dispatch(tr)
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

  // paged 切换：结构转换 + 重排
  useEffect(() => {
    if (!editor) return
    if (paged) {
      toPaged()
      // 等待页面 DOM 布局后逐帧重排
      runReflow()
    } else {
      toWide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, editor])

  // 编辑时实时重排（输入导致溢出自动分页）
  useEffect(() => {
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
  }, [editor, paged, pageH])

  // 页码标签（React 渲染，PM 容器外）：每页位置 + 页码
  const [pageRects, setPageRects] = useState([])
  // 页码标签兜底：MutationObserver 监听 PM DOM（NodeView 重建也触发），防抖重算页位置
  useEffect(() => {
    if (!editor || !paged) return
    const root = editor.view.dom
    const calc = () => {
      const wraps = [...root.querySelectorAll('.pm-page-wrap')]
      const wrapBox = wrapRef.current?.getBoundingClientRect()
      if (!wraps.length || !wrapBox) { setPageRects([]); return }
      setPageRects(wraps.map((w) => {
        const r = w.getBoundingClientRect()
        return { top: r.top - wrapBox.top, left: r.left - wrapBox.left, width: r.width, height: r.height }
      }))
    }
    let t = null
    const mo = new MutationObserver(() => {
      clearTimeout(t)
      t = setTimeout(calc, 80)
    })
    mo.observe(root, { subtree: true, childList: true, characterData: true })
    calc()
    const onScroll = () => { clearTimeout(t); t = setTimeout(calc, 80) }
    const canvas = canvasRef.current
    canvas?.addEventListener('scroll', onScroll, { passive: true })
    return () => { mo.disconnect(); clearTimeout(t); canvas?.removeEventListener('scroll', onScroll) }
  }, [editor, paged])

  // 选中文字统计：选区变化时上报选中字符数，并定位浮动条
  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', updateBubble)
    editor.on('transaction', updateBubble)
    return () => {
      editor.off('selectionUpdate', updateBubble)
      editor.off('transaction', updateBubble)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // AI 改写窗口打开时：保持选区高亮可见（编辑器失焦也不消失）
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
  }, [aiKeepSelection, editor])

  // 分页模式：真分页由页节点（data-page）+ 溢出重排实现，旧的分页位置计算不再需要
  useEffect(() => {
    setBreakOffsets([])
    if (editor?.view) {
      const sig = JSON.stringify([])
      if (lastPairsRef.current !== sig) {
        lastPairsRef.current = sig
        editor.view.dispatch(editor.state.tr.setMeta(pagePadKey, { pairs: [] }))
      }
    }
  }, [paged, pageH, editor])

  // 右键菜单项
  const buildCtxItems = () => {
    if (!editor) return []
    const chain = () => editor.chain().focus()
    return [
      { label: '撤销', shortcut: '⌘Z', icon: <Icon name="undo" size={15} />, disabled: !editor.can().undo(), action: () => chain().undo().run() },
      { label: '重做', shortcut: '⌘⇧Z', icon: <Icon name="redo" size={15} />, disabled: !editor.can().redo(), action: () => chain().redo().run() },
      { sep: true },
      { label: '剪切', icon: <Icon name="edit" size={15} />, action: () => document.execCommand('cut') },
      { label: '复制', icon: <Icon name="doc" size={15} />, action: () => document.execCommand('copy') },
      { sep: true },
      { label: '加粗', icon: <Icon name="bold" size={15} />, action: () => chain().toggleBold().run() },
      { label: '斜体', icon: <Icon name="italic" size={15} />, action: () => chain().toggleItalic().run() },
      { label: '高亮', icon: <Icon name="highlight" size={15} />, action: () => chain().toggleHighlight().run() },
      { sep: true },
      {
        label: '插入链接', icon: <Icon name="link" size={15} />,
        action: () => {
          const url = window.prompt('输入链接地址', 'https://')
          if (url && url !== 'https://') chain().extendMarkRange('link').setLink({ href: url }).run()
        },
      },
      { label: '清除格式', icon: <Icon name="eraser" size={15} />, action: () => chain().clearNodes().unsetAllMarks().run() },
      { sep: true },
      { label: '代码块', icon: <Icon name="codeBlock" size={15} />, action: () => chain().toggleCodeBlock().run() },
      { label: '引用', icon: <Icon name="quote" size={15} />, action: () => chain().toggleBlockquote().run() },
      { sep: true },
      { label: 'AI 改写', icon: <Icon name="sparkle" size={15} />, action: () => onAi?.() },
    ]
  }

  // 选区浮动条定位（视口坐标，滚动时重新计算）
  const updateBubble = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const len = from !== to ? editor.state.doc.textBetween(from, to).length : 0
    onSelection?.(len)
    if (from === to) { setBubblePos(null); return }
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width < 1) return
    setBubblePos({ top: rect.top, left: rect.left + rect.width / 2 })
  }

  return (
    <div
      className="canvas"
      ref={canvasRef}
      onMouseDown={(e) => {
        // 点击编辑器内容外的空白：光标移到点击处（可退出代码块）
        const content = wrapRef.current?.querySelector('.editor-content')
        if (!editor || !content || content.contains(e.target)) return
        if (e.target.closest?.('.bubble-wrap, .ai-accept-card, .menu, .overlay')) return
        if (e.button !== 0) return
        const res = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (res?.pos != null) {
          const node = editor.state.doc.nodeAt(res.pos)
          // 落在代码块/引用内且点在内容区外：失焦退出编辑
          if (node && (node.type.name === 'codeBlock' || node.type.name === 'blockquote')) {
            editor.commands.blur()
            return
          }
          editor.chain().focus().setTextSelection(res.pos).run()
        }
      }}
      onScroll={updateBubble}
      onContextMenu={(e) => {
        if (!editor) return
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <BubbleBar editor={editor} pos={bubblePos} onAi={onAi} />
      {/* AI 内联 diff 接受卡片 */}
      {aiInline && <AiAcceptCard editor={editor} diff={aiInline} onResolve={onResolveInline} />}
      <div className="page-wrap" ref={wrapRef}>
        <EditorContent editor={editor} className={`page${paged ? ' paged' : ''}`} />
        {/* 页码层：React 渲染在 PM 容器外，PM 清理不到；随内容滚动定位 */}
        {paged && pageRects.length > 0 && (
          <div className="pm-pages-layer">
            {pageRects.map((r, i) => (
              <div
                key={i}
                className="pm-page-label"
                style={{ top: r.top + r.height - 26, left: r.left, width: r.width }}
              >
                第 {i + 1} 页 / 共 {pageRects.length} 页
              </div>
            ))}
          </div>
        )}
        {paged && pageH > 0 && breakStyle === 'dashed' && (
          <div className="page-breaks" aria-hidden>
            {breakOffsets.map((off, k) => (
              <div
                key={`pb${k}`}
                className="page-break-line"
                style={{
                  top: pageMetaRef.current.top + off,
                  left: pageMetaRef.current.left,
                  width: pageMetaRef.current.width,
                }}
              >
                <span className="page-break-label">
                  {pageLabelStyle === 'total'
                    ? `第 ${k + 2} 页 / 共 ${breakOffsets.length + 1} 页`
                    : `第 ${k + 2} 页`}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* 分离页面（WPS 式）：页与页之间用灰色间隙带完全分开 */}
        {paged && pageH > 0 && breakStyle === 'split' && (
          <div className="page-breaks" aria-hidden>
            {breakOffsets.map((off, k) => (
              <div
                key={`gap${k}`}
                className="page-gap"
                style={{
                  top: pageMetaRef.current.top + off - 11,
                  left: pageMetaRef.current.left,
                  width: pageMetaRef.current.width,
                }}
              >
                <span className="page-gap-label">
                  {pageLabelStyle === 'total'
                    ? `第 ${k + 1} 页 / 共 ${breakOffsets.length + 1} 页`
                    : `第 ${k + 1} 页 / 第 ${k + 2} 页`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildCtxItems()} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
