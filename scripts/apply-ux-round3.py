from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'patch point not found: {label}')
    return text.replace(old, new, 1)

def regex_once(text, pattern, replacement, label, flags=0):
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'regex patch count {count}: {label}')
    return next_text

# ---------------------------------------------------------------------------
# Persistent document kinds: document and word are separate file types.
# ---------------------------------------------------------------------------
write('src/lib/storage.js', r'''// 文档存储层：基于 localStorage 的多文档持久化

const STORAGE_KEY = 'inkdocs.documents.v1'
const THEME_KEY = 'inkdocs.theme'
const ACTIVE_KEY = 'inkdocs.activeDoc'
const GROUPS_KEY = 'inkdocs.groups.v1'

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function legacyKindFor(doc) {
  if (doc?.kind === 'word' || doc?.kind === 'document') return doc.kind
  if (doc?.paper === 'a4' || doc?.paper === 'b5') return 'word'
  const oldPaper = localStorage.getItem('inkdocs.paper')
  return oldPaper === 'a4' || oldPaper === 'b5' ? 'word' : 'document'
}

export function normalizeDoc(doc) {
  const kind = legacyKindFor(doc)
  const normalized = { ...doc, kind }
  if (kind === 'word') {
    const oldPaper = localStorage.getItem('inkdocs.paper')
    normalized.paper = doc?.paper === 'b5' || (!doc?.paper && oldPaper === 'b5') ? 'b5' : 'a4'
  } else {
    delete normalized.paper
  }
  return normalized
}

export function loadDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const docs = JSON.parse(raw)
    return Array.isArray(docs) ? docs.map(normalizeDoc) : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.map(normalizeDoc)))
    return true
  } catch (e) {
    console.error('保存失败', e)
    return false
  }
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id) {
  localStorage.setItem(ACTIVE_KEY, id || '')
}

export function createDoc(title = '无标题文档', content = '', options = {}) {
  const now = Date.now()
  const kind = options.kind === 'word' ? 'word' : 'document'
  const doc = {
    id: uid(),
    title,
    content,
    createdAt: now,
    updatedAt: now,
    autoTitle: true,
    group: '',
    kind,
  }
  if (kind === 'word') doc.paper = options.paper === 'b5' ? 'b5' : 'a4'
  return doc
}

// ---------- 分组 ----------
export function loadGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    const groups = JSON.parse(raw)
    return Array.isArray(groups) ? groups : []
  } catch {
    return []
  }
}

export function saveGroups(groups) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
}

export function createGroup(name) {
  return { id: uid(), name }
}

// ---------- 主题 ----------
export function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

// ---------- 工具 ----------
export function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return `今天 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

export function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export function firstLineTitle(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = doc.body.querySelectorAll('h1, h2, h3, p, li, blockquote, pre, td, th')
  for (const b of blocks) {
    const t = (b.textContent || '').trim()
    if (t) return t.slice(0, 40)
  }
  return (doc.body.textContent || '').trim().slice(0, 40)
}
''')

# ---------------------------------------------------------------------------
# Multi-provider AI configuration. Rewrite dropdown only sees configured keys.
# ---------------------------------------------------------------------------
write('src/lib/api.js', r'''// 大模型 API 接入：配置按厂商独立保存，改写菜单只展示已配置厂商。
import { getProvider } from './aiProviders.js'

const LEGACY_STORE = 'inkdocs.api.v1'
const API_STORE = 'inkdocs.api.v2'

function normalizeProfile(profile = {}, providerId = 'openai') {
  const provider = getProvider(providerId || profile.provider)
  return {
    provider: providerId || profile.provider || provider.id,
    baseUrl: profile.baseUrl || provider.baseUrl || '',
    apiKey: profile.apiKey || '',
    model: profile.model || provider.model || '',
  }
}

export function loadApiStore() {
  try {
    const raw = localStorage.getItem(API_STORE)
    if (raw) {
      const value = JSON.parse(raw)
      const profiles = {}
      for (const [id, profile] of Object.entries(value.profiles || {})) {
        profiles[id] = normalizeProfile(profile, id)
      }
      return { activeProvider: value.activeProvider || 'openai', profiles }
    }
  } catch { /* ignore invalid state */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE) || 'null')
    if (legacy) {
      const provider = legacy.provider || 'openai'
      const store = { activeProvider: provider, profiles: { [provider]: normalizeProfile(legacy, provider) } }
      localStorage.setItem(API_STORE, JSON.stringify(store))
      return store
    }
  } catch { /* ignore invalid legacy state */ }

  return { activeProvider: 'openai', profiles: {} }
}

export function saveApiStore(store) {
  const profiles = {}
  for (const [id, profile] of Object.entries(store?.profiles || {})) {
    profiles[id] = normalizeProfile(profile, id)
  }
  localStorage.setItem(API_STORE, JSON.stringify({ activeProvider: store?.activeProvider || 'openai', profiles }))
}

export function listConfiguredApiConfigs() {
  const store = loadApiStore()
  return Object.values(store.profiles)
    .map((profile) => normalizeProfile(profile, profile.provider))
    .filter((profile) => profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim())
}

export function loadApiConfig() {
  const store = loadApiStore()
  const configured = listConfiguredApiConfigs()
  const active = store.profiles[store.activeProvider]
  if (active?.apiKey?.trim()) return normalizeProfile(active, store.activeProvider)
  if (configured.length) return configured[0]
  return normalizeProfile(active || {}, store.activeProvider || 'openai')
}

export function saveApiConfig(cfg) {
  const provider = cfg.provider || 'custom'
  const store = loadApiStore()
  const next = {
    activeProvider: provider,
    profiles: { ...store.profiles, [provider]: normalizeProfile(cfg, provider) },
  }
  saveApiStore(next)
}

export const AI_SYSTEM_PROMPT = `你是一个专业的文档编辑助手。用户会给你一段 HTML 格式的文档内容和修改指令。
请严格按照指令修改内容，并直接返回修改后的完整 HTML（只能使用 p、h1、h2、h3、ul、ol、li、strong、em、u、s、blockquote、pre、code、a、table 等基础标签）。
不要输出任何解释、问候语、markdown 代码块包裹，只输出 HTML 内容本身。`

export async function callLLM(cfg, messages, { signal } = {}) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7 }),
    signal,
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.error?.message || await res.text() } catch { /* ignore */ }
    throw new Error(`API 请求失败（${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回内容为空')
  return content
}

export function cleanLLMOutput(text) {
  return String(text)
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}
''')

