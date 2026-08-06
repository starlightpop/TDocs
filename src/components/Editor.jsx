import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Extension, Mark, mergeAttributes, markInputRule } from '@tiptap/core'
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
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { looksLikeMarkdown, renderMarkdown, shouldPreferMarkdownPaste } from '../lib/markdown.js'
import { extractHeadings } from '../lib/headings.js'
import { storage as idbStorage } from '../lib/idb.js'
import { compressImageFile, renderImageTag, makeImageId, shouldCompress, resolveTdocsImages } from '../lib/imageCompress.js'
import ContextMenu from './ContextMenu.jsx'
import BubbleBar from './BubbleBar.jsx'
import { Icon } from './Icons.jsx'
import CodeTerminal from './CodeTerminal.jsx'
import { SearchHighlightExtension } from '../extensions/SearchHighlight.js'
import SlashMenu from './SlashMenu.jsx'
import { isValidTriggerContext } from '../lib/slashCommands.js'
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

// 粘贴内容统一判断链：Cmd+V（handlePaste 原生事件）与右键菜单共用同一套识别逻辑。
// Markdown 优先 → 多行纯文本按段落 → 其余返回 false（由调用方决定原生处理或兜底插入）。
function applyPasteData(view, { text = '', html = '' } = {}) {
  if (text && shouldPreferMarkdownPaste(text, html)) {
    insertMarkdownText(view, text, null)
    return true
  }
  if (!html && text?.includes('\n')) {
    const paras = text
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => `<p>${escapeHtmlText(l) || '<br>'}</p>`)
      .join('')
    insertHtmlContent(view, paras, null)
    return true
  }
  return false
}

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


