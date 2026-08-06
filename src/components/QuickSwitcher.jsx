// ⌘P / ⌘K 跨文档搜索：浮层 + 键盘导航。
// - 实时按标题 / 正文匹配
// - 空查询时显示最近 8 篇
// - 选中后跳到文档并把光标定位到匹配位置

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icons.jsx'
import { searchDocs, splitHighlight, findContentPosition } from '../lib/quickSearch.js'
import { formatTime } from '../lib/storage.js'

function snippetRender(text, query) {
  if (!text) return null
  const segments = splitHighlight(text, query)
  return (
    <>
      {segments.map((segment, i) => segment.match
        ? <mark key={i} className="quick-snippet-mark">{segment.text}</mark>
        : <span key={i}>{segment.text}</span>)}
    </>
  )
}

export default function QuickSwitcher({ docs, query: initialQuery = '', onClose, onPick }) {
  const [query, setQuery] = useState(initialQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const results = useMemo(() => searchDocs(docs, query, { recentLimit: 8 }), [docs, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-qs-index="${activeIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const hit = results[activeIndex]
        if (hit) onPick?.(hit.doc, hit.kind === 'content' ? findContentPosition(hit.doc.content, query) : 0)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [results, activeIndex, query, onPick, onClose])

  // 浮层定位：屏幕中上
  const width = 560
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, window.innerWidth / 2 - width / 2))
  const top = Math.max(64, Math.min(window.innerHeight - 80, window.innerHeight * 0.18))

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="quick-switcher-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <section className="quick-switcher" style={{ top, left, width }} role="dialog" aria-label="快速跳转">
        <div className="quick-switcher-input-row">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或正文…"
            spellCheck={false}
            onKeyDown={(e) => { /* 浮层不抢 Enter 之外的字符键 */ }}
          />
          <span className="quick-switcher-hint">↑↓ 选择 · ↵ 跳转 · Esc 关闭</span>
        </div>
        <div className="quick-switcher-list" ref={listRef}>
          {results.length === 0 && (
            <div className="quick-switcher-empty">没有匹配的文档</div>
          )}
          {results.map((hit, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={hit.doc.id}
                type="button"
                data-qs-index={i}
                className={`quick-switcher-item${isActive ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onPick?.(hit.doc, hit.kind === 'content' ? findContentPosition(hit.doc.content, query) : 0)}
              >
                <div className="quick-switcher-title">
                  {snippetRender(hit.doc.title || '无标题文档', query)}
                </div>
                <div className="quick-switcher-meta">
                  <span className={`quick-switcher-kind kind-${hit.kind}`}>
                    {hit.kind === 'title' ? '标题' : hit.kind === 'content' ? '正文' : '最近'}
                  </span>
                  {hit.doc.pinned && <span className="quick-switcher-pinned">置顶</span>}
                  <span className="quick-switcher-time">{formatTime(hit.doc.updatedAt)}</span>
                </div>
                {hit.snippet && (
                  <div className="quick-switcher-snippet">{snippetRender(hit.snippet, query)}</div>
                )}
              </button>
            )
          })}
        </div>
      </section>
    </div>,
    document.body,
  )
}
