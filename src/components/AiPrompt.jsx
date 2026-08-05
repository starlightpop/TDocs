// 浮动改写输入框：上下文选项、模型切换、结果 diff 对照、可拖拽
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, saveApiConfig, callLLM, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'
import { PROVIDERS, getProvider } from '../lib/aiProviders.js'

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

export default function AiPrompt({ editor, selection, pos, onClose, onInlineDiff }) {
  const [text, setText] = useState('')
  const [withContext, setWithContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [accepted, setAccepted] = useState(null)
  const [cfg, setCfg] = useState(loadApiConfig)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const inputRef = useRef(null)
  const promptRef = useRef(null)

  const selectionHtml = useMemo(() => getSelectionHtml(editor, selection), [editor, selection])
  const fullHtml = useMemo(() => editor?.getHTML?.() || '', [editor])
  const provider = getProvider(cfg.provider)

  useEffect(() => {
    if (!modelMenuOpen) return undefined
    const close = (event) => {
      if (!promptRef.current?.contains(event.target)) setModelMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [modelMenuOpen])

  const chooseModel = (nextProvider, model) => {
    const next = {
      ...cfg,
      provider: nextProvider.id,
      baseUrl: nextProvider.baseUrl || cfg.baseUrl,
      model,
    }
    setCfg(next)
    saveApiConfig(next)
    setModelMenuOpen(false)
  }

  const run = async () => {
    if (!cfg.apiKey.trim()) {
      setError('尚未配置 API Key：请在右上角“设置 → AI 配置”中完成配置')
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
        onInlineDiff?.({ oldHtml: selectionHtml, newHtml, range: { ...selection } })
        onClose()
      } else {
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

  const apply = (mode, partIdx) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (mode === 'part') {
      const ranges = []
      editor.state.doc.descendants((node, p) => {
        if (node.type.name === 'paragraph') ranges.push({ from: p, to: p + node.nodeSize })
      })
      const range = ranges[partIdx]
      if (range) chain.insertContentAt(range, result.parts[partIdx].new).run()
      setAccepted((prev) => { const next = new Set(prev === 'all' ? [] : prev || []); next.add(partIdx); return next })
    } else if (mode === 'all') {
      chain.setContent(result.newHtml, true).run()
      onClose()
    }
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

  const style = {
    top: pos.anchor === 'above' ? pos.top - 10 : pos.top + 10,
    left: pos.left,
    transform: pos.anchor === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  }

  return (
    <div className="ai-prompt" style={style} ref={promptRef} onMouseDown={(event) => event.stopPropagation()}>
      <div className="ai-prompt-head" onMouseDown={onDragStart}>
        <span><Icon name="sparkle" size={13} />AI 改写{result ? ' · 结果' : ''}</span>
        <div className="ai-prompt-head-actions">
          <div className="menu-wrap ai-model-picker">
            <button className="ai-model-btn" type="button" onClick={() => setModelMenuOpen((value) => !value)}>
              <span>{provider.name} · {cfg.model || '未选择模型'}</span>
              <Icon name="chevronDown" size={11} />
            </button>
            {modelMenuOpen && (
              <div className="menu ai-model-menu" onClick={(event) => event.stopPropagation()}>
                {PROVIDERS.filter((item) => item.models.length).map((item) => (
                  <div className="ai-model-group" key={item.id}>
                    <div className="settings-label">{item.name}</div>
                    {item.models.map((model) => (
                      <button
                        key={`${item.id}:${model}`}
                        className={`menu-item${cfg.provider === item.id && cfg.model === model ? ' active' : ''}`}
                        onClick={() => chooseModel(item, model)}
                      >
                        <span>{model}</span>
                        {cfg.provider === item.id && cfg.model === model && <span className="menu-item-check">✓</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" data-tip="关闭" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

      {!result ? (
        <>
          <div className="ai-quick-actions" aria-label="常用 AI 指令">
            {[
              ['润色', '润色这段文字，保持原意和事实不变，使表达更自然。'],
              ['精简', '压缩这段文字，删除重复和空泛表达，保留关键信息。'],
              ['扩写', '在不虚构事实的前提下扩写，补足必要细节和衔接。'],
              ['正式', '改成清晰、克制、专业的正式书面表达。'],
              ['口语', '改成自然、顺畅、像真人交流的口语表达。'],
            ].map(([label, prompt]) => (
              <button key={label} className="ai-quick-action" type="button" onClick={() => setText(prompt)}>{label}</button>
            ))}
          </div>
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
          {withContext && selection && <div className="ai-prompt-warn">⚠ 将上传整篇文档作为上下文，消耗大量 Token</div>}
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">⌘/Ctrl+Enter</span>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? '改写中…' : '开始'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="ai-result-view">
            <div className="ai-result-view-hint">共 {result.parts.length} 段，可逐段接受</div>
            {result.parts.map((part, index) => (
              <div key={index} className="ai-diff">
                <div className="ai-diff-old">{textOf(part.old) || '（空段）'}</div>
                <div className="ai-diff-arrow"><Icon name="chevronDown" size={12} /></div>
                <div className="ai-diff-new" dangerouslySetInnerHTML={{ __html: part.new }} />
                <button className="ai-diff-accept" disabled={accepted === 'all' || (accepted && accepted.has(index))} onClick={() => apply('part', index)}>
                  {accepted && accepted.has(index) ? '✓ 已接受' : '接受此段'}
                </button>
              </div>
            ))}
          </div>
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">{Math.round((result.newHtml?.length || 0) / 100) / 10}KB</span>
            <button className="btn" onClick={() => setResult(null)}>返回修改</button>
            <button className="btn btn-primary" onClick={() => apply('all')}>全部替换</button>
          </div>
        </>
      )}
    </div>
  )
}
