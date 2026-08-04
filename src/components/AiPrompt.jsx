// 浮动改写输入框（飞书式）：上下文选项、结果 diff 对照展示、可拖拽
import { useMemo, useRef, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, callLLM, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'

function getSelectionHtml(editor, selection) {
  if (!selection || !editor) return ''
  const frag = editor.state.doc.slice(selection.from, selection.to).content
  const dom = DOMSerializer.fromSchema(editor.state.schema).serializeFragment(frag)
  const tmp = document.createElement('div')
  tmp.appendChild(dom)
  return tmp.innerHTML
}

function textOf(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim()
}

// 按段落拆分 HTML（用于全文分段对照）
function splitParagraphs(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  const blocks = [...d.body.children].filter((el) => el.tagName === 'P' || /^H[1-6]$/.test(el.tagName))
  if (blocks.length === 0) return [{ html: d.body.innerHTML }]
  return blocks.map((el) => el.outerHTML)
}

export default function AiPrompt({ editor, selection, pos, onClose, onOpenConfig }) {
  const [text, setText] = useState('')
  const [withContext, setWithContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { oldHtml, newHtml, parts: [{old, new}], ranges }
  const [accepted, setAccepted] = useState(null) // 'all' | Set<partIdx>
  const [dragging, setDragging] = useState(null)
  const inputRef = useRef(null)

  const selectionHtml = useMemo(() => getSelectionHtml(editor, selection), [editor, selection])
  const fullHtml = useMemo(() => editor?.getHTML?.() || '', [editor])

  const run = async () => {
    const cfg = loadApiConfig()
    if (!cfg.apiKey.trim()) {
      setError('尚未配置 API Key：请先点击 ⚙ 完成 AI 配置')
      return
    }
    const instruction = text.trim()
    if (!instruction) {
      setError('请输入改写要求，例如：换一种更有画面感的表达')
      return
    }
    setLoading(true)
    setError('')
    const started = Date.now()
    try {
      // 单句模式：默认只上传选中内容；勾选上下文才附带整篇
      if (selection) {
        const sys = withContext
          ? '你是文档编辑助手。用户给出整篇文档和改写指令，请只改写选中的内容，直接输出改写后的内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
          : '你是文档编辑助手。用户给出选中内容和改写指令，请改写后直接输出内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
        const answer = await callLLM(cfg, [
          { role: 'system', content: sys },
          { role: 'user', content: withContext
            ? `改写指令：${instruction}\n\n整篇文档（上下文）：\n${fullHtml}\n\n请只改写“选中内容”并输出：\n${selectionHtml}`
            : `改写指令：${instruction}\n\n选中内容：\n${selectionHtml}` },
        ])
        const newHtml = sanitizeHtml(cleanLLMOutput(answer))
        setResult({ mode: 'selection', oldHtml: selectionHtml, newHtml })
      } else {
        // 全文模式
        const answer = await callLLM(cfg, [
          { role: 'system', content: '你是文档编辑助手。请按指令改写整篇文档，直接输出完整修改后的 HTML（仅 p/h1-h6/ul/ol/li/strong/em/u/s 等基础标签），不要解释。' },
          { role: 'user', content: `改写指令：${instruction}\n\n文档内容：\n${fullHtml}` },
        ])
        const newHtml = sanitizeHtml(cleanLLMOutput(answer))
        const oldParts = splitParagraphs(fullHtml)
        const newParts = splitParagraphs(newHtml)
        const parts = oldParts.map((old, i) => ({ old, new: newParts[i] || newParts[newParts.length - 1] || newHtml }))
        setResult({ mode: 'full', oldHtml: fullHtml, newHtml, parts })
      }
    } catch (e) {
      setError(`${e.message || String(e)}（耗时 ${Math.round((Date.now() - started) / 1000)}s）`)
    } finally {
      setLoading(false)
    }
  }

  // 应用替换：单句直接替换；全文按段接受
  const apply = (mode, partIdx) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (mode === 'selection') {
      chain.insertContentAt({ from: selection.from, to: selection.to }, result.newHtml).run()
    } else if (mode === 'part') {
      // 当场计算原文段落位置（替换过的段落已被新内容替换，重新取当前 doc）
      const ranges = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') ranges.push({ from: pos, to: pos + node.nodeSize })
      })
      const r = ranges[partIdx]
      if (r) chain.insertContentAt({ from: r.from, to: r.to }, result.parts[partIdx].new).run()
      setAccepted((prev) => { const s = new Set(prev === 'all' ? [] : prev || []); s.add(partIdx); return s })
    } else if (mode === 'all') {
      chain.setContent(result.newHtml, true).run()
    }
    if (mode === 'selection' || mode === 'all') onClose()
  }

  // 拖拽窗口
  const onDragStart = (e) => {
    const rect = e.currentTarget.closest('.ai-prompt').getBoundingClientRect()
    setDragging({ dx: e.clientX - rect.left, dy: e.clientY - rect.top, origLeft: rect.left, origTop: rect.top, rect })
    const onMove = (ev) => {
      const el = e.currentTarget.closest('.ai-prompt')
      el.style.left = `${ev.clientX - dragging.dx}px`
      el.style.top = `${ev.clientY - dragging.dy}px`
      el.style.transform = 'none'
      el.style.marginLeft = '0'
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDragging(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const style = {
    top: pos.anchor === 'above' ? pos.top - 10 : pos.top + 10,
    left: pos.left,
    transform: 'translate(-50%, -100%)',
  }
  if (pos.anchor === 'below') style.transform = 'translate(-50%, 0)'

  return (
    <div className="ai-prompt" style={style}>
      <div className="ai-prompt-head" onMouseDown={onDragStart}>
        <span><Icon name="sparkle" size={13} />AI 改写{result ? ' · 结果' : ''}</span>
        <span className="ai-prompt-head-actions">
          <button className="icon-btn" data-tip="AI 配置" onClick={onOpenConfig}>
            <Icon name="settings" size={13} />
          </button>
          <button className="icon-btn" data-tip="关闭" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </span>
      </div>

      {!result ? (
        <>
          <textarea
            ref={inputRef}
            className={`ai-prompt-input${text.trim() ? ' filled' : ''}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={selection ? '输入改写要求，例如：更有画面感、更简练…' : '输入改写要求（未选中文字时将改写整篇文档）'}
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
              if (e.key === 'Escape') onClose()
            }}
          />
          {selection && (
            <label className="ai-prompt-ctx">
              <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
              联系上下文改写
            </label>
          )}
          {withContext && selection && (
            <div className="ai-prompt-warn">⚠ 将上传整篇文档作为上下文，消耗大量 Token</div>
          )}
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">⌘/Ctrl+Enter</span>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={run} disabled={loading}>
              {loading ? '改写中…' : '开始'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ai-result-view">
            {result.mode === 'selection' ? (
              <div className="ai-diff">
                <div className="ai-diff-old">{textOf(result.oldHtml) || '（原文）'}</div>
                <div className="ai-diff-arrow"><Icon name="chevronDown" size={12} /></div>
                <div className="ai-diff-new" dangerouslySetInnerHTML={{ __html: result.newHtml }} />
              </div>
            ) : (
              <>
                <div className="ai-result-view-hint">共 {result.parts.length} 段，可逐段接受</div>
                {result.parts.map((p, i) => (
                  <div key={i} className="ai-diff">
                    <div className="ai-diff-old">{textOf(p.old) || '（空段）'}</div>
                    <div className="ai-diff-arrow"><Icon name="chevronDown" size={12} /></div>
                    <div className="ai-diff-new" dangerouslySetInnerHTML={{ __html: p.new }} />
                    <button className="ai-diff-accept" disabled={accepted === 'all' || (accepted && accepted.has(i))} onClick={() => apply('part', i)}>
                      {accepted && accepted.has(i) ? '✓ 已接受' : '接受此段'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">{Math.round((result.newHtml?.length || 0) / 100) / 10}KB</span>
            <button className="btn" onClick={() => setResult(null)}>返回修改</button>
            {result.mode === 'full' ? (
              <>
                <button className="btn" onClick={() => apply('all')}>全部接受</button>
                <button className="btn btn-primary" onClick={() => apply('all')}>全部替换</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={onClose}>放弃</button>
                <button className="btn btn-primary" onClick={() => apply('selection')}>替换选中</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