write('src/components/AiPanel.jsx', r'''// 设置中心中的 AI 厂商配置。每个厂商独立保存 Key、地址和模型。
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
''')

# ---------------------------------------------------------------------------
# AI rewrite prompt: configured providers only and reliable click-away closing.
# ---------------------------------------------------------------------------
write('src/components/AiPrompt.jsx', r'''// 浮动改写输入框：模型菜单仅展示已配置厂商。
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, listConfiguredApiConfigs, saveApiConfig, callLLM, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'
import { getProvider } from '../lib/aiProviders.js'

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
  const promptRef = useRef(null)

  const selectionHtml = useMemo(() => getSelectionHtml(editor, selection), [editor, selection])
  const fullHtml = useMemo(() => editor?.getHTML?.() || '', [editor])
  const configured = useMemo(() => listConfiguredApiConfigs(), [modelMenuOpen, cfg.provider, cfg.model])
  const provider = getProvider(cfg.provider)

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

  const run = async () => {
    if (!cfg.apiKey?.trim()) {
      setError('尚未配置可用模型：请在右上角“设置 → AI 模型”中完成配置')
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
        const parts = oldParts.map((old, index) => ({ old, new: newParts[index] || newParts[newParts.length - 1] || newHtml }))
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
              <span>{cfg.apiKey?.trim() ? `${provider.name} · ${cfg.model}` : '未配置模型'}</span>
              <Icon name="chevronDown" size={11} />
            </button>
            {modelMenuOpen && (
              <div className="menu ai-model-menu" onClick={(event) => event.stopPropagation()}>
                {configured.length ? configured.map((profile) => {
                  const item = getProvider(profile.provider)
                  const models = item.models?.length ? item.models : [profile.model]
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

      {!result ? (
        <>
          <div className="ai-quick-actions" aria-label="常用 AI 指令">
            {[
              ['润色', '润色这段文字，保持原意和事实不变，使表达更自然。'],
              ['精简', '压缩这段文字，删除重复和空泛表达，保留关键信息。'],
              ['扩写', '在不虚构事实的前提下扩写，补足必要细节和衔接。'],
              ['正式', '改成清晰、克制、专业的正式书面表达。'],
              ['口语', '改成自然、顺畅、像真人交流的口语表达。'],
            ].map(([label, prompt]) => <button key={label} className="ai-quick-action" type="button" onClick={() => setText(prompt)}>{label}</button>)}
          </div>
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
      ) : (
        <>
          <div className="ai-result-view">
            <div className="ai-result-view-hint">共 {result.parts.length} 段，可逐段接受</div>
            {result.parts.map((part, index) => (
              <div key={index} className="ai-diff">
                <div className="ai-diff-old">{textOf(part.old) || '（空段）'}</div>
                <div className="ai-diff-arrow"><Icon name="chevronDown" size={12} /></div>
                <div className="ai-diff-new" dangerouslySetInnerHTML={{ __html: part.new }} />
                <button className="ai-diff-accept" disabled={accepted === 'all' || (accepted && accepted.has(index))} onClick={() => apply('part', index)}>{accepted && accepted.has(index) ? '✓ 已接受' : '接受此段'}</button>
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
''')

# ---------------------------------------------------------------------------
# Central settings dialog with categorized navigation.
# ---------------------------------------------------------------------------
write('src/components/SettingsDialog.jsx', r'''import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import AiPanel from './AiPanel.jsx'

const TABS = [
  ['general', '常规', 'doc'],
  ['appearance', '外观', 'highlight'],
  ['word', 'Word', 'page'],
  ['ai', 'AI 模型', 'sparkle'],
]

export default function SettingsDialog({
  onClose, themePref, setThemePref, themes, themeGroups, theme,
  lightKey, darkKey, setLightKey, setDarkKey,
  isWord, breakStyle, setBreakStyle, pageLabelStyle, setPageLabelStyle,
  pagePad, setPagePad,
}) {
  const [tab, setTab] = useState('general')
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="settings-dialog-mask" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-dialog-head">
          <div><strong>设置</strong><span>所有应用设置集中在这里</span></div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15} /></button>
        </header>
        <div className="settings-dialog-body">
          <nav className="settings-nav">
            {TABS.map(([id, label, icon]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon name={icon} size={15} /><span>{label}</span></button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === 'general' && (
              <div className="settings-page">
                <h2>工作区</h2>
                <div className="workspace-settings-card">
                  <div className={`workspace-kind-icon${isWord ? ' word' : ''}`}><Icon name="doc" size={24} /></div>
                  <div><strong>当前文件：{isWord ? 'Word 文件' : '文档文件'}</strong><p>两类文件采用独立排版系统，不能在原文件中互相转换。需要迁移内容时，请复制文字并粘贴到另一类新文件。</p></div>
                </div>
                <div className="settings-note">文档文件使用连续画布；Word 文件使用固定纸张、页边距和分页。</div>
              </div>
            )}
            {tab === 'appearance' && (
              <div className="settings-page">
                <h2>外观</h2>
                <div className="settings-field-group">
                  <label>明暗模式</label>
                  <div className="settings-seg settings-seg-wide">
                    <button className={themePref === 'light' ? 'active' : ''} onClick={() => setThemePref('light')}>浅色</button>
                    <button className={themePref === 'dark' ? 'active' : ''} onClick={() => setThemePref('dark')}>深色</button>
                    <button className={themePref === 'system' ? 'active' : ''} onClick={() => setThemePref('system')}>跟随系统</button>
                  </div>
                </div>
                {themeGroups.map(([groupName, keys]) => (
                  <div className="settings-field-group" key={groupName}>
                    <label>{groupName}</label>
                    <div className="settings-theme-grid">
                      {keys.map((key) => {
                        const item = themes[key]
                        const current = theme === 'dark' ? darkKey : lightKey
                        return (
                          <button key={key} className={`settings-theme-card${current === key ? ' active' : ''}`} onClick={() => {
                            if (item.mode === 'dark') { setDarkKey(key); setThemePref('dark') }
                            else { setLightKey(key); setThemePref('light') }
                          }}>
                            <span className="settings-theme-preview" style={{ background: item.colors['surface-2'], borderColor: item.accent }}><i style={{ background: item.accent }} /></span>
                            <span>{item.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'word' && (
              <div className="settings-page">
                <h2>Word 排版</h2>
                {!isWord ? <div className="settings-empty-state">这些设置只作用于 Word 文件。当前打开的是文档文件。</div> : (
                  <>
                    <div className="settings-field-group"><label>分页样式</label><div className="settings-seg settings-seg-wide"><button className={breakStyle === 'dashed' ? 'active' : ''} onClick={() => setBreakStyle('dashed')}>连续页</button><button className={breakStyle === 'split' ? 'active' : ''} onClick={() => setBreakStyle('split')}>分离页</button></div></div>
                    <div className="settings-field-group"><label>页码标签</label><div className="settings-seg settings-seg-wide"><button className={pageLabelStyle === 'total' ? 'active' : ''} onClick={() => setPageLabelStyle('total')}>当前 / 总数</button><button className={pageLabelStyle === 'pair' ? 'active' : ''} onClick={() => setPageLabelStyle('pair')}>相邻页</button></div></div>
                    <div className="settings-field-group"><label>页边距</label><input className="settings-range" type="range" min="24" max="160" value={pagePad} onChange={(event) => setPagePad(Number(event.target.value))} /><span className="settings-range-value">{pagePad}px</span></div>
                  </>
                )}
              </div>
            )}
            {tab === 'ai' && <div className="settings-page"><h2>AI 模型</h2><AiPanel embedded /></div>}
          </div>
        </div>
      </section>
    </div>
  )
}
''')

