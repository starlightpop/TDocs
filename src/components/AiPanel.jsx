// 设置中心中的 AI 厂商配置。每个厂商独立保存 Key、地址和模型。
import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import ContextMenu from './ContextMenu.jsx'
import { loadApiStore, saveApiStore, callLLM } from '../lib/api.js'
import { PROVIDERS, getProvider } from '../lib/aiProviders.js'

function SelectMenu({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const cur = options.find(([v]) => v === value)
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!event.target.closest?.('.ai-select')) setOpen(false)
    }
    document.addEventListener('mousedown', close, true)
    return () => document.removeEventListener('mousedown', close, true)
  }, [open])
  return (
    <div className="menu-wrap ai-select">
      <button className="ai-select-btn" onClick={(e) => { e.stopPropagation(); setOpen((value) => !value) }}>
        <span className="ai-select-label">{cur ? cur[1] : '自定义…'}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="menu ai-select-menu" onClick={(e) => e.stopPropagation()}>
          {options.map(([v, label]) => (
            <button key={v} className={`menu-item${v === value ? ' active' : ''}`} onClick={() => { onChange(v); setOpen(false) }}>
              <span>{label}</span>
              {v === value && <span className="menu-item-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function profileFor(store, providerId) {
  const provider = getProvider(providerId)
  return store.profiles?.[providerId] || {
    provider: providerId,
    baseUrl: provider.baseUrl || '',
    apiKey: '',
    model: provider.model || '',
  }
}

export default function AiPanel({ embedded = false, onClose }) {
  const [store, setStore] = useState(loadApiStore)
  const [providerId, setProviderId] = useState(() => loadApiStore().activeProvider || 'openai')
  const [cfg, setCfg] = useState(() => profileFor(loadApiStore(), loadApiStore().activeProvider || 'openai'))
  const [savedTip, setSavedTip] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [keyMenu, setKeyMenu] = useState(null)

  const selectProvider = (id) => {
    const nextCfg = profileFor(store, id)
    setProviderId(id)
    setCfg(nextCfg)
    const nextStore = { ...store, activeProvider: id }
    setStore(nextStore)
    saveApiStore(nextStore)
    setTestResult(null)
  }

  const commit = (nextCfg) => {
    setCfg(nextCfg)
    setStore((previous) => {
      const next = {
        activeProvider: providerId,
        profiles: { ...previous.profiles, [providerId]: { ...nextCfg, provider: providerId } },
      }
      saveApiStore(next)
      return next
    })
    setSavedTip(true)
    clearTimeout(commit.tipTimer)
    commit.tipTimer = setTimeout(() => setSavedTip(false), 1200)
  }

  const update = (patch) => commit({ ...cfg, ...patch, provider: providerId })
  const provider = getProvider(providerId)
  const modelList = provider.models || []
  const inList = modelList.includes(cfg.model)
  const configured = Boolean(cfg.apiKey?.trim() && cfg.baseUrl?.trim() && cfg.model?.trim())

  const testConnection = async () => {
    if (!configured) {
      setTestResult({ ok: false, msg: '请填写接口地址、API Key 和模型名称' })
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
    } catch (error) {
      setTestResult({ ok: false, msg: error.message || String(error) })
    } finally {
      setTesting(false)
    }
  }

  const content = (
    <div className="ai-settings-pane">
      <div className="settings-section-title">
        <div>
          <strong>模型厂商</strong>
          <span>每个厂商单独保存配置。AI 改写菜单只显示已完成配置的厂商。</span>
        </div>
        <span className={`provider-config-state${configured ? ' ready' : ''}`}>{configured ? '已配置' : '未配置'}</span>
      </div>
      <div className="ai-cfg-fields ai-cfg-grid">
        <label>
          厂商
          <SelectMenu value={providerId} options={PROVIDERS.map((item) => [item.id, item.name])} onChange={selectProvider} />
        </label>
        <label>
          接口地址（OpenAI 兼容）
          <input value={cfg.baseUrl || ''} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={cfg.apiKey || ''}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            onContextMenu={(e) => { e.preventDefault(); setKeyMenu({ x: e.clientX, y: e.clientY }) }}
          />
          {keyMenu && (
            <ContextMenu
              x={keyMenu.x}
              y={keyMenu.y}
              items={[
                { label: '粘贴', icon: <Icon name="paste" size={15} />, action: async () => update({ apiKey: await navigator.clipboard.readText() }) },
                { label: '复制', icon: <Icon name="doc" size={15} />, action: () => navigator.clipboard.writeText(cfg.apiKey || '') },
              ]}
              onClose={() => setKeyMenu(null)}
            />
          )}
        </label>
        <label>
          模型名称
          <SelectMenu
            value={inList ? cfg.model : '__custom__'}
            options={[...modelList.map((model) => [model, model]), ['__custom__', '自定义…']]}
            onChange={(value) => update({ model: value === '__custom__' ? '' : value })}
          />
          {!inList && <input value={cfg.model || ''} onChange={(e) => update({ model: e.target.value })} placeholder="输入模型名称" />}
        </label>
      </div>
      <div className="ai-cfg-actions">
        <button className="btn" disabled>{savedTip ? '✓ 已保存' : '自动保存'}</button>
        <button className="btn btn-primary" onClick={testConnection} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
      </div>
      {testResult && <div className={`ai-test-result${testResult.ok ? ' ok' : ' fail'}`}>{testResult.msg}</div>}
    </div>
  )

  if (embedded) return content
  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <span><Icon name="settings" size={15} />AI 配置</span>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      {content}
    </aside>
  )
}