// ---------- Markdown 直接输入识别 ----------
// StarterKit 已处理标题、列表、引用、分割线与代码围栏；这里补齐行内 Markdown。
const MarkdownTyping = Extension.create({
  name: 'markdownTyping',
  addInputRules() {
    const marks = this.editor.schema.marks
    return [
      markInputRule({ find: /(?:^|\s)((?:\*\*)((?:[^*\n]+))(?:\*\*))$/, type: marks.bold }),
      markInputRule({ find: /(?:^|\s)((?:__)((?:[^_\n]+))(?:__))$/, type: marks.bold }),
      markInputRule({ find: /(?:^|\s)((?:\*)((?:[^*\n]+))(?:\*))$/, type: marks.italic }),
      markInputRule({ find: /(?:^|\s)((?:_)((?:[^_\n]+))(?:_))$/, type: marks.italic }),
      markInputRule({ find: /(?:^|\s)((?:~~)((?:[^~\n]+))(?:~~))$/, type: marks.strike }),
      markInputRule({ find: /(?:^|\s)((?:`)((?:[^`\n]+))(?:`))$/, type: marks.code }),
    ].filter((rule) => Boolean(rule))
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
const countCodeLines = (text) => Math.max(1, String(text || '').split('\n').length)

const CodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
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
      'Shift-Tab': () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const lineStart = state.selection.from - $from.parent.textBetween(0, $from.parentOffset, '\n', '\n').split('\n').at(-1).length
        const lineText = $from.parent.textBetween(lineStart - $from.start(), $from.parentOffset, '\n', '\n')
        const remove = lineText.startsWith('  ') ? 2 : lineText.startsWith('\t') ? 1 : 0
        if (!remove) return true
        view.dispatch(state.tr.delete(lineStart, lineStart + remove))
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
      runButton.title = '运行当前代码块'
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
            code: node.textContent,
            language: node.attrs.language || 'plaintext',
            anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
          },
        }))
      })
      actions.append(select, runButton)
      head.append(title, actions)

      const body = document.createElement('div')
      body.className = 'code-block-body'
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'
      const scroller = document.createElement('div')
      scroller.className = 'code-scroll'
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.className = 'code-editable'
      pre.append(code)
      scroller.append(pre)
      body.append(gutter, scroller)

      const completionMenu = document.createElement('div')
      completionMenu.className = 'code-completion-menu'
      completionMenu.hidden = true

      const footer = document.createElement('div')
      footer.className = 'code-block-footer'
      footer.contentEditable = 'false'
      footer.textContent = 'Tab 补全 · Shift+Tab 减少缩进 · ⌘C / Ctrl+C 退出代码块'
      shell.append(head, body, footer, completionMenu)

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
        const start = 1
        gutter.replaceChildren(...Array.from({ length: count }, (_, index) => {
          const span = document.createElement('span')
          span.textContent = String(start + index)
          return span
        }))
        select.value = node.attrs.language || 'plaintext'
        title.textContent = '代码'
        shell.dataset.language = getCodeLanguageLabel(select.value)
        syncActiveLine()
        requestAnimationFrame(renderCompletions)
      }
      const onSelection = () => { syncActiveLine(); requestAnimationFrame(renderCompletions) }
      const hideCompletions = () => { completionMenu.hidden = true }
      const onDocumentPointerDown = (event) => {
        if (!shell.contains(event.target)) hideCompletions()
      }
      view.dom.addEventListener('tdocs:code-selection', onSelection)
      view.dom.addEventListener('tdocs:hide-code-completions', hideCompletions)
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
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
        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer, .code-completion-menu')),
        ignoreMutation: (mutation) => !code.contains(mutation.target),
        destroy: () => {
          view.dom.removeEventListener('tdocs:code-selection', onSelection)
          view.dom.removeEventListener('tdocs:hide-code-completions', hideCompletions)
          document.removeEventListener('pointerdown', onDocumentPointerDown, true)
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

export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, onMultiAi, onSelection, onSelectionRange, aiSelection = null, aiInline = null, onResolveInline, onOpenFind, onOpenHistory, onOpenExport }) {
  const saveTimer = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [terminalRun, setTerminalRun] = useState(null)
  const wrapRef = useRef(null)
  // 选中文字浮动条位置
  const [bubblePos, setBubblePos] = useState(null)
  const canvasRef = useRef(null)
  // / 命令面板状态
  const [slashMenu, setSlashMenu] = useState(null) // {triggerPos, coords, query}

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用带行号的自定义 CodeBlock
      }),
      CodeBlock,
      MarkdownTyping,
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
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0]
        if (!file) return false
        const coords = { left: event.clientX, top: event.clientY }
        if (file.type.startsWith('image/')) {
          event.preventDefault()
          insertImageWithStorage(file).then((id) => {
            if (!id) return
            const { from } = view.posAtCoords(coords) || {}
            if (from != null) {
              const html = renderImageTag(id, file.name)
              const tmp = document.createElement('div')
              tmp.innerHTML = html
              const dom = tmp.firstElementChild
              if (dom && view.state.schema.nodes.image) {
                const src = `tdocs://img/${id}`
                view.dispatch(view.state.tr.insert(from, view.state.schema.nodes.image.create({ src, alt: file.name })))
              }
            }
          }).catch(() => {})
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
        // 剪贴板常同时带 text/plain 与 text/html；与右键粘贴共用同一判断链
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        if (applyPasteData(view, { text, html })) {
          event.preventDefault()
          return true
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
      // 内容保存：不再在编辑器内做 600ms 防抖——持续输入时 onChange 永远不触发，
      // 导致内容一直不落盘而 UI 却显示“已保存”。改为每次更新立即上报，
      // 由 App 层做“防抖 + 节流”双保险（空闲 800ms 保存 / 持续输入每 2s 强制保存）。
      onChange?.(ed.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return undefined
    const root = editor.view.dom
    const handleRun = async (event) => {
      const detail = event.detail || {}
      const code = detail.code || ''
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

  // 外部内容回填：启动加载 / 恢复快照等场景，App 层把 localStorage/IDB 全文填进 docs 后，
  // Editor 需把新内容同步进来。自己输入产生的内容（getHTML 已等于 doc.content）不回灌，避免光标跳动。
  useEffect(() => {
    if (!editor) return
    const html = doc?.content || ''
    if (editor.getHTML() === html) return
    // 仅在编辑器当前内容确实落后于外部时回填（emitUpdate=false，不回环上报）
    editor.commands.setContent(html, false)
    // 回填不触发 onUpdate，手动补一次统计与大纲
    onStats?.({
      words: editor.storage.characterCount.words(),
      chars: editor.storage.characterCount.characters(),
    })
    onHeadings?.(extractHeadings(editor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc?.id, doc?.content])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (editor) onChange?.(editor.getHTML())
  }, [editor, onChange])

  useEffect(() => {
    const canvas = canvasRef.current
    const page = wrapRef.current?.querySelector('.document-page')
    if (!canvas || !page) return undefined

    const updateViewportReserve = () => {
      const viewport = Math.max(480, canvas.clientHeight || 0)
      page.style.setProperty('--editor-viewport-height', `${Math.ceil(viewport)}px`)
    }

    updateViewportReserve()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateViewportReserve) : null
    observer?.observe(canvas)
    return () => observer?.disconnect()
  }, [editor, doc?.id])

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

  // / 命令面板：检测 `/` 输入，更新 trigger 位置 + query + 浮层位置
  useEffect(() => {
    if (!editor) return undefined
    const onTransaction = () => {
      const { state } = editor
      const { from } = state.selection
      if (from === state.selection.to) {
        // 空选区：尝试匹配光标前最近的 `/`
        const lookback = Math.min(40, from)
        const text = state.doc.textBetween(Math.max(0, from - lookback), from, '\n', '\n')
        const slashIdx = text.lastIndexOf('/')
        if (slashIdx >= 0) {
          const triggerPos = from - (text.length - slashIdx)
          const after = text.slice(slashIdx + 1)
          // 触发字符后不能包含空白或换行
          if (!/[\s\n]/.test(after)) {
            const { $from } = state.selection
            const inCode = $from.parent.type.name === 'codeBlock'
            const valid = isValidTriggerContext({
              beforeText: text.slice(0, slashIdx),
              inCodeBlock: inCode,
              hasSelection: false,
            })
            if (valid) {
              try {
                const coords = editor.view.coordsAtPos(from)
                setSlashMenu({ triggerPos, query: after, coords: { top: coords.top, bottom: coords.bottom, left: coords.left } })
                return
              } catch { /* 坐标解析失败不弹 */ }
            }
          }
        }
      }
      setSlashMenu(null)
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  // 编辑器统一使用中文自绘菜单；普通输入框由 Electron 提供中文原生菜单。
  const buildCtxItems = () => {
    if (!editor) return []
    const chain = () => editor.chain().focus()
    const { $from, $to } = editor.state.selection
    const inCode = $from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock'
    const pasteText = async () => {
      const text = await window.tdocs?.readClipboardText?.() ?? await navigator.clipboard.readText()
      const html = await window.tdocs?.readClipboardHTML?.() ?? ''
      if (!text && !html) return
      const { state, view } = editor
      // 代码块内粘贴一律纯文本（不解析 Markdown/HTML）
      if (inCode) {
        view.dispatch(state.tr.insertText(text).scrollIntoView())
        return
      }
      // 与 Cmd+V 同一套判断链：Markdown → 多行分段 → 富文本 HTML → 纯文本兜底
      if (applyPasteData(view, { text, html })) return
      if (html) {
        const frag = document.createRange().createContextualFragment(html)
        const parsed = PMDOMParser.fromSchema(view.state.schema).parse(frag)
        if (parsed && parsed.content.size > 0) {
          view.dispatch(state.tr.replaceSelection(parsed).scrollIntoView())
          return
        }
      }
      if (text) view.dispatch(state.tr.insertText(text).scrollIntoView())
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
      <CodeTerminal run={terminalRun} onClose={() => setTerminalRun(null)} />
      <BubbleBar editor={editor} pos={bubblePos} onAi={onAi} onMultiAi={onMultiAi} />
      {/* AI 内联 diff 接受卡片 */}
      {aiInline && <AiAcceptCard editor={editor} diff={aiInline} onResolve={onResolveInline} />}
      {/* / 命令面板 */}
      {slashMenu && (
        <SlashMenu
          editor={editor}
          triggerPos={slashMenu.triggerPos}
          coords={slashMenu.coords}
          query={slashMenu.query}
          onClose={() => setSlashMenu(null)}
          onAi={onAi}
          onOpenFind={onOpenFind}
          onOpenHistory={onOpenHistory}
          onOpenExport={onOpenExport}
        />
      )}
      <div className="page-wrap" ref={wrapRef}>
        <EditorContent editor={editor} className="page document-page" />
          </div>
          {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildCtxItems()} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