# ---------------------------------------------------------------------------
# Draggable terminal rendered through a body portal, unaffected by page zoom.
# ---------------------------------------------------------------------------
write('src/components/CodeTerminal.jsx', r'''import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icons.jsx'
import { getCodeLanguageLabel } from '../lib/codeLanguage.js'

const WIDTH = 480
const HEIGHT = 240
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export default function CodeTerminal({ run, onClose }) {
  const [position, setPosition] = useState({ top: 120, left: 120 })
  const dragRef = useRef(null)

  useEffect(() => {
    if (!run) return
    const anchor = run.anchor || { left: 160, right: 640, top: 120, bottom: 220 }
    const preferredTop = anchor.bottom + 10
    const top = preferredTop + HEIGHT <= window.innerHeight - 12
      ? preferredTop
      : Math.max(12, anchor.top - HEIGHT - 10)
    const left = clamp(anchor.left, 12, Math.max(12, window.innerWidth - WIDTH - 12))
    setPosition({ top, left })
  }, [run?.id])

  useEffect(() => {
    if (!run) return undefined
    const onResize = () => setPosition((current) => ({
      top: clamp(current.top, 8, Math.max(8, window.innerHeight - 100)),
      left: clamp(current.left, 8, Math.max(8, window.innerWidth - WIDTH - 8)),
    }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [run])

  if (!run || typeof document === 'undefined') return null

  const beginDrag = (event) => {
    if (event.target.closest('button')) return
    event.preventDefault()
    dragRef.current = { x: event.clientX, y: event.clientY, ...position }
    const move = (nextEvent) => {
      const start = dragRef.current
      if (!start) return
      setPosition({
        left: clamp(start.left + nextEvent.clientX - start.x, 8, Math.max(8, window.innerWidth - WIDTH - 8)),
        top: clamp(start.top + nextEvent.clientY - start.y, 8, Math.max(8, window.innerHeight - 80)),
      })
    }
    const end = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
  }

  return createPortal(
    <div className="code-terminal code-terminal-portal" style={position}>
      <div className="code-terminal-head code-terminal-drag-handle" onMouseDown={beginDrag}>
        <span className="code-terminal-icon"><Icon name="codeBlock" size={13} /></span>
        <span className="code-terminal-title">{run.running ? '正在运行' : '运行结果'} · {getCodeLanguageLabel(run.language)}</span>
        {!run.running && <span className={`code-terminal-status${run.ok ? ' ok' : ' fail'}`}>{run.ok ? '成功' : run.timedOut ? '超时' : '失败'}</span>}
        <button className="icon-btn" title="关闭" onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      <div className="code-terminal-body">
        {run.running ? <pre className="term-running">正在启动本地运行环境…</pre> : (
          <>
            {run.stdout ? <pre className="term-out">{run.stdout}</pre> : null}
            {run.stderr ? <pre className="term-out err">{run.stderr}</pre> : null}
            {!run.stdout && !run.stderr && run.ok ? <pre className="term-empty">程序运行完成，没有输出。</pre> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
''')

# ---------------------------------------------------------------------------
# Editor code block node view, terminal event, line highlighting and healing.
# ---------------------------------------------------------------------------
editor = read('src/components/Editor.jsx')
editor = replace_once(editor, "import { Icon } from './Icons.jsx'\n", "import { Icon } from './Icons.jsx'\nimport CodeTerminal from './CodeTerminal.jsx'\n", 'Editor terminal import')

