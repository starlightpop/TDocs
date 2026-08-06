// / 命令面板：飞书云文档风格。
// 触发：在 paragraph / heading 中输入 / 时弹出浮层，浮层 portal 到 document.body。
// 文本过滤：用户在编辑器里继续输入字符时，浮层跟随 query 实时过滤。
// 键盘：↑/↓ 移动，Enter 确认，Esc 关闭，Backspace 在空 query 时等同 Esc。
//
// 位置由调用方传入（coordsAtPos），文本输入时由 Editor 上层刷新 query。

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icons.jsx'
import { groupFilteredCommands, indexToCommand } from '../lib/slashCommands.js'

const ICON_MAP = {
  paragraph: 'edit',
  h1: 'bold', h2: 'bold', h3: 'bold', h4: 'bold', h5: 'bold', h6: 'bold',
  ul: 'bulletList', ol: 'orderedList', task: 'taskList',
  quote: 'quote', code: 'codeBlock', hr: 'hr',
  image: 'image', link: 'link', table: 'table',
  'ai-polish': 'sparkle', 'ai-concise': 'sparkle', 'ai-expand': 'sparkle', 'ai-formal': 'sparkle', 'ai-casual': 'sparkle',
  clear: 'eraser', find: 'search', history: 'undo', export: 'download',
}

function pickIcon(id) {
  return ICON_MAP[id] || 'doc'
}

// 通过 editor 命令链把描述性的 run 翻译成真实副作用。
// 返回 true 表示命令已执行。
function executeCommand(editor, command, helpers = {}) {
  if (!editor || !command) return false
  const chain = editor.chain().focus()
  switch (command.run) {
    case 'setParagraph':
      chain.setParagraph().run()
      return true
    case 'setHeading':
      chain.setHeading({ level: command.runArgs?.level || 1 }).run()
      return true
    case 'toggleBulletList':
      chain.toggleBulletList().run()
      return true
    case 'toggleOrderedList':
      chain.toggleOrderedList().run()
      return true
    case 'toggleTaskList':
      chain.toggleTaskList().run()
      return true
    case 'toggleBlockquote':
      chain.toggleBlockquote().run()
      return true
    case 'setCodeBlock':
      chain.setCodeBlock().run()
      return true
    case 'setHorizontalRule':
      chain.setHorizontalRule().run()
      return true
    case 'insertTable':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      return true
    case 'promptImage': {
      const url = window.prompt('输入图片地址', 'https://')
      if (url) chain.setImage({ src: url }).run()
      return true
    }
    case 'promptLink': {
      const url = window.prompt('输入链接地址', 'https://')
      if (url && url !== 'https://') chain.extendMarkRange('link').setLink({ href: url }).run()
      return true
    }
    case 'aiQuickAction': {
      // 浮层无法直接调用 AiPrompt（它挂在 App 层），通过回调通知外部。
      helpers.onAi?.(command.runArgs?.preset)
      return true
    }
    case 'clearFormat':
      chain.clearNodes().unsetAllMarks().run()
      return true
    case 'openFind':
      helpers.onOpenFind?.()
      return true
    case 'openHistory':
      helpers.onOpenHistory?.()
      return true
    case 'openExport':
      helpers.onOpenExport?.()
      return true
    default:
      return false
  }
}

