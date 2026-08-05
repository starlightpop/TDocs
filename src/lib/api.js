// 大模型 API 接入：配置按厂商独立保存，改写菜单只展示已配置厂商。
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
