// AI 配置面板：仅负责厂商 / 接口 / Key / 模型 的配置与连接测试
// 改写功能在浮动输入框 AiPrompt 中完成，不在此处
import { useState } from 'react'
import { Icon } from './Icons.jsx'
import ContextMenu from './ContextMenu.jsx'
import { loadApiConfig, saveApiConfig, callLLM } from '../lib/api.js'

// 自建下拉（与全局菜单风格统一，跨平台一致）
function SelectMenu({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const cur = options.find(([v]) => v === value)
  return (
    <div className="menu-wrap ai-select">
      <button className="ai-select-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <span className="ai-select-label">{cur ? cur[1] : '自定义…'}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="menu ai-select-menu" onClick={(e) => e.stopPropagation()}>
          {options.map(([v, label]) => (
            <button
              key={v}
              className={`menu-item${v === value ? ' active' : ''}`}
              onClick={() => { onChange(v); setOpen(false) }}
            >
              <span>{label}</span>
              {v === value && <span className="menu-item-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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

/** AI 配置面板：只做配置与连接测试 */
export default function AiPanel({ onClose }) {
  const [cfg, setCfg] = useState(loadApiConfig)
  const [savedTip, setSavedTip] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // {ok, msg}
  const [keyMenu, setKeyMenu] = useState(null)

  const openKeyMenu = (e) => {
    e.preventDefault()
    setKeyMenu({ x: e.clientX, y: e.clientY })
  }

  const pickProvider = (id) => {
    const p = PROVIDERS.find((x) => x.id === id)
    if (!p) return
    setCfg({ ...cfg, provider: p.id, baseUrl: p.baseUrl || cfg.baseUrl, model: p.model })
  }

  const save = () => {
    saveApiConfig(cfg)
    setSavedTip(true)
    setTimeout(() => setSavedTip(false), 1600)
  }

  // 保存配置（改动即存）
  const update = (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveApiConfig(next)
    setSavedTip(true)
    setTimeout(() => setSavedTip(false), 1600)
  }

  const testConnection = async () => {
    if (!cfg.apiKey.trim()) {
      setTestResult({ ok: false, msg: '请先填写 API Key' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const answer = await callLLM(cfg, [
        { role: 'system', content: '你是连接测试助手。' },
        { role: 'user', content: '请只回复两个字：正常' },
      ])
      setTestResult({ ok: true, msg: `连接成功：${String(answer).slice(0, 40)}` })
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <span><Icon name="settings" size={15} />AI 配置</span>
        <button className="icon-btn" onClick={onClose} data-tip="关闭"><Icon name="x" size={15} /></button>
      </div>

      <div className="ai-cfg-fields">
        {/* 厂商：自建下拉（与全局菜单统一，跨平台一致） */}
        <label>
          厂商
          <SelectMenu
            value={cfg.provider || 'custom'}
            options={PROVIDERS.map((p) => [p.id, p.name])}
            onChange={(v) => pickProvider(v)}
          />
        </label>
        <label>
          接口地址（OpenAI 兼容）
          <input
            value={cfg.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value, provider: 'custom' })}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            onContextMenu={openKeyMenu}
          />
          {keyMenu && (
            <ContextMenu
              x={keyMenu.x}
              y={keyMenu.y}
              items={[
                { label: '粘贴', icon: <Icon name="paste" size={15} />, action: async () => { const t = await navigator.clipboard.readText(); update({ apiKey: t }) } },
                { label: '复制', icon: <Icon name="doc" size={15} />, action: () => { const el = document.querySelector('.ai-cfg-fields input[type=password]'); if (el) { el.select(); document.execCommand('copy') } } },
                { label: '全选', icon: <Icon name="edit" size={15} />, action: () => { const el = document.querySelector('.ai-cfg-fields input[type=password]'); if (el) el.select() } },
              ]}
              onClose={() => setKeyMenu(null)}
            />
          )}
        </label>
        <label>
          模型名称
          {(() => {
            const provider = PROVIDERS.find((p) => p.id === (cfg.provider || 'custom'))
            const modelList = provider?.models || []
            const inList = modelList.includes(cfg.model)
            return (
              <>
                <SelectMenu
                  value={inList ? cfg.model : '__custom__'}
                  options={[...modelList.map((m) => [m, m]), ['__custom__', '自定义…']]}
                  onChange={(v) => update({ model: v === '__custom__' ? '' : v })}
                />
                {!inList && (
                  <input
                    value={cfg.model}
                    onChange={(e) => update({ model: e.target.value })}
                    placeholder="输入自定义模型名称，如 ep-xxxx 或 gpt-5"
                  />
                )}
              </>
            )
          })()}
        </label>
      </div>

      <div className="ai-cfg-actions">
        <button className="btn" onClick={save} disabled={savedTip}>
          {savedTip ? '✓ 已保存' : '保存配置'}
        </button>
        <button className="btn btn-primary" onClick={testConnection} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </button>
      </div>
      <div className="ai-cfg-hint">配置改动会自动保存；「测试连接」会向所选模型发送一条消息验证连通性。</div>

      {testResult && (
        <div className={`ai-test-result${testResult.ok ? ' ok' : ' fail'}`}>
          {testResult.msg}
        </div>
      )}
    </aside>
  )
}