export default function SlashMenu({
  editor,
  triggerPos,
  coords,
  query,
  onClose,
  onAi,
  onOpenFind,
  onOpenHistory,
  onOpenExport,
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef(null)
  // 记录"用户用 ↑/↓ 移动过高亮"，避免输入新字符时光标跳到列表
  const navigatedRef = useRef(false)

  const grouped = useMemo(
    () => groupFilteredCommands(query),
    [query],
  )
  const flatCount = useMemo(
    () => grouped.reduce((n, bucket) => n + bucket.items.length, 0),
    [grouped],
  )

  // query 变化时：重置高亮
  useEffect(() => {
    if (!navigatedRef.current) setActiveIndex(0)
    navigatedRef.current = false
  }, [query])

  // 监听键盘：↑/↓/Enter/Esc
  useEffect(() => {
    const onKey = (e) => {
      if (!flatCount) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          // 空结果时也允许 Esc 关闭
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose?.()
          }
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        navigatedRef.current = true
        setActiveIndex((i) => (i + 1) % flatCount)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        navigatedRef.current = true
        setActiveIndex((i) => (i - 1 + flatCount) % flatCount)
      } else if (e.key === 'Enter') {
        // 仅当菜单内 activeIndex 有效时拦截 Enter
        const found = indexToCommand(grouped, activeIndex)
        if (found) {
          e.preventDefault()
          e.stopPropagation()
          runCommand(found.command)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
      } else if (e.key === 'Backspace' && !query) {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, activeIndex, flatCount, query, editor, triggerPos])

  // 滚动到当前 active 项
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-slash-index="${activeIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // 失焦自动关闭（飞书行为）
  useEffect(() => {
    const onFocusOut = (e) => {
      // 延后一拍判断，让点击菜单的 mousedown 先派发
      setTimeout(() => {
        const root = listRef.current
        if (!root) return
        const active = document.activeElement
        if (active && root.contains(active)) return
        if (active && active.closest?.('.editor-content')) return
        // 真实失焦（切换到 devtools / 其他面板）才关闭
        if (active === document.body) onClose?.()
      }, 80)
    }
    window.addEventListener('blur', onFocusOut)
    return () => window.removeEventListener('blur', onFocusOut)
  }, [onClose])

  if (!editor || !triggerPos || !coords) return null

  const runCommand = (command) => {
    // 删除触发字符 "/" + 任何用户已经输入的 query 字符
    try {
      const endPos = triggerPos + 1 + (query?.length || 0)
      const tr = editor.state.tr.delete(triggerPos, Math.min(endPos, editor.state.doc.content.size))
      editor.view.dispatch(tr)
    } catch { /* 兼容位置变动 */ }
    const ok = executeCommand(editor, command, { onAi, onOpenFind, onOpenHistory, onOpenExport })
    if (ok) onClose?.()
  }

  // 浮层定位：紧贴 caret 下方；空间不足时上浮。
  const width = 340
  const estimatedHeight = Math.min(420, 56 + flatCount * 30 + 40)
  const top = coords.bottom + 6
  const safeTop = top + estimatedHeight > window.innerHeight - 8
    ? Math.max(8, coords.top - estimatedHeight - 6)
    : top
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, coords.left))

  let absoluteIndex = -1

  return createPortal(
    <div
      className="slash-menu"
      style={{ top: safeTop, left, width }}
      onMouseDown={(e) => e.preventDefault() /* 不要抢走编辑器焦点 */}
      ref={listRef}
    >
      <div className="slash-menu-head">
        <span className="slash-menu-query">/{query || ''}</span>
        <span className="slash-menu-hint">↑↓ 选择 · ↵ 确认 · Esc 关闭</span>
      </div>
      <div className="slash-menu-list">
        {!flatCount && (
          <div className="slash-menu-empty">没有匹配的命令。试试 “代码”、“ai” 或 “表格”。</div>
        )}
        {grouped.map((bucket) => (
          <div className="slash-menu-group" key={bucket.id}>
            <div className="slash-menu-group-label">{bucket.label}</div>
            {bucket.items.map((command) => {
              absoluteIndex += 1
              const idx = absoluteIndex
              const isActive = idx === activeIndex
              return (
                <button
                  key={command.id}
                  type="button"
                  data-slash-index={idx}
                  className={`menu-item${isActive ? ' active' : ''}`}
                  onMouseEnter={() => { navigatedRef.current = true; setActiveIndex(idx) }}
                  onClick={() => runCommand(command)}
                >
                  <Icon name={pickIcon(command.id)} size={15} />
                  <span>{command.title}</span>
                  {isActive && <span className="slash-menu-enter">↵</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// 工具：从分组结果反查 active 命令（供 Editor 内部键盘事件统一调度）。
export function resolveActiveCommand(grouped, activeIndex) {
  return indexToCommand(grouped, activeIndex)?.command || null
}

export { groupFilteredCommands, indexToCommand }