code_block = r'''// ---------- 代码块：语法高亮、连续行号、当前行高亮与块内运行 ----------
const lowlight = createLowlight()
lowlight.register('c', c)
lowlight.register('cpp', cpp)
lowlight.register('java', java)
lowlight.register('javascript', javascript)
lowlight.register('python', python)
lowlight.register('rust', rust)
lowlight.register('matlab', matlab)
const createCodeId = () => `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const countCodeLines = (text) => Math.max(1, String(text || '').split('\n').length)

const CodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineStart: {
        default: 1,
        parseHTML: (element) => Number(element.dataset.lineStart || 1),
        renderHTML: (attrs) => ({ 'data-line-start': attrs.lineStart || 1 }),
      },
      continued: {
        default: false,
        parseHTML: (element) => element.dataset.continued === 'true',
        renderHTML: (attrs) => (attrs.continued ? { 'data-continued': 'true' } : {}),
      },
      codeId: {
        default: null,
        parseHTML: (element) => element.dataset.codeId || null,
        renderHTML: (attrs) => (attrs.codeId ? { 'data-code-id': attrs.codeId } : {}),
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive('codeBlock')) return false
        return this.editor.commands.insertContent('\n')
      },
      Tab: () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const language = $from.parent.attrs.language || 'plaintext'
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
        const completion = resolveCodeCompletion(language, before)
        if (!completion) {
          view.dispatch(state.tr.insertText('  '))
          return true
        }
        const from = state.selection.from - completion.replaceLength
        let tr = state.tr.insertText(completion.insert, from, state.selection.from)
        const cursor = from + completion.insert.length - (completion.cursorBack || 0)
        tr = tr.setSelection(TextSelection.create(tr.doc, cursor))
        view.dispatch(tr)
        return true
      },
      'Mod-c': () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const depth = $from.depth
        const after = $from.after(depth)
        const next = state.doc.nodeAt(after)
        let tr = state.tr
        if (next?.type.name !== 'paragraph') tr = tr.insert(after, state.schema.nodes.paragraph.create())
        const target = Math.min(tr.doc.content.size, after + 1)
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(target))).scrollIntoView()
        view.dispatch(tr)
        return true
      },
    }
  },
  addNodeView() {
    return ({ node: initialNode, getPos, view }) => {
      let node = initialNode
      const shell = document.createElement('div')
      shell.className = 'code-block-shell'
      const head = document.createElement('div')
      head.className = 'code-block-head'
      head.contentEditable = 'false'
      const title = document.createElement('span')
      title.className = 'code-block-title'
      const actions = document.createElement('div')
      actions.className = 'code-block-head-actions'
      const select = document.createElement('select')
      select.className = 'code-language-select'
      select.setAttribute('aria-label', '代码语言')
      for (const [value, label] of CODE_LANGUAGES) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        select.append(option)
      }
      const runButton = document.createElement('button')
      runButton.type = 'button'
      runButton.className = 'code-run-btn'
      runButton.title = '运行整个逻辑代码块'
      runButton.textContent = '▶ 运行'
      select.addEventListener('change', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: select.value }))
      })
      runButton.addEventListener('click', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const rect = shell.getBoundingClientRect()
        shell.dispatchEvent(new CustomEvent('tdocs:run-code', {
          bubbles: true,
          detail: {
            pos,
            codeId: node.attrs.codeId || null,
            code: node.textContent,
            language: node.attrs.language || 'plaintext',
            anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
          },
        }))
      })
      actions.append(select, runButton)
      head.append(title, actions)

      const pre = document.createElement('pre')
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'
      const code = document.createElement('code')
      pre.append(gutter, code)

      const footer = document.createElement('div')
      footer.className = 'code-block-footer'
      footer.contentEditable = 'false'
      footer.textContent = 'Tab 补全 · ⌘C / Ctrl+C 退出代码块'
      shell.append(head, pre, footer)

      const syncActiveLine = () => {
        const spans = [...gutter.children]
        spans.forEach((span) => span.classList.remove('active'))
        const pos = getPos()
        if (typeof pos !== 'number') return
        const from = view.state.selection.from
        const start = pos + 1
        const end = start + node.content.size
        if (from < start || from > end) return
        const offset = Math.max(0, Math.min(node.content.size, from - start))
        const before = node.textBetween(0, offset, '\n', '\n')
        const lineIndex = (before.match(/\n/g) || []).length
        spans[lineIndex]?.classList.add('active')
      }

      const render = () => {
        const count = countCodeLines(node.textContent)
        const start = Math.max(1, Number(node.attrs.lineStart) || 1)
        gutter.replaceChildren(...Array.from({ length: count }, (_, index) => {
          const span = document.createElement('span')
          span.textContent = String(start + index)
          return span
        }))
        select.value = node.attrs.language || 'plaintext'
        title.textContent = node.attrs.continued ? '代码 · 续' : '代码'
        shell.dataset.language = getCodeLanguageLabel(select.value)
        shell.dataset.codeId = node.attrs.codeId || ''
        shell.classList.toggle('continued', Boolean(node.attrs.continued))
        syncActiveLine()
      }
      const onSelection = () => syncActiveLine()
      view.dom.addEventListener('tdocs:code-selection', onSelection)
      render()
      return {
        dom: shell,
        contentDOM: code,
        update: (nextNode) => {
          if (nextNode.type.name !== 'codeBlock') return false
          node = nextNode
          render()
          return true
        },
        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer')),
        destroy: () => view.dom.removeEventListener('tdocs:code-selection', onSelection),
      }
    }
  },
})

'''
editor = regex_once(editor, r"// ---------- 代码块：语法高亮[\s\S]*?\n// AI 内联 diff 接受卡片", code_block + "// AI 内联 diff 接受卡片", 'Editor CodeBlock replacement')
editor = replace_once(editor, "  const [ctxMenu, setCtxMenu] = useState(null)\n", "  const [ctxMenu, setCtxMenu] = useState(null)\n  const [terminalRun, setTerminalRun] = useState(null)\n", 'Editor terminal state')

editor = replace_once(
    editor,
    "  const mergeCodeNodes = (left, right, schema) => {\n    const text = `${left.textContent || ''}\\n${right.textContent || ''}`\n    return left.type.create(\n      { ...left.attrs, lineStart: Math.max(1, Number(left.attrs.lineStart) || 1), continued: Boolean(left.attrs.continued) },\n      text ? schema.text(text) : null,\n    )\n  }",
    "  const mergeCodeNodes = (left, right, schema) => {\n    const leftText = left.textContent || ''\n    const rightText = right.textContent || ''\n    const separator = !leftText || !rightText || leftText.endsWith('\\n') || rightText.startsWith('\\n') ? '' : '\\n'\n    const text = `${leftText}${separator}${rightText}`\n    return left.type.create(\n      { ...left.attrs, codeId: left.attrs.codeId || right.attrs.codeId || createCodeId(), lineStart: Math.max(1, Number(left.attrs.lineStart) || 1), continued: Boolean(left.attrs.continued) },\n      text ? schema.text(text) : null,\n    )\n  }",
    'Editor merge code nodes',
)

normalize_helper = r'''  const normalizeCodeFragments = (state, view) => {
    if (state.doc.firstChild?.type.name !== 'page') return false
    let changed = false
    let previousLogical = null
    const pages = []
    state.doc.forEach((page) => {
      if (page.type.name !== 'page') { pages.push(page); previousLogical = null; return }
      const children = []
      page.forEach((node) => {
        if (node.type.name !== 'codeBlock') {
          children.push(node)
          previousLogical = null
          return
        }
        const wantsContinuation = Boolean(node.attrs.continued)
        const codeId = node.attrs.codeId || (wantsContinuation ? previousLogical?.codeId : null) || createCodeId()
        const continued = wantsContinuation && Boolean(previousLogical)
        const lineStart = continued ? previousLogical.nextLine : 1
        let normalized = node.type.create({ ...node.attrs, codeId, continued, lineStart }, node.content, node.marks)
        const previousOnPage = children[children.length - 1]
        if (continued && previousOnPage?.type.name === 'codeBlock' && previousOnPage.attrs.codeId === codeId) {
          normalized = mergeCodeNodes(previousOnPage, normalized, state.schema)
          children[children.length - 1] = normalized
          changed = true
        } else {
          children.push(normalized)
        }
        if (node.attrs.codeId !== codeId || Boolean(node.attrs.continued) !== continued || Number(node.attrs.lineStart || 1) !== lineStart) changed = true
        previousLogical = { codeId, nextLine: lineStart + countCodeLines(normalized.textContent) }
      })
      pages.push(page.type.create(page.attrs, children))
    })
    if (!changed) return false
    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pages))
    return true
  }

'''
marker = "  // 删除内容后，后页内容应像 Word 一样自动向前回流。\n"
if marker not in editor:
    raise SystemExit('Editor normalize insertion marker missing')
