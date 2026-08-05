import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight } from 'lowlight'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
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
import { canSplit } from '@tiptap/pm/transform'
import { looksLikeMarkdown, renderMarkdown } from '../lib/markdown.js'
import { extractHeadings } from '../lib/headings.js'
import ContextMenu from './ContextMenu.jsx'
import BubbleBar from './BubbleBar.jsx'
import { Icon } from './Icons.jsx'
import CodeTerminal from './CodeTerminal.jsx'
import { SearchHighlightExtension } from '../extensions/SearchHighlight.js'
import { CODE_LANGUAGES, getCodeLanguageLabel, getCodeCompletionCandidates, resolveCodeCompletion } from '../lib/codeLanguage.js'

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
      if (meta !== undefined) {
        return Array.isArray(meta) && meta.length
          ? DecorationSet.create(tr.doc, meta)
          : DecorationSet.empty
      }
      return set.map(tr.mapping, tr.doc)
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
  isolating: true,
  selectable: false,
  allowGapCursor: false,
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
        // 页间距属于画布，不属于可编辑内容。
        stopEvent: (event) => event.target === wrap,
        destroy: () => { currentNode = null },
      }
    }
  },
})


// ---------- 显式分页符：Word 文件可通过 ⌘/Ctrl+Enter 或“添加页面”插入 ----------
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: () => ['div', { 'data-page-break': 'true', class: 'manual-page-break', contenteditable: 'false' }, ['span', {}, '分页符']],
  addCommands() {
    return {
      insertPageBreak: () => ({ commands }) => commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() }
  },
})

