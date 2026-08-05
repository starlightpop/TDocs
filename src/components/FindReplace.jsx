import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { findTextMatches } from '../lib/search.js'
import { setSearchHighlights } from '../extensions/SearchHighlight.js'

const STORE_KEY = 'inkdocs.findReplace.v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore invalid local state */ }
  return { query: '', replacement: '', caseSensitive: false }
}

export default function FindReplace({ editor, onClose }) {
  const initial = useRef(loadState()).current
  const [query, setQuery] = useState(initial.query || '')
  const [replacement, setReplacement] = useState(initial.replacement || '')
  const [caseSensitive, setCaseSensitive] = useState(Boolean(initial.caseSensitive))
  const [matches, setMatches] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)

  const refresh = useCallback(() => {
    if (!editor || !query) {
      setMatches([])
      setActiveIndex(-1)
      return
    }
    const next = findTextMatches(editor.state.doc, query, caseSensitive)
    setMatches(next)
    setActiveIndex((current) => {
      if (!next.length) return -1
      return current >= 0 && current < next.length ? current : 0
    })
  }, [editor, query, caseSensitive])

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ query, replacement, caseSensitive }))
  }, [query, replacement, caseSensitive])

  useEffect(() => {
    refresh()
    if (!editor) return undefined
    editor.on('update', refresh)
    return () => editor.off('update', refresh)
  }, [editor, refresh])

  useEffect(() => {
    setSearchHighlights(editor, matches, activeIndex)
    return () => setSearchHighlights(editor, [], -1)
  }, [editor, matches, activeIndex])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const move = (delta) => {
    if (!matches.length || !editor) return
    const nextIndex = (activeIndex + delta + matches.length) % matches.length
    const range = matches[nextIndex]
    setActiveIndex(nextIndex)
    editor.chain().focus().setTextSelection(range).scrollIntoView().run()
  }

  const replaceCurrent = () => {
    if (!editor || activeIndex < 0 || !matches[activeIndex]) return
    const range = matches[activeIndex]
    editor.chain().focus().insertContentAt(range, replacement).run()
  }

  const replaceAll = () => {
    if (!editor || !matches.length) return
    let tr = editor.state.tr
    for (const range of [...matches].sort((a, b) => b.from - a.from)) {
      tr = tr.insertText(replacement, range.from, range.to)
    }
    editor.view.dispatch(tr.scrollIntoView())
  }

  return (
    <div className="find-replace find-replace-dock" role="search" aria-label="查找和替换">
      <div className="find-row">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          placeholder="查找"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') move(event.shiftKey ? -1 : 1)
            if (event.key === 'Escape') onClose()
          }}
        />
        <span className="find-count">{matches.length ? `${Math.max(0, activeIndex) + 1}/${matches.length}` : '0/0'}</span>
        <button className="icon-btn" data-tip="上一个" disabled={!matches.length} onClick={() => move(-1)}>↑</button>
        <button className="icon-btn" data-tip="下一个" disabled={!matches.length} onClick={() => move(1)}>↓</button>
        <button className="icon-btn" data-tip="关闭" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="replace-row">
        <Icon name="edit" size={16} />
        <input
          value={replacement}
          placeholder="替换为"
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') replaceCurrent()
            if (event.key === 'Escape') onClose()
          }}
        />
        <button className="btn" disabled={activeIndex < 0} onClick={replaceCurrent}>替换</button>
        <button className="btn" disabled={!matches.length} onClick={replaceAll}>全部替换</button>
      </div>
      <label className="find-option">
        <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
        区分大小写
      </label>
    </div>
  )
}
