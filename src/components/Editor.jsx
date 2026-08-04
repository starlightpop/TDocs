import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
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
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
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

// ---------- 代码块：带默认行号（自定义 NodeView，gutter 与内容同步） ----------
const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addKeyboardShortcuts() {
    return { 'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock() }
  },
  parseHTML() {
    return [{ tag: 'pre' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes), ['code', 0]]
  },
  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.setNode(this.name, attributes),
      toggleCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph', attributes),
      setCodeBlockAt:
        (position, attributes) =>
        ({ state, dispatch, chain }) => {
          const node = state.doc.nodeAt(position)
          if (!node) return false
          if (node.type.name === this.name) {
            return chain().setNodeAt(position, 'paragraph').run()
          }
          return chain().setNodeAt(position, this.name, attributes).run()
        },
    }
  },
  addNodeView() {
    return ({ node }) => {
      const pre = document.createElement('pre')
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      const code = document.createElement('code')
      pre.append(gutter, code)
      const render = () => {
        const lines = (node.textContent || '').split('\n')
        gutter.textContent = lines.map((_, i) => i + 1).join('\n')
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
                decos.push(Decoration.node(p.prevFrom, p.prevTo, { class: 'page-pad-bottom' }))
                decos.push(Decoration.node(p.nextFrom, p.nextTo, { class: 'page-pad-top' }))
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
  // 段落悬停手柄（飞书式“大 T”）：{ top, left } 相对视口
  const [hoverBlock, setHoverBlock] = useState(null)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const hoverBlockRef = useRef(null)
  const blockMenuOpenRef = useRef(false)
  const handleRafRef = useRef(0)
  const hoverOpenTimerRef = useRef(null)
  const hoverCloseTimerRef = useRef(null)
  // 选中文字浮动条位置
  const [bubblePos, setBubblePos] = useState(null)
  const canvasRef = useRef(null)
  const lastPairsRef = useRef('')

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
        onChange?.(ed.getHTML())
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

  // 卸载前冲刷未保存内容
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        onChange?.(editor?.getHTML() || '')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // 分页模式：分页位置对齐段落边界，不会把文字从中间切断
  useEffect(() => {
    if (!paged || !pageH) {
      setBreakOffsets([])
      // 清除分页留白装饰
      if (editor?.view) {
        const sig = JSON.stringify([])
        if (lastPairsRef.current !== sig) {
          lastPairsRef.current = sig
          editor.view.dispatch(editor.state.tr.setMeta(pagePadKey, { pairs: [] }))
        }
      }
      return undefined
    }
    // 虚线分页：仅计算段落边界位置
    const computeBreaks = (content) => {
      const blocks = Array.from(content.children)
      if (!blocks.length) return []
      const contentTop = content.getBoundingClientRect().top
      const infos = blocks.map((b) => ({
        bottom: b.getBoundingClientRect().bottom - contentTop,
        margin: parseFloat(getComputedStyle(b).marginBottom) || 0,
      }))
      const breaks = []
      let pageEnd = pageH
      let i = 0
      while (i < infos.length - 1) {
        let best = -1
        while (i < infos.length - 1 && infos[i].bottom <= pageEnd + 1) {
          best = i
          i++
        }
        if (best === -1) {
          breaks.push(infos[i].bottom + infos[i].margin / 2)
          i++
        } else {
          breaks.push(infos[best].bottom + infos[best].margin / 2)
        }
        pageEnd = breaks[breaks.length - 1] + pageH
      }
      return breaks
    }
    let raf = 0
    const measure = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      const page = wrap.querySelector('.page')
      const content = wrap.querySelector('.editor-content')
      if (!page || !content) return
      const cs = getComputedStyle(page)
      const padTop = parseFloat(cs.paddingTop) || 64
      pageMetaRef.current = {
        top: padTop,
        left: page.offsetLeft,
        width: page.offsetWidth,
      }
      let offsets = []
      const breakIndices = [] // 分页边界块索引 [prevIdx, nextIdx]
      if (breakStyle === 'split') {
        // 分离页面：留白由 Decoration 类名提供（已生效时布局已含留白）
        const blocks = Array.from(content.children)
        if (blocks.length > 1) {
          // 用 纸张顶边 + 上边距 作为基准，避免首块 margin-top 穿透造成偏移
          const refTop = page.getBoundingClientRect().top + padTop
          const bottomOf = (b) => b.getBoundingClientRect().bottom
          // 第 1 页顶边 = 纸张顶边
          let pageTopEdge = refTop - padTop
          let areaEnd = pageTopEdge + pageH - PAGE_PAD
          let i = 0
          while (i < blocks.length - 1) {
            let best = -1
            while (i < blocks.length - 1 && bottomOf(blocks[i]) <= areaEnd + 1) {
              best = i
              i++
            }
            if (best === -1) {
              best = i // 单段超整页：强制在该段后分页
              i++
            }
            if (best + 1 >= blocks.length) break
            breakIndices.push([best, best + 1])
            // 基于“文字底边”（剔除 padding）计算分页边界，保证装饰是否已应用时结果一致
            const prevPadBottom = parseFloat(getComputedStyle(blocks[best]).paddingBottom) || 0
            const prevMargin = parseFloat(getComputedStyle(blocks[best]).marginBottom) || 0
            const prevTextBottom = bottomOf(blocks[best]) - prevPadBottom
            const boundary = prevTextBottom + PAGE_PAD + prevMargin / 2
            offsets.push(boundary - refTop)
            // 下一页从边界开始，内容可用到 边界 + 页高 - 下留白
            pageTopEdge = boundary
            areaEnd = pageTopEdge + pageH - PAGE_PAD
          }
        }
      } else {
        offsets = computeBreaks(content)
      }
      // 将分页边界映射为文档节点位置，通过 Decoration 派发留白类名
      if (breakStyle === 'split' && editor?.view) {
        const topRanges = []
        editor.state.doc.forEach((node, offset) => {
          topRanges.push({ from: offset, to: offset + node.nodeSize })
        })
        const pairs = breakIndices
          .filter(([a, b]) => topRanges[a] && topRanges[b])
          .map(([a, b]) => ({
            prevFrom: topRanges[a].from,
            prevTo: topRanges[a].to,
            nextFrom: topRanges[b].from,
            nextTo: topRanges[b].to,
          }))
        const sig = JSON.stringify(pairs)
        if (sig !== lastPairsRef.current) {
          lastPairsRef.current = sig
          editor.view.dispatch(editor.state.tr.setMeta(pagePadKey, { pairs }))
        }
      }
      setBreakOffsets((prev) => (JSON.stringify(prev) === JSON.stringify(offsets) ? prev : offsets))
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    const contentEl = wrapRef.current?.querySelector('.editor-content')
    if (contentEl) ro.observe(contentEl)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [paged, pageH, breakStyle, editor])

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

  // 段落悬停：定位当前 hover 的内容块，显示左侧手柄
  const updateHandle = () => {
    const block = hoverBlockRef.current
    if (!block) return
    const rect = block.getBoundingClientRect()
    setHoverBlock({ top: rect.top, left: rect.left })
  }

  // rAF 节流：同一块连续 mousemove 不反复 setState
  const scheduleHandle = () => {
    if (handleRafRef.current) return
    handleRafRef.current = requestAnimationFrame(() => {
      handleRafRef.current = 0
      updateHandle()
    })
  }

  const closeMenuSoon = () => {
    clearTimeout(hoverOpenTimerRef.current)
    clearTimeout(hoverCloseTimerRef.current)
    hoverCloseTimerRef.current = setTimeout(() => {
      if (blockMenuOpenRef.current) {
        blockMenuOpenRef.current = false
        setBlockMenuOpen(false)
      }
    }, 180)
  }

  const onCanvasMove = (e) => {
    // 手柄/菜单自身不参与块检测
    if (e.target.closest?.('.para-handle, .para-handle-menu')) return
    const content = wrapRef.current?.querySelector('.editor-content')
    if (!content || !content.contains(e.target)) {
      clearTimeout(hoverOpenTimerRef.current)
      clearTimeout(hoverCloseTimerRef.current)
      hoverBlockRef.current = null
      if (blockMenuOpenRef.current) { blockMenuOpenRef.current = false; setBlockMenuOpen(false) }
      setHoverBlock(null)
      return
    }
    const block = e.target.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre')
    // 飞书式：鼠标在内容区移动，手柄持续跟随当前行；空白处不清空，保持上一个块直到碰到新块
    if (!block) {
      scheduleHandle()
      return
    }
    if (block !== hoverBlockRef.current) {
      hoverBlockRef.current = block
      setBlockMenuOpen(false)
      blockMenuOpenRef.current = false
      clearTimeout(hoverOpenTimerRef.current)
      clearTimeout(hoverCloseTimerRef.current)
      updateHandle()
    } else {
      scheduleHandle()
      // 鼠标在普通内容上（不在菜单内）→ 延迟收起菜单
      if (blockMenuOpenRef.current && !e.target.closest('.para-handle-menu')) {
        closeMenuSoon()
      }
    }
  }

  // 手柄菜单：设置块级别 / 删除块
  const handleBlockAction = (level) => {
    const block = hoverBlockRef.current
    if (!block || !editor) return
    const { view } = editor
    const pos = view.posAtDOM(block, 0)
    if (pos == null) return
    if (level === null) {
      const node = view.state.doc.nodeAt(pos)
      const size = node ? node.nodeSize : Math.max(block.textContent.length + 2, 2)
      view.dispatch(view.state.tr.delete(pos, pos + size))
    } else {
      const chain = editor.chain().focus()
      if (level === 0) chain.setNode('paragraph')
      else chain.setNode('heading', { level })
      chain.run()
    }
    setBlockMenuOpen(false)
    setHoverBlock(null)
  }

  return (
    <div
      className="canvas"
      ref={canvasRef}
      onMouseMove={onCanvasMove}
      onScroll={() => { updateHandle(); updateBubble() }}
      onMouseLeave={() => setHoverBlock(null)}
      onContextMenu={(e) => {
        if (!editor) return
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* 段落悬停手柄（飞书式大 T）：始终显示，菜单在右侧展开不替换它 */}
      {hoverBlock && (
        <div
          className={`para-handle${blockMenuOpen ? ' active' : ''}`}
          style={{ top: hoverBlock.top + 2, left: hoverBlock.left - 42 }}
          onMouseEnter={() => {
            clearTimeout(hoverCloseTimerRef.current)
            hoverOpenTimerRef.current = setTimeout(() => {
              blockMenuOpenRef.current = true
              setBlockMenuOpen(true)
            }, 250)
          }}
          onMouseLeave={closeMenuSoon}
        >
          <span className="para-handle-t">T</span>
          <span className="para-handle-dots"><Icon name="dots" size={12} /></span>
        </div>
      )}
      {hoverBlock && blockMenuOpen && (
        <div
          className="menu para-handle-menu"
          style={{ top: hoverBlock.top + 2, left: hoverBlock.left - 42 + 46 }}
          onMouseEnter={() => {
            clearTimeout(hoverOpenTimerRef.current)
            clearTimeout(hoverCloseTimerRef.current)
          }}
          onMouseLeave={closeMenuSoon}
        >
          {[['paragraph', '正文'], ['h1', '标题 1'], ['h2', '标题 2'], ['h3', '标题 3'], ['h4', '标题 4'], ['h5', '标题 5'], ['h6', '标题 6']].map(([v, label]) => {
            const active = v === 'paragraph'
              ? !['1', '2', '3', '4', '5', '6'].some((l) => editor?.isActive('heading', { level: Number(l) }))
              : editor?.isActive('heading', { level: Number(v[1]) })
            return (
              <button
                key={v}
                className={`menu-item${active ? ' active' : ''}`}
                onClick={() => handleBlockAction(v === 'paragraph' ? 0 : Number(v[1]))}
              >
                <span>{label}</span>
                {active && <span className="menu-item-check">✓</span>}
              </button>
            )
          })}
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => handleBlockAction(null)}>
            <span>删除此块</span>
          </button>
        </div>
      )}
      <BubbleBar editor={editor} pos={bubblePos} onAi={onAi} />
      {/* AI 内联 diff 接受卡片 */}
      {aiInline && <AiAcceptCard editor={editor} diff={aiInline} onResolve={onResolveInline} />}
      <div className="page-wrap" ref={wrapRef}>
        <EditorContent editor={editor} className={`page${paged ? ' paged' : ''}`} />
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
