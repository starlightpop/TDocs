import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { scrollToHeadingByIndex, setHeadingsLevel } from '../lib/headings.js'

/**
 * 大纲面板
 * - 单击：跳转到标题
 * - ⌘(Mac)/Ctrl(Win) + 点击：多选 / 取消选择
 * - Shift + 点击：从锚点范围选择
 * - 鼠标按住拖拽：框选一段标题
 */
export default function Outline({ headings, editor, activeIndex, onJump, onClose }) {
  const [selected, setSelected] = useState(() => new Set())
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const listRef = useRef(null)

  const rangeSet = (a, b) => {
    const s = new Set()
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) s.add(i)
    return s
  }

  const indexFromEvent = (e) => {
    const row = e.target.closest('.outline-row')
    return row ? Number(row.dataset.idx) : null
  }

  const onItemMouseDown = (e, i) => {
    if (e.button !== 0) return
    const additive = e.metaKey || e.ctrlKey
    if (e.shiftKey) {
      const anchor = dragRef.current?.anchor ?? i
      setSelected(rangeSet(anchor, i))
      e.preventDefault()
      return
    }
    if (additive) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        return next
      })
      dragRef.current = { anchor: i, additive: true, moved: false }
    } else {
      dragRef.current = { anchor: i, additive: false, moved: false, fromBlank: false }
      setSelected(new Set([i]))
    }
    setDragging(true)
    e.preventDefault()
  }

  // 从空白区域按下：以最近的一行为起点开始拖拽选择
  const nearestIndex = (clientY) => {
    const rows = listRef.current?.querySelectorAll('.outline-row')
    if (!rows?.length) return null
    let best = 0
    let bestDist = Infinity
    rows.forEach((r, i) => {
      const rect = r.getBoundingClientRect()
      const d = Math.abs(clientY - (rect.top + rect.height / 2))
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }

  const onListMouseDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('.outline-row')) return // 行内由 onItemMouseDown 处理
    const i = nearestIndex(e.clientY)
    if (i == null) return
    dragRef.current = { anchor: i, additive: false, moved: false, fromBlank: true }
    setSelected(new Set([i]))
    setDragging(true)
    e.preventDefault()
  }

  const onListMouseMove = (e) => {
    const st = dragRef.current
    if (!st || !(e.buttons & 1)) return
    const j = indexFromEvent(e)
    if (j == null || st.additive) return
    if (j !== st.anchor) st.moved = true
    setSelected(rangeSet(st.anchor, j))
  }

  // 拖拽结束时：若无拖动且无修饰键且起点在行上 → 视为单击跳转
  useEffect(() => {
    if (!dragging) return
    const up = (e) => {
      const st = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (st && !st.moved && !st.additive && !st.fromBlank && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        jump(st.anchor)
      }
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const jump = (i) => {
    scrollToHeadingByIndex(editor, i)
    onJump?.(i)
  }

  const selectAll = () => {
    setSelected(selected.size === headings.length ? new Set() : new Set(headings.map((_, i) => i)))
  }

  const applyLevel = (level) => {
    setHeadingsLevel(editor, [...selected].sort((a, b) => a - b), level)
    setSelected(new Set())
  }

  return (
    <aside className="outline-panel">
      <div className="outline-header">
        <span>大纲 {headings.length ? `(${headings.length})` : ''}</span>
        <div className="outline-header-actions">
          <button
            className="icon-btn"
            title={selected.size === headings.length && headings.length ? '取消全选' : '全选'}
            onClick={selectAll}
          >
            <Icon name="taskList" size={15} />
          </button>
          <button className="icon-btn" title="关闭大纲" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="outline-actions">
          <span className="outline-actions-label">
            已选 {selected.size} 项
            <button className="outline-clear" onClick={() => setSelected(new Set())}>清除</button>
          </span>
          <button className="btn" onClick={() => applyLevel(1)}>标题1</button>
          <button className="btn" onClick={() => applyLevel(2)}>标题2</button>
          <button className="btn" onClick={() => applyLevel(3)}>标题3</button>
          <button className="btn" onClick={() => applyLevel(null)}>正文</button>
        </div>
      ) : (
        headings.length > 0 && (
          <div className="outline-hint">拖拽或 ⌘/Ctrl+点击可多选标题</div>
        )
      )}

      <div
        ref={listRef}
        className={`outline-list${dragging ? ' dragging' : ''}`}
        onMouseMove={onListMouseMove}
        onMouseDown={onListMouseDown}
      >
        {headings.length === 0 && (
          <div className="outline-empty">暂无标题，使用「标题 1/2/3」样式后可在此快速跳转</div>
        )}
        {headings.map((h, i) => (
          <div
            key={`${i}-${h.text}`}
            data-idx={i}
            className={`outline-row${i === activeIndex ? ' active' : ''}${selected.has(i) ? ' selected' : ''}`}
            onMouseDown={(e) => onItemMouseDown(e, i)}
          >
            <span className={`outline-item lv-${h.level}`} title={h.text}>
              {h.text}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}