editor = editor.replace(marker, normalize_helper + marker, 1)

editor = replace_once(
    editor,
    "    const startLine = Math.max(1, Number(child.attrs.lineStart) || 1)\n    const consumedLines = beforeText.split('\\n').length\n    const first = child.type.create(\n      { ...child.attrs, lineStart: startLine },",
    "    const startLine = Math.max(1, Number(child.attrs.lineStart) || 1)\n    const codeId = child.attrs.codeId || createCodeId()\n    const consumedLines = beforeText.split('\\n').length\n    const first = child.type.create(\n      { ...child.attrs, codeId, lineStart: startLine },",
    'Editor split code id first',
)
editor = replace_once(editor, "      { ...child.attrs, lineStart: startLine + consumedLines, continued: true },", "      { ...child.attrs, codeId, lineStart: startLine + consumedLines, continued: true },", 'Editor split code id second')
editor = replace_once(
    editor,
    "    if (nextPage?.type.name === 'page') tr = tr.insert(nextPos + 1, second)\n    else tr = tr.insert(nextPos, state.schema.nodes.page.create(null, second))",
    "    if (nextPage?.type.name === 'page') {\n      const firstNext = nextPage.firstChild\n      if (firstNext?.type.name === 'codeBlock' && firstNext.attrs.continued) {\n        const healedNext = firstNext.type.create({ ...firstNext.attrs, codeId, continued: true }, firstNext.content, firstNext.marks)\n        const merged = mergeCodeNodes(second, healedNext, state.schema)\n        tr = tr.replaceWith(nextPos + 1, nextPos + 1 + firstNext.nodeSize, merged)\n      } else {\n        tr = tr.insert(nextPos + 1, second)\n      }\n    } else tr = tr.insert(nextPos, state.schema.nodes.page.create(null, second))",
    'Editor split next-page merge',
)
editor = replace_once(editor, "    const { view, state } = editor\n    let target = null", "    const { view, state } = editor\n    if (normalizeCodeFragments(state, view)) return true\n    let target = null", 'Editor reflow normalization')
editor = replace_once(
    editor,
    "      const signature = []\n      editor.state.doc.forEach((page) => signature.push(`${page.childCount}:${page.textContent.length}`))",
    "      const signature = []\n      editor.state.doc.forEach((page) => {\n        const parts = []\n        page.forEach((child) => parts.push(`${child.type.name}:${child.textContent.length}:${child.attrs?.lineStart || ''}:${child.attrs?.continued || ''}:${child.attrs?.codeId || ''}`))\n        signature.push(parts.join(','))\n      })",
    'Editor reflow signature',
)

terminal_effect_marker = "  // 初始化统计 + 向父级暴露 editor 实例\n"
terminal_effect = r'''  useEffect(() => {
    if (!editor) return undefined
    const root = editor.view.dom
    const handleRun = async (event) => {
      const detail = event.detail || {}
      let code = detail.code || ''
      if (detail.codeId) {
        const fragments = []
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'codeBlock' && node.attrs.codeId === detail.codeId) fragments.push({ pos, text: node.textContent })
        })
        if (fragments.length) code = fragments.sort((a, b) => a.pos - b.pos).map((item) => item.text).join('\n')
      }
      const id = `${Date.now()}-${Math.random()}`
      const base = { id, running: true, ok: true, stdout: '', stderr: '', language: detail.language || 'plaintext', anchor: detail.anchor }
      setTerminalRun(base)
      if (!window.tdocs?.runCode) {
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ok: false, stderr: '代码运行仅在 TDocs 桌面应用中可用。' } : current)
        return
      }
      try {
        const result = await window.tdocs.runCode({ language: base.language, code })
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ...result } : current)
      } catch (error) {
        setTerminalRun((current) => current?.id === id ? { ...current, running: false, ok: false, stderr: String(error?.message || error) } : current)
      }
    }
    root.addEventListener('tdocs:run-code', handleRun)
    return () => root.removeEventListener('tdocs:run-code', handleRun)
  }, [editor])

'''
if terminal_effect_marker not in editor:
    raise SystemExit('Editor terminal effect marker missing')
editor = editor.replace(terminal_effect_marker, terminal_effect + terminal_effect_marker, 1)
editor = replace_once(editor, "    onSelection?.(len)\n    onSelectionRange?.(from !== to ? { from, to } : null)", "    onSelection?.(len)\n    onSelectionRange?.(from !== to ? { from, to } : null)\n    editor.view.dom.dispatchEvent(new CustomEvent('tdocs:code-selection'))", 'Editor active code line event')
editor = replace_once(editor, "      <BubbleBar editor={editor} pos={bubblePos} onAi={onAi} />", "      <CodeTerminal run={terminalRun} onClose={() => setTerminalRun(null)} />\n      <BubbleBar editor={editor} pos={bubblePos} onAi={onAi} />", 'Editor terminal render')
write('src/components/Editor.jsx', editor)

# ---------------------------------------------------------------------------
# Toolbar: execution belongs to the code block, not the global toolbar.
# ---------------------------------------------------------------------------
toolbar = read('src/components/Toolbar.jsx')
toolbar = toolbar.replace("import { getCodeLanguageLabel } from '../lib/codeLanguage.js'\n", "")
toolbar = toolbar.replace("  const [runOutput, setRunOutput] = useState(null) // 本地运行状态与标准输出\n", "")
toolbar = re.sub(r"\n  const getActiveCodeBlock = \(\) => \{[\s\S]*?\n  \}\n\n  // 代码在 Electron 主进程[\s\S]*?\n  \}\n\n  const insertImage", "\n  const insertImage", toolbar, count=1)
toolbar = re.sub(r"\n      \{\/\* 语言选择位于代码块右上角；工具栏只保留运行入口。 \*\/\}[\s\S]*?\n      <div className=\"divider\" />\n      <TB icon=\"eraser\"", "\n      <div className=\"divider\" />\n      <TB icon=\"eraser\"", toolbar, count=1)
if 'runOutput' in toolbar or 'runCode' in toolbar or 'code-terminal' in toolbar:
    raise SystemExit('Toolbar run UI was not fully removed')
