// 浮动改写输入框（飞书式）：点 AI 后在合适位置弹出，灰字默认内容，不遮挡选中文字
import { useMemo, useRef, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, callLLM, AI_SYSTEM_PROMPT, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'

function getSelectionText(editor, selection) {
  if (!selection || !editor) return ''
  return editor.state.doc.textBetween(selection.from, selection.to, '\n')
}

export default function AiPrompt({ editor, selection, pos, onClose, onOpenConfig }) {
  // pos: { top, left, anchor: 'above' | 'below' }（视口坐标，输入框定位中心）
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // 默认内容 = 选中文字（灰字显示）；用户输入则覆盖
  const defaultText = useMemo(() => getSelectionText(editor, selection), [editor, selection])

  const run = async () => {
    const cfg = loadApiConfig()
    if (!cfg.apiKey.trim()) {
      setError('尚未配置 API Key：请先点击 ⚙ 完成 AI 配置')
      return
    }
    // 未输入则用默认（灰字）内容
    const content = text.trim() ? text.trim() : defaultText.trim()
    if (!content) {
      setError('没有可改写的内容')
      return
    }
    setLoading(true)
    setError('')
    try {
      const answer = await callLLM(cfg, [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: `修改指令：${content}\n\n文档内容：\n${editor.getHTML()}` },
      ])
      const html = sanitizeHtml(cleanLLMOutput(answer))
      if (selection && editor) {
        editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, html).run()
      } else {
        editor.chain().focus().insertContent(html).run()
      }
      onClose()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const style = {
    top: pos.anchor === 'above' ? pos.top - 10 : pos.top + 10,
    left: pos.left,
    transform: 'translate(-50%, -100%)',
  }
  if (pos.anchor === 'below') {
    style.transform = 'translate(-50%, 0)'
  }

  return (
    <div className="ai-prompt" style={style}>
      <div className="ai-prompt-head">
        <span><Icon name="sparkle" size={13} />AI 改写</span>
        <button className="icon-btn" data-tip="AI 配置" onClick={onOpenConfig}>
          <Icon name="settings" size={13} />
        </button>
      </div>
      <textarea
        ref={inputRef}
        className={`ai-prompt-input${text.trim() ? ' filled' : ''}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={defaultText || '输入改写指令，例如：润色这段文字…'}
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
          if (e.key === 'Escape') onClose()
        }}
      />
      {error && <div className="ai-error ai-prompt-error">{error}</div>}
      <div className="ai-prompt-actions">
        <span className="ai-prompt-hint">⌘/Ctrl+Enter</span>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? '改写中…' : '开始'}
        </button>
      </div>
    </div>
  )
}
