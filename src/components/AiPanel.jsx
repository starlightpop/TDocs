import { useEffect, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import {
  loadApiConfig, saveApiConfig, callLLM,
  AI_SYSTEM_PROMPT, cleanLLMOutput, sanitizeHtml,
} from '../lib/api.js'

// 预设主流大模型厂商（均为 OpenAI 兼容接口，2026-08-04 联网核实；models 为各厂商当前主流可选模型）
export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6', models: ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5'] },
  { id: 'anthropic', name: 'Anthropic（Claude）', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', models: ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-haiku-4-5'] },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash', models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-0731'] },
  { id: 'doubao', name: '字节 豆包（火山方舟按量）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2.1-pro', models: ['doubao-seed-2.1-pro', 'doubao-seed-2.1-turbo', 'doubao-seed-evolving', 'doubao-seed-2.0-code'] },
  { id: 'arkcoding', name: '火山方舟 Coding Plan（订阅制）', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', model: 'ark-code-latest', models: ['ark-code-latest', 'doubao-seed-2.1-pro', 'glm-5.2', 'kimi-k3', 'deepseek-v4-pro'] },
  { id: 'qwen', name: '阿里 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', models: ['qwen3.8-max', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.7-flash'] },
  { id: 'moonshot', name: 'Moonshot（Kimi）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'] },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', models: ['glm-5.2', 'glm-5', 'glm-5-turbo', 'glm-4.6'] },
  { id: 'txcoding', name: '腾讯云 Coding Plan（订阅制）', baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3', model: 'glm-5.2', models: ['glm-5.2', 'kimi-k3', 'hunyuan-2.0', 'deepseek-v4-pro'] },
  { id: 'siliconflow', name: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4', models: ['deepseek-ai/DeepSeek-V4', 'moonshotai/Kimi-k3', 'Qwen/Qwen3.8-Max'] },
  { id: 'openrouter', name: 'OpenRouter（聚合）', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash', models: ['deepseek/deepseek-v4-flash', 'openai/gpt-5.5', 'anthropic/claude-sonnet-5'] },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', models: ['qwen3:8b', 'deepseek-r1:8b', 'llama4:10b'] },
  { id: 'custom', name: '自定义…', baseUrl: '', model: '', models: [] },
]

function getSelectionHtml(editor, selection) {
  const frag = editor.state.doc.slice(selection.from, selection.to).content
  const dom = DOMSerializer.fromSchema(editor.state.schema).serializeFragment(frag)
  const tmp = document.createElement('div')
  tmp.appendChild(dom)
  return tmp.innerHTML
}

/** AI 面板：侧边平级显示，便于与正文对照修改 */
export default function AiPanel({ editor, selection, onClose }) {
  const [cfg, setCfg] = useState(loadApiConfig)
  const [instruction, setInstruction] = useState('')
  const [scope, setScope] = useState(selection ? 'selection' : 'doc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pickProvider = (id) => {
    const p = PROVIDERS.find((x) => x.id === id)
    if (!p) return
    if (p.id === 'custom') {
      setCfg({ ...cfg, provider: 'custom' })
      return
    }
    setCfg({ ...cfg, provider: p.id, baseUrl: p.baseUrl, model: p.model })
  }

  const run = async () => {
    saveApiConfig(cfg)
    if (!cfg.apiKey.trim()) {
      setError('请先填写 API Key')
      return
    }
    if (!instruction.trim()) return
    setLoading(true)
    setError('')
    setResult('')
    try {
      const content =
        scope === 'selection' && selection
          ? getSelectionHtml(editor, selection)
          : editor.getHTML()
      const answer = await callLLM(cfg, [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: `修改指令：${instruction.trim()}\n\n文档内容：\n${content}` },
      ])
      setResult(cleanLLMOutput(answer))
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const applyReplace = () => {
    const html = sanitizeHtml(result)
    if (scope === 'selection' && selection) {
      editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, html).run()
    } else {
      editor.chain().focus().setContent(html, true).run()
    }
    setResult('')
  }

  const applyInsert = () => {
    editor.chain().focus().insertContent(sanitizeHtml(result)).run()
    setResult('')
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <span><Icon name="sparkle" size={15} />AI 改写</span>
        <button className="icon-btn" onClick={onClose} data-tip="关闭"><Icon name="x" size={15} /></button>
      </div>

      {/* 厂商与配置 */}
      <div className="ai-cfg-fields">
        <label>
          厂商
          <select
            value={cfg.provider || 'custom'}
            onChange={(e) => pickProvider(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          接口地址（OpenAI 兼容）
          <input
            value={cfg.baseUrl}
            onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value, provider: 'custom' })}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </label>
        <label>
          模型名称
          {(() => {
            const provider = PROVIDERS.find((p) => p.id === (cfg.provider || 'custom'))
            const modelList = provider?.models || []
            const inList = modelList.includes(cfg.model)
            return (
              <>
                <select
                  value={inList ? cfg.model : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') setCfg({ ...cfg, model: '' })
                    else setCfg({ ...cfg, model: e.target.value })
                  }}
                >
                  {modelList.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="__custom__">自定义…</option>
                </select>
                {!inList && (
                  <input
                    value={cfg.model}
                    onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                    placeholder="输入自定义模型名称，如 ep-xxxx 或 gpt-5"
                  />
                )}
              </>
            )
          })()}
        </label>
      </div>

      {/* 指令 */}
      <textarea
        className="ai-instruction"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="输入修改指令，例如：润色这段文字，让语言更有画面感…"
        rows={3}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run() }}
      />

      <div className="ai-scope">
        <label className={scope === 'doc' ? ' on' : ''}>
          <input type="radio" checked={scope === 'doc'} onChange={() => setScope('doc')} />整篇文档
        </label>
        {selection && (
          <label className={scope === 'selection' ? ' on' : ''}>
            <input type="radio" checked={scope === 'selection'} onChange={() => setScope('selection')} />仅选中内容
          </label>
        )}
        <span className="ai-scope-hint">⌘/Ctrl+Enter</span>
      </div>

      <button className="btn btn-primary ai-run-btn" onClick={run} disabled={loading || !instruction.trim()}>
        {loading ? '生成中…' : '生成'}
      </button>

      {error && <div className="ai-error">{error}</div>}

      {/* 结果预览：与正文同层，方便对照 */}
      {result && (
        <div className="ai-result">
          <div className="ai-result-label">生成结果（可对照左侧正文）</div>
          <div className="ai-result-preview editor-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(result) }} />
          <div className="ai-result-actions">
            <button className="btn" onClick={run} disabled={loading}>重新生成</button>
            <button className="btn" onClick={applyInsert}>插入光标处</button>
            <button className="btn btn-primary" onClick={applyReplace}>
              {scope === 'selection' && selection ? '替换选中' : '替换全文'}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
