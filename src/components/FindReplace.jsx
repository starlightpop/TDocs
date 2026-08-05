import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { findTextMatches } from '../lib/search.js'
import { setSearchHighlights } from '../extensions/SearchHighlight.js'

export default function FindReplace({ editor, onClose }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
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
    <div className="find-replace" role="dialog" aria-label="查找和替换">
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