// ---------- 代码块：语法高亮、连续行号、当前行高亮与块内运行 ----------
const lowlight = createLowlight()
lowlight.register('c', c)
lowlight.register('cpp', cpp)
lowlight.register('java', java)
lowlight.register('javascript', javascript)
lowlight.register('python', python)
lowlight.register('rust', rust)
lowlight.register('matlab', matlab)
const createCodeId = () => `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const countCodeLines = (text) => Math.max(1, String(text || '').split('\n').length)

const CodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineStart: {
        default: 1,
        parseHTML: (element) => Number(element.dataset.lineStart || 1),
        renderHTML: (attrs) => ({ 'data-line-start': attrs.lineStart || 1 }),
      },
      continued: {
        default: false,
        parseHTML: (element) => element.dataset.continued === 'true',
        renderHTML: (attrs) => (attrs.continued ? { 'data-continued': 'true' } : {}),
      },
      codeId: {
        default: null,
        parseHTML: (element) => element.dataset.codeId || null,
        renderHTML: (attrs) => (attrs.codeId ? { 'data-code-id': attrs.codeId } : {}),
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive('codeBlock')) return false
        return this.editor.commands.insertContent('\n')
      },
      Tab: () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const language = $from.parent.attrs.language || 'plaintext'
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
        const completion = resolveCodeCompletion(language, before)
        if (!completion) {
          view.dispatch(state.tr.insertText('  '))
          return true
        }
        const from = state.selection.from - completion.replaceLength
        let tr = state.tr.insertText(completion.insert, from, state.selection.from)
        const cursor = from + completion.insert.length - (completion.cursorBack || 0)
        tr = tr.setSelection(TextSelection.create(tr.doc, cursor))
        view.dispatch(tr)
        return true
      },
      Escape: () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent('tdocs:hide-code-completions'))
        return false
      },
      'Mod-c': () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const depth = $from.depth
        const after = $from.after(depth)
        const next = state.doc.nodeAt(after)
        let tr = state.tr
        if (next?.type.name !== 'paragraph') tr = tr.insert(after, state.schema.nodes.paragraph.create())
        const target = Math.min(tr.doc.content.size, after + 1)
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(target))).scrollIntoView()
        view.dispatch(tr)
        return true
      },
    }
  },
  addNodeView() {
    return ({ node: initialNode, getPos, view }) => {
      let node = initialNode
      const shell = document.createElement('div')
      shell.className = 'code-block-shell'
      const head = document.createElement('div')
      head.className = 'code-block-head'
      head.contentEditable = 'false'
      const title = document.createElement('span')
      title.className = 'code-block-title'
      const actions = document.createElement('div')
      actions.className = 'code-block-head-actions'
      const select = document.createElement('select')
      select.className = 'code-language-select'
      select.setAttribute('aria-label', '代码语言')
      for (const [value, label] of CODE_LANGUAGES) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        select.append(option)
      }
      const runButton = document.createElement('button')
      runButton.type = 'button'
      runButton.className = 'code-run-btn'
      runButton.title = '运行整个逻辑代码块'
      runButton.textContent = '▶ 运行'
      select.addEventListener('change', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: select.value }))
      })
      runButton.addEventListener('click', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const rect = shell.getBoundingClientRect()
        shell.dispatchEvent(new CustomEvent('tdocs:run-code', {
          bubbles: true,
          detail: {
            pos,
            codeId: node.attrs.codeId || null,
            code: node.textContent,
            language: node.attrs.language || 'plaintext',
            anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
          },
        }))
      })
      actions.append(select, runButton)
      head.append(title, actions)

      const pre = document.createElement('pre')
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'
      const code = document.createElement('code')
      pre.append(gutter, code)

      const completionMenu = document.createElement('div')
      completionMenu.className = 'code-completion-menu'
      completionMenu.hidden = true

      const footer = document.createElement('div')
      footer.className = 'code-block-footer'
      footer.contentEditable = 'false'
      footer.textContent = 'Tab 补全 · ⌘C / Ctrl+C 退出代码块'
      shell.append(head, pre, footer, completionMenu)

      const syncActiveLine = () => {
        const spans = [...gutter.children]
        spans.forEach((span) => span.classList.remove('active'))
        const pos = getPos()
        if (typeof pos !== 'number') return
        const from = view.state.selection.from
        const start = pos + 1
        const end = start + node.content.size
        if (from < start || from > end) return
        const offset = Math.max(0, Math.min(node.content.size, from - start))
        const before = node.textBetween(0, offset, '\n', '\n')
        const lineIndex = (before.match(/\n/g) || []).length
        spans[lineIndex]?.classList.add('active')
      }



      const applyCompletion = (candidate) => {
        const { state } = view
        const { empty, from } = state.selection
        if (!empty || !candidate) return
        const start = Math.max(0, from - candidate.replaceLength)
        let tr = state.tr.insertText(candidate.insert, start, from)
        const cursor = start + candidate.insert.length - (candidate.cursorBack || 0)
        tr = tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView()
        view.dispatch(tr)
        completionMenu.hidden = true
      }

      const renderCompletions = () => {
        const pos = getPos()
        const { state } = view
        if (typeof pos !== 'number' || !state.selection.empty) { completionMenu.hidden = true; return }
        const start = pos + 1
        const end = start + node.content.size
        if (state.selection.from < start || state.selection.from > end) { completionMenu.hidden = true; return }
        const offset = Math.max(0, Math.min(node.content.size, state.selection.from - start))
        const before = node.textBetween(0, offset, '\n', '\n')
        const candidates = getCodeCompletionCandidates(node.attrs.language || 'plaintext', before)
        if (!candidates.length) { completionMenu.hidden = true; return }
        completionMenu.replaceChildren(...candidates.map((candidate, index) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = `code-completion-item${index === 0 ? ' active' : ''}`
          const label = document.createElement('strong')
          label.textContent = candidate.label
          const detail = document.createElement('span')
          detail.textContent = candidate.detail || ''
          button.append(label, detail)
          button.addEventListener('mousedown', (event) => { event.preventDefault(); applyCompletion(candidate) })
          return button
        }))
        const caret = view.coordsAtPos(state.selection.from)
        const rect = shell.getBoundingClientRect()
        completionMenu.style.left = `${Math.max(44, Math.min(rect.width - 240, caret.left - rect.left))}px`
        completionMenu.style.top = `${Math.max(40, caret.bottom - rect.top + 4)}px`
        completionMenu.hidden = false
      }

      const render = () => {
        const count = countCodeLines(node.textContent)
        const start = Math.max(1, Number(node.attrs.lineStart) || 1)
        gutter.replaceChildren(...Array.from({ length: count }, (_, index) => {
          const span = document.createElement('span')
          span.textContent = String(start + index)
          return span
        }))
        select.value = node.attrs.language || 'plaintext'
        title.textContent = node.attrs.continued ? '代码 · 续' : '代码'
        shell.dataset.language = getCodeLanguageLabel(select.value)
        shell.dataset.codeId = node.attrs.codeId || ''
        shell.classList.toggle('continued', Boolean(node.attrs.continued))
        syncActiveLine()
        requestAnimationFrame(renderCompletions)
      }
      const onSelection = () => { syncActiveLine(); requestAnimationFrame(renderCompletions) }
      const hideCompletions = () => { completionMenu.hidden = true }
      view.dom.addEventListener('tdocs:code-selection', onSelection)
      view.dom.addEventListener('tdocs:hide-code-completions', hideCompletions)
      render()
      return {
        dom: shell,
        contentDOM: code,
        update: (nextNode) => {
          if (nextNode.type.name !== 'codeBlock') return false
          node = nextNode
          render()
          return true
        },
        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer')),
        destroy: () => {
          view.dom.removeEventListener('tdocs:code-selection', onSelection)
          view.dom.removeEventListener('tdocs:hide-code-completions', hideCompletions)
        },
      }
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

export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, onSelectionRange, aiSelection = null, aiInline = null, onResolveInline, layoutKey = '', visualScale = 1 }) {
  const saveTimer = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [terminalRun, setTerminalRun] = useState(null)
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
  const reflowingRef = useRef(false)
  const modeRef = useRef(paged)
  const layoutKeyRef = useRef(layoutKey)
  const pagedRef = useRef(paged)
  pagedRef.current = paged

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        gapcursor: false,
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
      PageBreak,
      AiOldMark,
      AiNewMark,
      AiSelPlugin,
      SearchHighlightExtension,
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content: doc?.content || '',
    editorProps: {
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

  useEffect(() => {
    if (!editor) return undefined
    const root = editor.view.dom
    const handleRun = async (event) => {
      const detail = event.detail || {}
      let code = detail.code || ''
      if (detail.codeId) {
        const fragments = []
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'codeBlock' && node.attrs.codeId === detail.codeId) fragments.push({ pos, text: node.textContent })
        })
        if (fragments.length) code = fragments.sort((a, b) => a.pos - b.pos).map((item) => item.text).join('\n')
      }
      const id = `${Date.now()}-${Math.random()}`
      const base = { id, running: true, ok: true, stdout: '', stderr: '', language: detail.language || 'plaintext', anchor: detail.anchor }
      setTerminalRun(base)
      if (!window.tdocs?.runCode) {
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ok: false, stderr: '代码运行仅在 TDocs 桌面应用中可用。' } : current)
        return
      }
      try {
        const result = await window.tdocs.runCode({ language: base.language, code })
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ...result } : current)
      } catch (error) {
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ok: false, stderr: String(error?.message || error) } : current)
      }
    }
    root.addEventListener('tdocs:run-code', handleRun)
    return () => root.removeEventListener('tdocs:run-code', handleRun)
  }, [editor])

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

  const mergeCodeNodes = (left, right, schema) => {
    const leftText = left.textContent || ''
    const rightText = right.textContent || ''
    const separator = !leftText || !rightText || leftText.endsWith('\n') || rightText.startsWith('\n') ? '' : '\n'
    const text = `${leftText}${separator}${rightText}`
    return left.type.create(
      { ...left.attrs, codeId: left.attrs.codeId || right.attrs.codeId || createCodeId(), lineStart: Math.max(1, Number(left.attrs.lineStart) || 1), continued: Boolean(left.attrs.continued) },
      text ? schema.text(text) : null,
    )
  }

  const flattenBlocks = (state) => {
    const blocks = []
    state.doc.forEach((node) => {
      if (node.type.name === 'page') node.forEach((child) => blocks.push(child))
      else blocks.push(node)
    })
    const merged = []
    for (const node of blocks) {
      const previous = merged[merged.length - 1]
      if (node.type.name === 'codeBlock' && node.attrs.continued && previous?.type.name === 'codeBlock') {
        merged[merged.length - 1] = mergeCodeNodes(previous, node, state.schema)
      } else {
        merged.push(node)
      }
    }
    return merged
  }

  const dispatchLayout = (view, tr) => {
    reflowingRef.current = true
    view.dispatch(tr)
    queueMicrotask(() => { reflowingRef.current = false })
  }

  // 保存时合并跨页代码块，持久化为一个逻辑代码块。
  const getSaveHtml = () => {
    if (!editor) return ''
    if (!paged || editor.state.doc.firstChild?.type.name !== 'page') return editor.getHTML()
    const blocks = flattenBlocks(editor.state)
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
  const buildPagesFromBlocks = (state, blocks) => {
    const pages = []
    let current = []
    const flush = () => {
      pages.push(state.schema.nodes.page.create(null, current.length ? current : [state.schema.nodes.paragraph.create()]))
      current = []
    }
    for (const block of blocks) {
      current.push(block)
      if (block.type.name === 'pageBreak') flush()
    }
    if (current.length || pages.length === 0) flush()
    return pages
  }

  const toPaged = (rebuild = false) => {
    if (!editor) return
    const { state, view } = editor
    if (!rebuild && state.doc.firstChild?.type.name === 'page') return
    const blocks = flattenBlocks(state)
    const pages = buildPagesFromBlocks(state, blocks)
    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pages))
  }
  const toWide = () => {
    if (!editor) return
    const { state, view } = editor
    if (state.doc.firstChild?.type.name !== 'page') return
    const blocks = flattenBlocks(state)
    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]
    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, content))
  }
  // 溢出重排：按真实纸张内容区测量。文本块跨页时先在可见行末拆分，再移动尾部。
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
      const prefix = child.textBetween(0, offset, '\n', '\n')
      const lineEnd = prefix.lastIndexOf('\n')
      if (lineEnd > 0) candidate = start + lineEnd + 1
    }
    while (candidate > start && !canSplit(state.doc, candidate)) candidate -= 1
    if (candidate <= start || candidate >= end || !canSplit(state.doc, candidate)) return null
    return candidate
  }

  const splitCodeBlockAcrossPages = (state, view, pagePos, child, childPos, splitPos) => {
    const text = child.textContent || ''
    const rawOffset = Math.max(1, splitPos - (childPos + 1))
    const cut = text.lastIndexOf('\n', Math.min(text.length - 1, rawOffset))
    if (cut <= 0 || cut >= text.length - 1) return false
    const beforeText = text.slice(0, cut)
    const afterText = text.slice(cut + 1)
    const startLine = Math.max(1, Number(child.attrs.lineStart) || 1)
    const codeId = child.attrs.codeId || createCodeId()
    const consumedLines = beforeText.split('\n').length
    const first = child.type.create(
      { ...child.attrs, codeId, lineStart: startLine },
      beforeText ? state.schema.text(beforeText) : null,
    )
    const second = child.type.create(
      { ...child.attrs, codeId, lineStart: startLine + consumedLines, continued: true },
      afterText ? state.schema.text(afterText) : null,
    )
    let tr = state.tr.replaceWith(childPos, childPos + child.nodeSize, first)
    const currentPage = tr.doc.nodeAt(pagePos)
    const nextPos = pagePos + currentPage.nodeSize
    const nextPage = tr.doc.nodeAt(nextPos)
    if (nextPage?.type.name === 'page') {
      const firstNext = nextPage.firstChild
      if (firstNext?.type.name === 'codeBlock' && firstNext.attrs.continued) {
        const healedNext = firstNext.type.create({ ...firstNext.attrs, codeId, continued: true }, firstNext.content, firstNext.marks)
        const merged = mergeCodeNodes(second, healedNext, state.schema)
        tr = tr.replaceWith(nextPos + 1, nextPos + 1 + firstNext.nodeSize, merged)
      } else {
        tr = tr.insert(nextPos + 1, second)
      }
    } else tr = tr.insert(nextPos, state.schema.nodes.page.create(null, second))
    dispatchLayout(view, tr)
    return true
  }

  const normalizeCodeFragments = (state, view) => {
    if (state.doc.firstChild?.type.name !== 'page') return false
    let changed = false
    let previousLogical = null
    const pages = []
    state.doc.forEach((page) => {
      if (page.type.name !== 'page') { pages.push(page); previousLogical = null; return }
      const children = []
      page.forEach((node) => {
        if (node.type.name !== 'codeBlock') {
          children.push(node)
          previousLogical = null
          return
        }
        const wantsContinuation = Boolean(node.attrs.continued)
        const codeId = node.attrs.codeId || (wantsContinuation ? previousLogical?.codeId : null) || createCodeId()
        const continued = wantsContinuation && Boolean(previousLogical)
        const lineStart = continued ? previousLogical.nextLine : 1
        let normalized = node.type.create({ ...node.attrs, codeId, continued, lineStart }, node.content, node.marks)
        const previousOnPage = children[children.length - 1]
        if (continued && previousOnPage?.type.name === 'codeBlock' && previousOnPage.attrs.codeId === codeId) {
          normalized = mergeCodeNodes(previousOnPage, normalized, state.schema)
          children[children.length - 1] = normalized
          changed = true
        } else {
          children.push(normalized)
        }
        if (node.attrs.codeId !== codeId || Boolean(node.attrs.continued) !== continued || Number(node.attrs.lineStart || 1) !== lineStart) changed = true
        const normalizedStart = Math.max(1, Number(normalized.attrs.lineStart) || 1)
        previousLogical = { codeId, nextLine: normalizedStart + countCodeLines(normalized.textContent) }
      })
      pages.push(page.type.create(page.attrs, children))
    })
    if (!changed) return false
    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pages))
    return true
  }


  const enforceManualPageBreaks = (state, view) => {
    let pagePos = 0
    for (let pageIndex = 0; pageIndex < state.doc.childCount; pageIndex += 1) {
      const page = state.doc.child(pageIndex)
      if (page.type.name !== 'page') { pagePos += page.nodeSize; continue }
      const children = []
      page.forEach((child) => children.push(child))
      const breakIndex = children.findIndex((child) => child.type.name === 'pageBreak')
      if (breakIndex >= 0 && breakIndex < children.length - 1) {
        const left = children.slice(0, breakIndex + 1)
        const right = children.slice(breakIndex + 1)
        const replacement = [
          state.schema.nodes.page.create(page.attrs, left),
          state.schema.nodes.page.create(null, right.length ? right : [state.schema.nodes.paragraph.create()]),
        ]
        dispatchLayout(view, state.tr.replaceWith(pagePos, pagePos + page.nodeSize, replacement))
        return true
      }
      pagePos += page.nodeSize
    }
    return false
  }

  // 删除内容后，后页内容应像 Word 一样自动向前回流。
  // 整块能放下时直接前移；文本块至少能容纳一行时先前移，再由溢出逻辑在行末拆开。
  const pullForward = (state, view) => {
    const pages = []
    state.doc.forEach((node, pos) => {
      if (node.type.name === 'page') pages.push({ node, pos })
    })

    for (let index = 0; index < pages.length - 1; index += 1) {
      const current = pages[index]
      const next = pages[index + 1]
      if (current.node.lastChild?.type.name === 'pageBreak') continue
      const currentDom = view.nodeDOM(current.pos)
      const currentPage = currentDom?.matches?.('[data-page]')
        ? currentDom
        : currentDom?.querySelector?.('[data-page]')
      if (!currentPage || !next.node.firstChild) continue

      const first = next.node.firstChild
      if (next.node.childCount === 1 && first.isTextblock && first.textContent.length === 0) {
        view.dispatch(state.tr.delete(next.pos, next.pos + next.node.nodeSize))
        return true
      }

      const last = current.node.lastChild
      const lastPos = current.pos + 1 + current.node.content.size - last.nodeSize
      const lastDom = view.nodeDOM(lastPos)
      const firstDom = view.nodeDOM(next.pos + 1)
      const lastRect = lastDom?.getBoundingClientRect?.()
      const firstRect = firstDom?.getBoundingClientRect?.()
      if (!lastRect || !firstRect) continue

      const remaining = getPageContentBottom(currentPage) - lastRect.bottom
      const lineHeight = Number.parseFloat(getComputedStyle(firstDom).lineHeight) || 24
      const fitsWhole = firstRect.height <= remaining + 1
      if (!fitsWhole) continue

      const currentChildren = []
      const nextChildren = []
      current.node.forEach((child) => currentChildren.push(child))
      next.node.forEach((child, _offset, childIndex) => {
        if (childIndex > 0) nextChildren.push(child)
      })

      const previous = currentChildren[currentChildren.length - 1]
      if (first.type.name === 'codeBlock' && first.attrs.continued && previous?.type.name === 'codeBlock') {
        currentChildren[currentChildren.length - 1] = mergeCodeNodes(previous, first, state.schema)
      } else {
        currentChildren.push(first)
      }
      const replacementPages = [
        state.schema.nodes.page.create(current.node.attrs, currentChildren),
      ]
      if (nextChildren.length) {
        replacementPages.push(state.schema.nodes.page.create(next.node.attrs, nextChildren))
      }

      dispatchLayout(
        view,
        state.tr.replaceWith(
          current.pos,
          next.pos + next.node.nodeSize,
          replacementPages,
        ),
      )
      return true
    }
    return false
  }

  const reflow = () => {
    if (!editor || !paged) return false
    const { view, state } = editor
    if (enforceManualPageBreaks(state, view)) return true
    if (normalizeCodeFragments(state, view)) return true
    let target = null
    state.doc.descendants((node, pos) => {
      if (target || node.type.name !== 'page') return
      const dom = view.nodeDOM(pos)
      if (!dom) return
      const pageEl = dom.nodeType === 1 && dom.matches('[data-page]') ? dom : dom.querySelector('[data-page]')
      if (!pageEl) return
      if (pageEl.scrollHeight - pageEl.clientHeight > 2) target = { node, pos, pageEl }
    })
    if (!target) return pullForward(state, view)

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
        if (firstOverflow.child.type.name === 'codeBlock') {
          return splitCodeBlockAcrossPages(state, view, pos, firstOverflow.child, firstOverflow.childPos, splitPos)
        }
        dispatchLayout(view, state.tr.split(splitPos))
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
    dispatchLayout(view, tr)
    return true
  }
  // 每一帧只执行一次分页事务，等待 DOM 完成布局后再测量下一页。
  // 旧实现使用同步 while 连续 dispatch，后续测量读取的是旧 DOM，容易产生空页、卡顿和错误分页。
  const runReflow = () => {
    cancelAnimationFrame(reflowRafRef.current)
    const runId = ++reflowRunRef.current
    let steps = 0
    const seen = new Set()
    const step = () => {
      if (runId !== reflowRunRef.current || !editor || !paged) return
      const signature = []
      editor.state.doc.forEach((page) => {
        const parts = []
        page.forEach((child) => parts.push(`${child.type.name}:${child.textContent.length}:${child.attrs?.lineStart || ''}:${child.attrs?.continued || ''}:${child.attrs?.codeId || ''}`))
        signature.push(parts.join(','))
      })
      const key = signature.join('|')
      if (seen.has(key)) return
      seen.add(key)
      const changed = reflow()
      steps += 1
      if (changed && steps < 120) {
        reflowRafRef.current = requestAnimationFrame(step)
      }
    }
    reflowRafRef.current = requestAnimationFrame(step)
  }

  // 版式切换先将内容还原为单一逻辑流，再按目标纸张重新分页。
  useEffect(() => {
    if (!editor) return
    const enteringPaged = paged && !modeRef.current
    const layoutChanged = paged && layoutKeyRef.current !== layoutKey
    reflowRunRef.current += 1
    cancelAnimationFrame(reflowRafRef.current)
    if (paged) {
      toPaged(enteringPaged || layoutChanged)
      requestAnimationFrame(() => {
        if (enteringPaged && canvasRef.current) {
          canvasRef.current.scrollTop = 0
          canvasRef.current.scrollLeft = 0
        }
        runReflow()
      })
    } else {
      toWide()
    }
    modeRef.current = paged
    layoutKeyRef.current = layoutKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, editor, layoutKey])

  // 编辑时实时重排（输入导致溢出自动分页）
  useEffect(() => {
    if (!editor || !paged) return
    const schedule = () => { if (!reflowingRef.current) runReflow() }
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
  }, [editor, paged, layoutKey, visualScale])

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

  // AI 面板打开后使用请求发起时保存的范围，不受后续光标移动影响。
  useEffect(() => {
    if (!editor) return
    const max = editor.state.doc.content.size
    const from = Math.max(0, Math.min(max, Number(aiSelection?.from)))
    const to = Math.max(from, Math.min(max, Number(aiSelection?.to)))
    const decos = Number.isFinite(from) && Number.isFinite(to) && from < to
      ? [Decoration.inline(from, to, { class: 'ai-sel-highlight' })]
      : []
    editor.view.dispatch(editor.state.tr.setMeta(aiSelKey, decos))
  }, [aiSelection, editor])

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

  // 浏览器开发模式使用自绘菜单；Electron 正式版使用系统原生编辑菜单。
  const buildCtxItems = () => {
    if (!editor) return []
    const chain = () => editor.chain().focus()
    const { $from, $to } = editor.state.selection
    const inCode = $from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock'
    const pasteText = async () => {
      const text = await window.tdocs?.readClipboardText?.() ?? await navigator.clipboard.readText()
      if (!text) return
      const { state, view } = editor
      view.dispatch(state.tr.insertText(text).scrollIntoView())
    }
    const selectAll = () => {
      if (!inCode) { chain().selectAll().run(); return }
      const { state, view } = editor
      const depth = $from.depth
      const start = $from.before(depth) + 1
      const end = start + $from.parent.content.size
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
    }
    const base = [
      { label: '撤销', shortcut: '⌘Z', icon: <Icon name="undo" size={15} />, disabled: !editor.can().undo(), action: () => chain().undo().run() },
      { label: '重做', shortcut: '⌘⇧Z', icon: <Icon name="redo" size={15} />, disabled: !editor.can().redo(), action: () => chain().redo().run() },
      { sep: true },
      { label: '剪切', shortcut: '⌘X', icon: <Icon name="edit" size={15} />, action: () => document.execCommand('cut') },
      { label: '复制', shortcut: '⌘C', icon: <Icon name="doc" size={15} />, action: () => document.execCommand('copy') },
      { label: '粘贴', shortcut: '⌘V', icon: <Icon name="paste" size={15} />, action: pasteText },
      { label: '全选', shortcut: '⌘A', icon: <Icon name="doc" size={15} />, action: selectAll },
    ]
    if (inCode) return base
    return [
      ...base,
      { sep: true },
      { label: '加粗', icon: <Icon name="bold" size={15} />, action: () => chain().toggleBold().run() },
      { label: '斜体', icon: <Icon name="italic" size={15} />, action: () => chain().toggleItalic().run() },
      { label: '高亮', icon: <Icon name="highlight" size={15} />, action: () => chain().toggleHighlight().run() },
      { label: '清除格式', icon: <Icon name="eraser" size={15} />, action: () => chain().clearNodes().unsetAllMarks().run() },
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
    onSelectionRange?.(from !== to ? { from, to } : null)
    editor.view.dom.dispatchEvent(new CustomEvent('tdocs:code-selection'))
    const { $from, $to } = editor.state.selection
    const inCode = $from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock'
    if (from === to || inCode) { setBubblePos(null); return }
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
        if (paged) return
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
        if (window.tdocs) return
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <CodeTerminal run={terminalRun} onClose={() => setTerminalRun(null)} />
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
      {paged && (
        <button className="add-word-page" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus('end').insertPageBreak().run()}>
          <Icon name="plus" size={14} />添加页面
        </button>
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildCtxItems()} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
