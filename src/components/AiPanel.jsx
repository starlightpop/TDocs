// AI 配置面板：仅负责厂商 / 接口 / Key / 模型 的配置与连接测试
// 改写功能在浮动输入框 AiPrompt 中完成，不在此处
import { useState } from 'react'
import { Icon } from './Icons.jsx'
import ContextMenu from './ContextMenu.jsx'
import { loadApiConfig, saveApiConfig, callLLM } from '../lib/api.js'
import { PROVIDERS } from '../lib/aiProviders.js'

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