write('src/components/Toolbar.jsx', toolbar)

# ---------------------------------------------------------------------------
# Sidebar: explicit creation of document or Word file, plus immutable type badge.
# ---------------------------------------------------------------------------
sidebar = read('src/components/Sidebar.jsx')
sidebar = replace_once(sidebar, "  const [query, setQuery] = useState('')\n", "  const [query, setQuery] = useState('')\n  const [createMenuOpen, setCreateMenuOpen] = useState(false)\n", 'Sidebar create menu state')
sidebar = replace_once(
    sidebar,
    "  // 进入内联编辑时初始化名称（新建或重命名文件夹）\n",
    "  useEffect(() => {\n    if (!createMenuOpen) return undefined\n    const close = (event) => { if (!event.target.closest?.('.new-doc-split')) setCreateMenuOpen(false) }\n    document.addEventListener('mousedown', close, true)\n    return () => document.removeEventListener('mousedown', close, true)\n  }, [createMenuOpen])\n\n  // 进入内联编辑时初始化名称（新建或重命名文件夹）\n",
    'Sidebar click-away create menu',
)
sidebar = replace_once(
    sidebar,
    "        <div className=\"doc-item-meta\">\n          {formatTime(doc.updatedAt)}\n        </div>",
    "        <div className=\"doc-item-meta\">\n          <span className={`doc-kind-badge ${doc.kind === 'word' ? 'word' : 'document'}`}>{doc.kind === 'word' ? `Word · ${(doc.paper || 'a4').toUpperCase()}` : '文档'}</span>\n          {formatTime(doc.updatedAt)}\n        </div>",
    'Sidebar kind badge',
)
sidebar = replace_once(
    sidebar,
    "        <button className=\"btn btn-primary new-doc-btn\" onClick={() => onCreate()}>\n          <Icon name=\"plus\" size={15} />新建文档\n        </button>",
    "        <div className=\"new-doc-split\">\n          <button className=\"btn btn-primary new-doc-btn\" onClick={() => { onCreate('document'); setCreateMenuOpen(false) }}>\n            <Icon name=\"plus\" size={15} />新建文档\n          </button>\n          <button className=\"btn btn-primary new-doc-arrow\" aria-label=\"选择文件类型\" onClick={() => setCreateMenuOpen((value) => !value)}>\n            <Icon name=\"chevronDown\" size={12} />\n          </button>\n          {createMenuOpen && (\n            <div className=\"menu new-doc-menu\">\n              <button className=\"menu-item\" onClick={() => { onCreate('document'); setCreateMenuOpen(false) }}><Icon name=\"doc\" size={15} /><span><strong>文档</strong><small>连续画布</small></span></button>\n              <button className=\"menu-item\" onClick={() => { onCreate('word'); setCreateMenuOpen(false) }}><Icon name=\"page\" size={15} /><span><strong>Word</strong><small>A4 / B5 固定纸张</small></span></button>\n            </div>\n          )}\n        </div>",
    'Sidebar split create button',
)
write('src/components/Sidebar.jsx', sidebar)

# ---------------------------------------------------------------------------
# App: immutable workspaces, central settings, compact find panel.
# ---------------------------------------------------------------------------
app = read('src/App.jsx')
app = app.replace("import AiPanel from './components/AiPanel.jsx'\n", "import SettingsDialog from './components/SettingsDialog.jsx'\n")
app = app.replace("  const [aiConfigOpen, setAiConfigOpen] = useState(false)\n", "")
app = app.replace("setAiConfigOpen(false); ", "")
app = app.replace("; setAiConfigOpen(false)", "")

active_marker = "  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId])\n"
active_sync = active_marker + "\n  useEffect(() => {\n    if (!activeDoc) return\n    const nextPaper = activeDoc.kind === 'word' ? (activeDoc.paper === 'b5' ? 'b5' : 'a4') : 'wide'\n    if (paper !== nextPaper) setPaper(nextPaper)\n  }, [activeDoc?.id, activeDoc?.kind, activeDoc?.paper])\n"
app = replace_once(app, active_marker, active_sync, 'App active doc paper sync')

app = regex_once(
    app,
    r"  const changePaper = \(nextPaper\) => \{[\s\S]*?\n  \}\n\n  // 缩放菜单",
    "  const changePaper = (nextPaper) => {\n    if (!activeDoc || activeDoc.kind !== 'word' || !['a4', 'b5'].includes(nextPaper) || nextPaper === paper) return\n    setPaper(nextPaper)\n    persist(docs.map((doc) => (doc.id === activeDoc.id ? { ...doc, paper: nextPaper, updatedAt: Date.now() } : doc)))\n    requestAnimationFrame(() => requestAnimationFrame(() => {\n      const canvas = mainRef.current?.querySelector('.canvas')\n      if (canvas) { canvas.scrollTop = 0; canvas.scrollLeft = 0 }\n      window.dispatchEvent(new Event('tdocs:layout'))\n    }))\n  }\n\n  // 缩放菜单",
    'App immutable paper change',
)

app = replace_once(
    app,
    "  const handleCreate = (group = '') => {\n    const doc = createDoc()\n    doc.group = group || activeDoc?.group || ''\n    persist([doc, ...docs])\n    setActiveId(doc.id)\n  }",
    "  const handleCreate = (kind = 'document', group = '') => {\n    const doc = createDoc('无标题文档', '', { kind, paper: 'a4' })\n    doc.group = group || activeDoc?.group || ''\n    persist([doc, ...docs])\n    setActiveId(doc.id)\n    setPaper(kind === 'word' ? 'a4' : 'wide')\n    setEditor(null)\n    setHeadings([])\n  }",
    'App create by kind',
)
app = replace_once(app, "    setActiveId(id)\n    setEditor(null)", "    const target = docs.find((doc) => doc.id === id)\n    setPaper(target?.kind === 'word' ? (target.paper === 'b5' ? 'b5' : 'a4') : 'wide')\n    setActiveId(id)\n    setEditor(null)", 'App select kind')
app = replace_once(app, "      return { ...createDoc(title), content, group: activeDoc?.group || '' }", "      return { ...createDoc(title, content, { kind: activeDoc?.kind || 'document', paper: activeDoc?.paper || 'a4' }), group: activeDoc?.group || '' }", 'App import current workspace')

