// 浮动改写输入框：模型菜单仅展示已配置厂商；支持流式输出 + 中断 + 双栏差异预览 + 多选区批量改写。
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, listConfiguredApiConfigs, saveApiConfig, streamLLM, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'
import { getProvider } from '../lib/aiProviders.js'
import { diffWords, applyAcceptText } from '../lib/diff.js'
import { joinChunksWithMarker, splitHtmlByMarker, reconcileChunks } from '../lib/multiSelection.js'
import { loadTemplates, recordRecentPrompt, BUILTIN_PROMPTS } from '../lib/templates.js'

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

function splitParagraphs(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  const blocks = [...d.body.children].filter((el) => el.tagName === 'P' || /^H[1-6]$/.test(el.tagName))
  if (blocks.length === 0) return [{ html: d.body.innerHTML }]
  return blocks.map((el) => el.outerHTML)
}

function countTokens(text) {
  if (!text) return 0
  const en = (text.match(/[A-Za-z0-9_]+/g) || []).length
  const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return en + zh
}

const QUICK_LABEL_OF = (v) => BUILTIN_PROMPTS.find((b) => b.value === v)?.label

export default function AiPrompt({ editor, selection, pos, onClose, onInlineDiff, multiRanges = null }) {
  const [text, setText] = useState('')
  const [withContext, setWithContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [accepted, setAccepted] = useState(new Set())
  const [cfg, setCfg] = useState(loadApiConfig)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [abortController, setAbortController] = useState(null)
  const [streamStats, setStreamStats] = useState({ tokens: 0, retries: 0, start: 0 })
  const [templates, setTemplates] = useState({ prompts: BUILTIN_PROMPTS })
  const [showRecents, setShowRecents] = useState(false)
  const promptRef = useRef(null)

  const selectionHtml = useMemo(() => getSelectionHtml(editor, selection), [editor, selection])
  const fullHtml = useMemo(() => editor?.getHTML?.() || '', [editor])
  const configured = useMemo(() => listConfiguredApiConfigs(), [modelMenuOpen, cfg.provider, cfg.model])
  const provider = getProvider(cfg.provider)
  const useMulti = Array.isArray(multiRanges) && multiRanges.length > 1

  useEffect(() => {
    let cancelled = false
    loadTemplates().then((data) => { if (!cancelled) setTemplates(data) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!modelMenuOpen) return undefined
    const close = (event) => {
      if (!event.target.closest?.('.ai-model-picker')) setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', close, true)
    return () => document.removeEventListener('mousedown', close, true)
  }, [modelMenuOpen])

  const chooseModel = (profile, model) => {
    const next = { ...profile, model }
    saveApiConfig(next)
    setCfg(next)
    setModelMenuOpen(false)
  }

  const cancelStream = useRef(() => {})
  cancelStream.current = () => {
    setAbortController((current) => {
      if (current) {
        try { current.abort() } catch { /* ignore */ }
      }
      return null
    })
    setLoading(false)
    setStreamStats({ tokens: 0, retries: 0, start: 0 })
  }

  // Esc / ⌘. 快速中断
  useEffect(() => {
    const onKey = (e) => {
      if (!loading) return
      if (e.key === 'Escape') { e.preventDefault(); cancelStream.current?.() }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); cancelStream.current?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading])

  const stopAndReset = () => {
    cancelStream.current?.()
    setResult(null)
    setAccepted(new Set())
    setError('')
  }

  const collectParagraphRanges = () => {
    if (!editor) return []
    const ranges = []
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph') ranges.push({ from: p, to: p + node.nodeSize })
    })
    return ranges
  }

  const insertAtPartIndex = (partIdx, html) => {
    if (!editor) return
    const ranges = collectParagraphRanges()
    const range = ranges[partIdx]
    if (!range) return
    editor.chain().focus().insertContentAt(range, html).run()
  }

  const runSingle = async (instruction) => {
    const controller = new AbortController()
    setAbortController(controller)
    setStreamStats({ tokens: 0, retries: 0, start: Date.now() })
    setResult(null)
    setAccepted(new Set())

    if (useMulti && multiRanges.length > 1) {
      // 多选区批量改写
      const chunks = multiRanges.map((r) => getSelectionHtml(editor, r))
      const systemPrompt = [
        '你是一个文档编辑助手。用户将提供一段含占位符的合并文本，每段以 HTML 注释 <!--TDOCS_SPLIT i--> 标记段号（i 从 0 起）。',
        '请按相同顺序输出每段改写后的 HTML，段间同样使用 <!--TDOCS_SPLIT i--> 注释隔开。',
        '只允许使用的标签：p/h1-h6/ul/ol/li/strong/em/u/s/blockquote/pre/code/a/table。',
        '直接输出 HTML，不要输出任何解释或 markdown 代码块包裹。',
      ].join(' ')
      const userPrompt = `改写指令：${instruction}\n\n待改写段落（按顺序）：\n${joinChunksWithMarker(chunks)}`
      try {
        await streamLLM(cfg, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], {
          stream: loadStreamPref(),
          signal: controller.signal,
          onChunk: (delta) => {
            setStreamStats((s) => ({ ...s, tokens: s.tokens + countTokens(delta) }))
            setResult((prev) => {
              const next = (prev?.rawBuffer || '') + delta
              const segments = splitHtmlByMarker(next)
              const reconciled = reconcileChunks(chunks, segments)
              const parts = reconciled.map((r, i) => ({
                old: chunks[i],
                new: sanitizeHtml(cleanLLMOutput(r.html)),
                status: r.status,
              }))
              return { mode: 'multi', parts, rawBuffer: next, newHtml: next }
            })
          },
          onError: (err, meta) => {
            if (meta?.retrying) setError(`网络/服务端错误，自动重试中：${err.message || 'NETWORK'}`)
            else setError((prev) => prev || `${err.message || err}（重试已耗尽）`)
            if (meta?.retrying) setStreamStats((s) => ({ ...s, retries: s.retries + 1 }))
          },
        })
      } finally {
        setAbortController(null)
        setLoading(false)
      }
      return
    }

    if (selection) {
      const sys = withContext
        ? '你是文档编辑助手。用户给出整篇文档和改写指令，请只改写选中的内容，直接输出改写后的内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
        : '你是文档编辑助手。用户给出选中内容和改写指令，请改写后直接输出内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
      const userMsg = withContext
        ? `改写指令：${instruction}\n\n整篇文档（上下文）：\n${fullHtml}\n\n请只改写"选中内容"并输出：\n${selectionHtml}`
        : `改写指令：${instruction}\n\n选中内容：\n${selectionHtml}`

      let buffer = ''
      try {
        await streamLLM(cfg, [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ], {
          stream: loadStreamPref(),
          signal: controller.signal,
          onChunk: (delta) => {
            buffer += delta
            setStreamStats((s) => ({ ...s, tokens: s.tokens + countTokens(delta) }))
            const newHtml = sanitizeHtml(cleanLLMOutput(buffer))
            setResult({ mode: 'inline', oldHtml: selectionHtml, newHtml, parts: [{ old: selectionHtml, new: newHtml }] })
          },
          onError: (err, meta) => {
            if (meta?.retrying) setError(`网络/服务端错误，自动重试中：${err.message || 'NETWORK'}`)
            else setError((prev) => prev || `${err.message || err}（重试已耗尽）`)
            if (meta?.retrying) setStreamStats((s) => ({ ...s, retries: s.retries + 1 }))
          },
        })
        if (buffer && !controller.signal.aborted) {
          const newHtml = sanitizeHtml(cleanLLMOutput(buffer))
          onInlineDiff?.({ oldHtml: selectionHtml, newHtml, range: { ...selection } })
        }
      } finally {
        setAbortController(null)
        setLoading(false)
      }
      return
    }

    // 全文档改写
    const sys = '你是文档编辑助手。请按指令改写整篇文档，直接输出完整修改后的 HTML（仅 p/h1-h6/ul/ol/li/strong/em/u/s 等基础标签），不要解释。'
    let buffer = ''
    try {
      await streamLLM(cfg, [
        { role: 'system', content: sys },
        { role: 'user', content: `改写指令：${instruction}\n\n文档内容：\n${fullHtml}` },
      ], {
        stream: loadStreamPref(),
        signal: controller.signal,
        onChunk: (delta) => {
          buffer += delta
          setStreamStats((s) => ({ ...s, tokens: s.tokens + countTokens(delta) }))
          const newHtml = sanitizeHtml(cleanLLMOutput(buffer))
          const oldParts = splitParagraphs(fullHtml)
          const newParts = splitParagraphs(newHtml)
          const parts = oldParts.map((old, index) => ({ old, new: newParts[index] || newParts[newParts.length - 1] || newHtml }))
          setResult({ mode: 'full', oldHtml: fullHtml, newHtml, parts, rawBuffer: buffer })
        },
        onError: (err, meta) => {
          if (meta?.retrying) setError(`网络/服务端错误，自动重试中：${err.message || 'NETWORK'}`)
          else setError((prev) => prev || `${err.message || err}（重试已耗尽）`)
          if (meta?.retrying) setStreamStats((s) => ({ ...s, retries: s.retries + 1 }))
        },
      })
    } finally {
      setAbortController(null)
      setLoading(false)
    }
  }

  const run = async () => {
    if (!cfg.apiKey?.trim()) {
      setError('尚未配置可用模型：请在右上角"设置 → AI 模型"中完成配置')
      return
    }
    const instruction = text.trim()
    if (!instruction) {
      setError('请输入改写要求，例如：换一种更有画面感的表达')
      return
    }
    setLoading(true)
    setError('')
    recordRecentPrompt(instruction).then((id) => {
      if (id) loadTemplates().then(setTemplates)
    })
    await runSingle(instruction)
  }

  const acceptPart = (partIdx) => {
    if (!editor || !result) return
    const part = result.parts?.[partIdx]
    if (!part) return
    insertAtPartIndex(partIdx, part.new)
    setAccepted((prev) => {
      const next = new Set(prev)
      next.add(partIdx)
      return next
    })
  }

  const acceptPartDiff = (partIdx, diff) => {
    if (!editor || !result) return
    const part = result.parts?.[partIdx]
    if (!part) return
    const acceptedText = applyAcceptText(diff)
    insertAtPartIndex(partIdx, acceptedText)
    setAccepted((prev) => {
      const next = new Set(prev)
      next.add(partIdx)
      return next
    })
  }

  const acceptAllDiffs = () => {
    if (!editor || !result) return
    const indices = result.parts.map((_, i) => i)
    indices.forEach((i) => {
      const part = result.parts[i]
      if (!part) return
      const oldText = textOf(part.old)
      const newText = textOf(part.new)
      const diff = diffWords(oldText, newText)
      insertAtPartIndex(i, applyAcceptText(diff))
    })
    setAccepted(new Set(['all']))
  }

  const undoAll = () => {
    if (!editor || !result?.oldHtml) return
    editor.chain().focus().setContent(result.oldHtml, true).run()
    onClose()
  }

  const applyAll = () => {
    if (!editor || !result) return
    if (result.mode === 'inline') {
      onInlineDiff?.({ oldHtml: result.oldHtml, newHtml: result.newHtml, range: { ...selection } })
      onClose()
      return
    }
    editor.chain().focus().setContent(result.newHtml, true).run()
    onClose()
  }

  const dragRef = useRef(null)
  const onDragStart = (e) => {
    if (e.target.closest('button, input, textarea, .ai-model-menu')) return
    const prompt = e.currentTarget.closest('.ai-prompt')
    if (!prompt) return
    const rect = prompt.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, el: prompt }
    const onMove = (ev) => {
      const state = dragRef.current
      if (!state) return
      state.el.style.left = `${ev.clientX - state.dx}px`
      state.el.style.top = `${ev.clientY - state.dy}px`
      state.el.style.transform = 'none'
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const width = Math.min(620, Math.max(380, window.innerWidth - 24))
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, pos.left - width / 2))
  const requestedTop = pos.anchor === 'above' ? pos.top - 360 : pos.top + 10
  const top = Math.max(12, Math.min(window.innerHeight - 360, requestedTop))
  const style = { top, left, width, transform: 'none' }

  const resultParts = result?.parts || []
  const recentPrompts = (templates?.prompts || []).filter((p) => !p.builtin)

  return createPortal(
    <div className="ai-prompt" style={style} ref={promptRef} onMouseDown={(event) => event.stopPropagation()}>
      <div className="ai-prompt-head" onMouseDown={onDragStart}>
        <span><Icon name="sparkle" size={13} />AI 改写{result ? ' · 结果' : loading ? ' · 正在改写' : ''}{useMulti ? ` · 多选区(${multiRanges.length})` : ''}</span>
        <div className="ai-prompt-head-actions">
          <div className="menu-wrap ai-model-picker">
            <button className="ai-model-btn" type="button" onClick={() => setModelMenuOpen((value) => !value)}>
              <span>{cfg.apiKey?.trim() ? `${provider.name} · ${cfg.model}` : '未配置模型'}</span>
              <Icon name="chevronDown" size={11} />
            </button>
            {modelMenuOpen && (
              <div className="menu ai-model-menu" onClick={(event) => event.stopPropagation()}>
                {configured.length ? configured.map((profile) => {
                  const item = getProvider(profile.provider)
                  const models = [profile.model]
                  return (
                    <div className="ai-model-group" key={profile.provider}>
                      <div className="settings-label">{item.name}</div>
                      {models.map((model) => (
                        <button key={`${profile.provider}:${model}`} className={`menu-item${cfg.provider === profile.provider && cfg.model === model ? ' active' : ''}`} onClick={() => chooseModel(profile, model)}>
                          <span>{model}</span>
                          {cfg.provider === profile.provider && cfg.model === model && <span className="menu-item-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )
                }) : <div className="ai-model-empty">尚未配置厂商，请前往设置。</div>}
              </div>
            )}
          </div>
          <button className="icon-btn" data-tip="关闭" onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
      </div>

      {!result && !loading ? (
        <>
          <div className="ai-quick-actions" aria-label="常用 AI 指令">
            {(templates?.prompts || BUILTIN_PROMPTS).map((p) => (
              <button key={p.id} className="ai-quick-action" type="button" onClick={() => setText(p.value)}>
                {QUICK_LABEL_OF(p.value) || p.label}
              </button>
            ))}
          </div>
          {recentPrompts.length > 0 && (
            <div className="ai-recent-wrap">
              <button className="ai-recent-toggle" onClick={() => setShowRecents((v) => !v)}>
                最近使用 · {recentPrompts.length} 条 {showRecents ? '▴' : '▾'}
              </button>
              {showRecents && (
                <div className="ai-recent-list">
                  {recentPrompts.map((p) => (
                    <button key={p.id} className="ai-recent-item" onClick={() => setText(p.value)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <textarea
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
          {selection && <label className="ai-prompt-ctx"><input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />联系上下文改写</label>}
          {withContext && selection && <div className="ai-prompt-warn">⚠ 将上传整篇文档作为上下文，消耗大量 Token</div>}
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">⌘/Ctrl+Enter</span>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? '改写中…' : '开始'}</button>
          </div>
        </>
      ) : loading ? (
        <>
          <div className="ai-prompt-streaming">
            <div className="ai-prompt-streaming-status">
              <span className="ai-prompt-dot" />
              正在改写…（已收到 {streamStats.tokens} tokens{streamStats.retries ? `，已重试 ${streamStats.retries} 次` : ''}）
            </div>
            {result?.newHtml && (
              <div className="ai-prompt-streaming-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanLLMOutput(result.newHtml)) }} />
            )}
            {error && <div className="ai-error ai-prompt-error">{error}</div>}
          </div>
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">⌘/Ctrl+. 中断 · Esc 停止</span>
            <button className="btn btn-danger" onClick={stopAndReset}>停止</button>
          </div>
        </>
      ) : (
        <>
          <div className="ai-result-view">
            <div className="ai-result-view-hint">
              {useMulti
                ? `多选区共 ${resultParts.length} 段，可逐段接受差异`
                : `共 ${resultParts.length} 段，可逐段接受差异`}
            </div>
            {resultParts.map((part, index) => {
              const oldText = textOf(part.old)
              const newText = textOf(part.new)
              const diff = diffWords(oldText, newText)
              return (
                <div key={index} className="ai-diff">
                  <div className="ai-diff-pair">
                    <div className="ai-diff-col ai-diff-col-old">
                      <div className="ai-diff-col-label">原文</div>
                      <div className="ai-diff-col-body">
                        {oldText ? <DiffSide diff={diff} mode="old" /> : '（空段）'}
                      </div>
                    </div>
                    <div className="ai-diff-col ai-diff-col-new">
                      <div className="ai-diff-col-label">改写</div>
                      <div className="ai-diff-col-body">
                        {newText ? <DiffSide diff={diff} mode="new" /> : '（空）'}
                      </div>
                    </div>
                  </div>
                  <div className="ai-diff-actions">
                    <DiffStats diff={diff} />
                    <button
                      className="ai-diff-accept"
                      disabled={accepted.has(index) || accepted.has('all')}
                      onClick={() => acceptPartDiff(index, diff)}
                    >
                      {accepted.has(index) ? '✓ 已接受差异' : '接受差异'}
                    </button>
                    {part.status === 'fallback' && <span className="ai-diff-warn">第 {index + 1} 段改写失败，已回退原文</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">{Math.round((result.newHtml?.length || 0) / 100) / 10}KB</span>
            <button className="btn" onClick={stopAndReset}>返回修改</button>
            {accepted.size < resultParts.length && !accepted.has('all') && (
              <button className="btn" onClick={acceptAllDiffs}>全部接受</button>
            )}
            {accepted.size > 0 && result.oldHtml && (
              <button className="btn" onClick={undoAll}>全部撤销</button>
            )}
            <button className="btn btn-primary" onClick={applyAll}>全部替换</button>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

function DiffSide({ diff, mode }) {
  if (!diff?.length) return null
  const out = []
  let i = 0
  for (const d of diff) {
    if (d.type === 'eq') {
      out.push(<span key={i++}>{d.text}</span>)
    } else if (d.type === 'del' && mode === 'old') {
      out.push(<s key={i++} className="ai-diff-del">{d.text}</s>)
    } else if (d.type === 'add' && mode === 'new') {
      out.push(<ins key={i++} className="ai-diff-add">{d.text}</ins>)
    }
  }
  return out
}

function DiffStats({ diff }) {
  let add = 0
  let del = 0
  let eq = 0
  for (const d of diff) {
    if (d.type === 'add') add += d.text.length
    else if (d.type === 'del') del += d.text.length
    else eq += d.text.length
  }
  return <span className="ai-diff-stat">eq {eq} · +{add} · -{del}</span>
}
