import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
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

export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection }) {
  const saveTimer = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [breakOffsets, setBreakOffsets] = useState([])
  const wrapRef = useRef(null)
  const pageMetaRef = useRef({ top: 64, left: 0, width: 0 })
  const lastPairsRef = useRef('')

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
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

  // 选中文字统计：选区变化时上报选中字符数（0 表示无选区）
  useEffect(() => {
    if (!editor) return
    const report = () => {
      const { from, to } = editor.state.selection
      onSelection?.(from !== to ? editor.state.doc.textBetween(from, to).length : 0)
    }
    editor.on('selectionUpdate', report)
    editor.on('transaction', report)
    return () => {
      editor.off('selectionUpdate', report)
      editor.off('transaction', report)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

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
      { label: 'AI 改写', icon: <Icon name="sparkle" size={15} />, action: () => onAi?.() },
    ]
  }

  return (
    <div
      className="canvas"
      onContextMenu={(e) => {
        if (!editor) return
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
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