# Page selector: document is a badge; Word only chooses A4/B5.
app = regex_once(
    app,
    r"          \{\/\* 页面：宽屏 / A4 / B5[\s\S]*?\n          \{\/\* 设置（⚙️）",
    r'''          {activeDoc?.kind === 'word' ? (
            <div className="menu-wrap">
              <button className="tb-block-btn tb-page-btn workspace-word-btn" title="Word 纸张大小" onClick={(e) => { e.stopPropagation(); closeAllMenus(); setShowPageMenu(!showPageMenu) }}>
                Word · {PAPER[paper][0]}
                <Icon name="chevronDown" size={13} />
              </button>
              {showPageMenu && (
                <div className="menu page-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="settings-label">纸张大小</div>
                  <button className={`menu-item${paper === 'a4' ? ' active' : ''}`} onClick={() => { changePaper('a4'); setShowPageMenu(false) }}><span>A4</span>{paper === 'a4' && <span className="menu-item-check">✓</span>}</button>
                  <button className={`menu-item${paper === 'b5' ? ' active' : ''}`} onClick={() => { changePaper('b5'); setShowPageMenu(false) }}><span>B5</span>{paper === 'b5' && <span className="menu-item-check">✓</span>}</button>
                </div>
              )}
            </div>
          ) : <span className="workspace-mode-badge"><Icon name="doc" size={13} />文档</span>}

          {/* 设置（⚙️）''',
    'App workspace selector',
)

# Replace old settings dropdown with one central-dialog launcher.
app = regex_once(
    app,
    r"          \{\/\* 设置（⚙️）[\s\S]*?\n          \{\/\* 页边距",
    r'''          {/* 设置统一使用中央分类窗口。 */}
          <button className={`icon-btn${showSettings ? ' active' : ''}`} data-tip="设置" onClick={(e) => { e.stopPropagation(); closeAllMenus(); setShowSettings(true) }}>
            <Icon name="settings" />
          </button>

          {/* 页边距''',
    'App central settings button',
)

app = replace_once(app, "    setShowSettings(false)\n", "", 'App remove settings from menu closer')
app = app.replace(" && !showSettings", "")
app = app.replace(", showSettings", "")
app = replace_once(app, "          className=\"main\"\n          ref={mainRef}", "          className=\"main\"\n          data-workspace={activeDoc?.kind || 'document'}\n          ref={mainRef}", 'App workspace data attribute')

# Word ruler only exists in Word files.
ruler_start = "              {/* 边距标尺（Word/WPS 式）：宽度与页面文字区对齐，可拖动灰白交界调边距，点击弹预设档位 */}\n              <div"
app = replace_once(app, ruler_start, "              {activeDoc.kind === 'word' && (\n              <>\n              {/* 边距标尺（Word/WPS 式）：宽度与页面文字区对齐，可拖动灰白交界调边距，点击弹预设档位 */}\n              <div", 'App ruler word start')
app = replace_once(app, "              </div>\n              {/* key 保证切换文档时编辑器重新初始化 */}", "              </div>\n              </>\n              )}\n              {/* key 保证切换文档时编辑器重新初始化 */}", 'App ruler word end')
app = app.replace("                paged={paper !== 'wide'}", "                paged={activeDoc.kind === 'word'}")
app = app.replace("                layoutKey={`${paper}:${pageSize.w}:${pageSize.h}:${pagePad}`}", "                layoutKey={`${activeDoc.kind}:${paper}:${pageSize.w}:${pageSize.h}:${pagePad}`}")
app = app.replace("              <button className=\"btn btn-primary\" onClick={handleCreate}>", "              <button className=\"btn btn-primary\" onClick={() => handleCreate('document')}>")

# Remove old side AI config and insert central settings dialog.
app = re.sub(r"\n          \{\/\* AI 配置面板[\s\S]*?\n          \)\}", "", app, count=1)
settings_render_marker = "      {/* 模态框 */}\n"
settings_render = r'''      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          themePref={themePref}
          setThemePref={setThemePref}
          themes={THEMES}
          themeGroups={THEME_GROUPS}
          theme={theme}
          lightKey={lightKey}
          darkKey={darkKey}
          setLightKey={setLightKey}
          setDarkKey={setDarkKey}
          isWord={activeDoc?.kind === 'word'}
          breakStyle={breakStyle}
          setBreakStyle={setBreakStyle}
          pageLabelStyle={pageLabelStyle}
          setPageLabelStyle={setPageLabelStyle}
          pagePad={pagePad}
          setPagePad={setPagePad}
        />
      )}

'''
if settings_render_marker not in app:
    raise SystemExit('App settings render marker missing')
app = app.replace(settings_render_marker, settings_render + settings_render_marker, 1)
if 'aiConfigOpen' in app or '<AiPanel' in app:
    raise SystemExit('App old AI config panel remains')
write('src/App.jsx', app)

# ---------------------------------------------------------------------------
# CSS: compact find box, central settings, code line/run UI and terminal portal.
# ---------------------------------------------------------------------------
css = read('src/app.css')
css += r'''

/* ============================================================
   UX round 3: immutable workspaces and stable code tooling
   ============================================================ */

/* Compact floating find box; it no longer consumes an application row. */
.find-replace.find-replace-dock {
  position: fixed !important;
  top: calc(var(--topbar-h) + var(--toolbar-h) + 8px) !important;
  right: 18px !important;
  left: auto !important;
  z-index: 1500;
  width: min(500px, calc(100vw - 36px)) !important;
  max-width: 500px !important;
  padding: 8px !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-panel) !important;
  background: color-mix(in srgb, var(--surface) 98%, transparent) !important;
  box-shadow: var(--floating-shadow) !important;
  backdrop-filter: blur(16px) saturate(1.1) !important;
}
.find-replace-dock .find-row,
.find-replace-dock .replace-row { max-width: none !important; margin: 0 !important; }
.find-replace-dock .find-option { width: auto !important; margin: 6px 0 0 24px !important; padding: 0 !important; }

/* File type is explicit and immutable. */
.workspace-mode-badge,
.workspace-word-btn { white-space: nowrap; }
.workspace-mode-badge {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
}
.new-doc-split { position: relative; display: flex; width: 100%; }
.new-doc-split .new-doc-btn { flex: 1; border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; }
.new-doc-arrow { width: 34px; padding: 0 !important; border-left-color: color-mix(in srgb, var(--accent-text) 25%, transparent) !important; border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important; }
.new-doc-menu { top: calc(100% + 5px); left: 0; right: 0; z-index: 600; }
.new-doc-menu .menu-item { align-items: flex-start; }
.new-doc-menu .menu-item > span { display: grid; gap: 2px; text-align: left; }
.new-doc-menu small { color: var(--text-3); font-size: 10.5px; font-weight: 400; }
.doc-item-meta { display: flex; align-items: center; gap: 6px; }
.doc-kind-badge { padding: 1px 5px; border-radius: 5px; background: var(--surface-3); color: var(--text-3); font-size: 9.5px; line-height: 16px; }
.doc-kind-badge.word { color: var(--accent); background: var(--accent-soft); }

/* Code block header owns language and run controls. */
.code-block-head-actions { display: inline-flex; align-items: center; gap: 5px; }
.code-run-btn {
  height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-2);
  font-family: var(--font-sans);
  font-size: 11px;
  cursor: pointer;
}
.code-run-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.code-gutter > span { display: block; height: calc(1em * var(--code-line-height)); line-height: var(--code-line-height); border-radius: 3px; }
.code-gutter > span.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); font-weight: 700; }

/* Body portal keeps the result window independent from editor/page transforms. */
.code-terminal-portal { width: 480px; max-width: calc(100vw - 16px); }
.code-terminal-drag-handle { cursor: move; user-select: none; }
.code-terminal-body { min-height: 82px; box-sizing: border-box; }
.code-terminal-body pre { min-height: 22px; }

/* Central categorized settings window. */
.settings-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(10, 12, 16, .34);
  backdrop-filter: blur(5px);
}
.settings-dialog {
  width: min(820px, calc(100vw - 32px));
  height: min(610px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 24px 80px rgba(0,0,0,.28);
}
.settings-dialog-head {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--border);
}
.settings-dialog-head > div { display: grid; gap: 2px; }
.settings-dialog-head strong { font-size: 16px; }
.settings-dialog-head span { color: var(--text-3); font-size: 11px; }
.settings-dialog-body { min-height: 0; flex: 1; display: grid; grid-template-columns: 170px minmax(0, 1fr); }
.settings-nav { padding: 12px 8px; border-right: 1px solid var(--border); background: var(--surface-2); }
.settings-nav button { width: 100%; min-height: 38px; display: flex; align-items: center; gap: 9px; padding: 0 11px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; }
.settings-nav button:hover { background: var(--surface-3); }
.settings-nav button.active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
.settings-content { min-width: 0; overflow: auto; padding: 24px 28px 32px; }
.settings-page { display: grid; gap: 20px; }
.settings-page h2 { margin: 0; font-size: 20px; }
.settings-field-group { display: grid; gap: 9px; }
.settings-field-group > label { color: var(--text-2); font-size: 12px; font-weight: 600; }
.settings-seg-wide { width: fit-content; min-width: 280px; }
.settings-theme-grid { display: grid; grid-template-columns: repeat(4, minmax(90px, 1fr)); gap: 10px; }
.settings-theme-card { display: grid; gap: 7px; padding: 9px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text-2); cursor: pointer; text-align: left; }
.settings-theme-card.active { border-color: var(--accent); box-shadow: var(--focus-ring); }
.settings-theme-preview { height: 44px; display: flex; align-items: flex-end; padding: 6px; border: 1px solid; border-radius: 7px; }
.settings-theme-preview i { width: 24px; height: 6px; border-radius: 999px; }
.workspace-settings-card { display: flex; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.workspace-settings-card p { margin: 5px 0 0; color: var(--text-2); font-size: 12.5px; line-height: 1.65; }
.workspace-kind-icon { width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center; border-radius: 10px; color: var(--text-2); background: var(--surface-3); }
.workspace-kind-icon.word { color: var(--accent); background: var(--accent-soft); }
.settings-note, .settings-empty-state { padding: 12px 14px; border-radius: 9px; background: var(--surface-2); color: var(--text-3); font-size: 12px; line-height: 1.6; }
.settings-range { width: min(420px, 100%); accent-color: var(--accent); }
.settings-range-value { color: var(--text-3); font-size: 12px; }
.settings-section-title { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.settings-section-title > div { display: grid; gap: 4px; }
.settings-section-title span { color: var(--text-3); font-size: 11.5px; line-height: 1.5; }
.provider-config-state { padding: 3px 8px; border-radius: 999px; background: var(--surface-3); color: var(--text-3) !important; white-space: nowrap; }
.provider-config-state.ready { color: var(--success) !important; background: color-mix(in srgb, var(--success) 15%, transparent); }
.ai-settings-pane { display: grid; gap: 16px; }
.ai-cfg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ai-cfg-grid label { min-width: 0; }
.ai-model-empty { padding: 20px 12px; color: var(--text-3); text-align: center; font-size: 12px; }

@media (max-width: 720px) {
  .settings-dialog-mask { padding: 8px; }
  .settings-dialog { width: 100%; height: calc(100vh - 16px); }
  .settings-dialog-body { grid-template-columns: 58px minmax(0, 1fr); }
  .settings-nav button { justify-content: center; padding: 0; }
  .settings-nav span { display: none; }
  .settings-content { padding: 18px 14px 24px; }
  .settings-theme-grid { grid-template-columns: repeat(2, minmax(90px, 1fr)); }
  .ai-cfg-grid { grid-template-columns: 1fr; }
  .find-replace.find-replace-dock { right: 8px !important; width: calc(100vw - 16px) !important; }
}
'''
write('src/app.css', css)

# ---------------------------------------------------------------------------
# Source-level regression checks.
# ---------------------------------------------------------------------------
write('tests/uxRound3.test.mjs', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const editor = fs.readFileSync('src/components/Editor.jsx', 'utf8')
const toolbar = fs.readFileSync('src/components/Toolbar.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const prompt = fs.readFileSync('src/components/AiPrompt.jsx', 'utf8')
const storage = fs.readFileSync('src/lib/storage.js', 'utf8')

test('代码运行入口位于代码块并支持当前行高亮', () => {
  assert.match(editor, /code-run-btn/)
  assert.match(editor, /tdocs:code-selection/)
  assert.doesNotMatch(toolbar, /runCode|runOutput|code-terminal/)
})

test('文档与 Word 是持久化的独立文件类型', () => {
  assert.match(storage, /kind === 'word'/)
  assert.match(app, /activeDoc\.kind === 'word'/)
  assert.doesNotMatch(app, /文档模式（无限画布）/)
})

test('AI 模型菜单只读取已配置厂商', () => {
  assert.match(prompt, /listConfiguredApiConfigs/)
  assert.match(prompt, /尚未配置厂商/)
})
''')

print('UX round 3 patch applied.')
