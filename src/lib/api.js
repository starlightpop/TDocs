// 大模型 API 接入：配置按厂商独立保存，改写菜单只展示已配置厂商。
//
// 流式支持：
//   - `streamLLM(cfg, messages, { signal, onChunk, onDone, onError, timeouts, signal:extSignal })`
//     返回 Promise<{ content, chunks, aborted }>；onChunk(deltaText) 累积文本片段。
//   - `callLLM(cfg, messages, { signal })` 旧接口保留，内部走流式拼接，保证
//     sanitizeHtml(cleanLLMOutput(...)) 链不动。
import { getProvider } from './aiProviders.js'

const LEGACY_STORE = 'inkdocs.api.v1'
const API_STORE = 'inkdocs.api.v2'
const STREAM_PREF_KEY = 'tdocs.ai.stream'

/** 流式输出开关：部分国产模型 API 对 SSE 支持差异较大，允许用户关闭。 */
export function loadStreamPref() {
  try {
    const value = localStorage.getItem(STREAM_PREF_KEY)
    if (value === '0' || value === 'false') return false
    return true // 默认开启
  } catch {
    return true
  }
}

export function saveStreamPref(enabled) {
  try {
    localStorage.setItem(STREAM_PREF_KEY, enabled ? '1' : '0')
  } catch { /* 偏好存储失败不影响主流程 */ }
}

export function inferProviderId(profile = {}) {
  const base = String(profile.baseUrl || '').toLowerCase()
  const model = String(profile.model || '').toLowerCase()
  const rules = [
    ['deepseek', /deepseek\.com/], ['openrouter', /openrouter\.ai/], ['siliconflow', /siliconflow\.cn/],
    ['gemini', /generativelanguage\.googleapis\.com/], ['anthropic', /anthropic\.com/],
    ['doubao', /volces\.com/], ['qwen', /dashscope\.aliyuncs\.com/], ['moonshot', /moonshot\.cn/],
    ['zhipu', /bigmodel\.cn/], ['ollama', /localhost:11434|127\.0\.0\.1:11434/], ['openai', /openai\.com/],
  ]
  for (const [id, pattern] of rules) if (pattern.test(base)) return id
  if (/^deepseek[-/]/.test(model)) return 'deepseek'
  if (/^claude[-/]/.test(model)) return 'anthropic'
  if (/^gemini[-/]/.test(model)) return 'gemini'
  if (/^qwen[-/:]/.test(model)) return 'qwen'
  if (/^glm[-/]/.test(model)) return 'zhipu'
  if (/^kimi[-/]/.test(model)) return 'moonshot'
  if (/^gpt[-/]/.test(model)) return 'openai'
  return profile.provider && profile.provider !== 'custom' ? profile.provider : 'custom'
}

function normalizeProfile(profile = {}, providerId = null) {
  const resolvedId = providerId || inferProviderId(profile)
  const provider = getProvider(resolvedId)
  return {
    provider: resolvedId,
    baseUrl: profile.baseUrl || provider.baseUrl || '',
    apiKey: profile.apiKey || '',
    model: profile.model || provider.model || '',
  }
}

function configuredProfiles(store) {
  return Object.values(store.profiles || {})
    .map((profile) => normalizeProfile(profile, profile.provider))
    .filter((profile) => profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim())
}

export function loadApiStore() {
  try {
    const raw = localStorage.getItem(API_STORE)
    if (raw) {
      const value = JSON.parse(raw)
      const profiles = {}
      for (const [storedId, profile] of Object.entries(value.profiles || {})) {
        const id = inferProviderId(profile)
        profiles[id] = normalizeProfile(profile, id)
      }
      const configured = configuredProfiles({ profiles })
      const requested = value.activeProvider
      const activeProvider = profiles[requested]?.apiKey?.trim() ? requested : (configured[0]?.provider || requested || 'custom')
      return { activeProvider, profiles }
    }
  } catch { /* ignore invalid state */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE) || 'null')
    if (legacy) {
      const provider = inferProviderId(legacy)
      const store = { activeProvider: provider, profiles: { [provider]: normalizeProfile(legacy, provider) } }
      localStorage.setItem(API_STORE, JSON.stringify(store))
      return store
    }
  } catch { /* ignore invalid legacy state */ }

  return { activeProvider: 'custom', profiles: {} }
}

export function saveApiStore(store) {
  const profiles = {}
  for (const [storedId, profile] of Object.entries(store?.profiles || {})) {
    const id = profile?.provider || storedId || inferProviderId(profile)
    profiles[id] = normalizeProfile(profile, id)
  }
  const configured = configuredProfiles({ profiles })
  const activeProvider = profiles[store?.activeProvider]
    ? store.activeProvider
    : (configured[0]?.provider || Object.keys(profiles)[0] || 'custom')
  localStorage.setItem(API_STORE, JSON.stringify({ activeProvider, profiles }))
}

export function listConfiguredApiConfigs() {
  return configuredProfiles(loadApiStore())
}

export function loadApiConfig() {
  const store = loadApiStore()
  const configured = configuredProfiles(store)
  const active = store.profiles[store.activeProvider]
  if (active?.apiKey?.trim() && active?.baseUrl?.trim() && active?.model.trim()) {
    return normalizeProfile(active, store.activeProvider)
  }
  if (configured.length) return configured[0]
  return normalizeProfile(active || {}, store.activeProvider || 'custom')
}

export function saveApiConfig(cfg) {
  const provider = cfg.provider || inferProviderId(cfg)
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

// 默认超时：连接超时 15s、整体超时 60s。可通过 opts.timeouts 覆盖。
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RETRIES = 2
const BACKOFF_BASE_MS = 800

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const t = setTimeout(resolve, ms)
    if (signal) {
      const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

// 把任意传进来的 AbortSignal 合并成一个新的；外部 signal 触发后转发到合并 signal。
function combineSignals(external, internal) {
  const ac = new AbortController()
  const externalListener = () => ac.abort(external.reason)
  const internalListener = () => ac.abort(internal.reason)
  if (external) {
    if (external.aborted) ac.abort(external.reason)
    else external.addEventListener('abort', externalListener, { once: true })
  }
  if (internal) {
    if (internal.aborted) ac.abort(internal.reason)
    else internal.addEventListener('abort', internalListener, { once: true })
  }
  return ac.signal
}

function isHttpOk(res) {
  return res.ok
}

// 流式 POST：内部根据 maxRetries 跑 fetch；读 text/event-stream 累积分发。
// opts.onChunk(deltaText) — 文本增量；opts.onError(err) — 重试或终态错误回调。
// opts.timeouts = { connect: ms, total: ms }
// opts.maxRetries — 默认 2
export async function streamLLM(cfg, messages, opts = {}) {
  const {
    signal: externalSignal,
    onChunk,
    onDone,
    onError,
    timeouts = {},
    maxRetries = DEFAULT_MAX_RETRIES,
    temperature = 0.7,
    stream = true,
  } = opts

  // 非流式：直接 POST JSON、拿一次性结果。供老旧 / 不支持 SSE 的商 API 使用。
  if (stream === false) {
    if (externalSignal?.aborted) return { content: '', chunks: 0, aborted: true }
    return callLLMNonStream(cfg, messages, { signal: externalSignal, onChunk, onDone, onError })
  }

  const url = String(cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
  const connectTimeoutMs = timeouts.connect ?? DEFAULT_CONNECT_TIMEOUT_MS
  const totalTimeoutMs = timeouts.total ?? DEFAULT_TOTAL_TIMEOUT_MS
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }
  const body = JSON.stringify({ model: cfg.model, messages, temperature, stream: true })

  let lastError = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const ac = new AbortController()
    const combined = combineSignals(externalSignal, ac.signal)
    let connectTimer = null
    let totalTimer = null
    let chunkCount = 0
    let aborted = false
    let fullText = ''

    try {
      connectTimer = setTimeout(() => ac.abort(new Error('CONNECTION_TIMEOUT')), connectTimeoutMs)
      const res = await fetch(url, { method: 'POST', headers, body, signal: combined.signal })
      clearTimeout(connectTimer)
      connectTimer = null

      if (!isHttpOk(res)) {
        const status = res.status
        let detail = ''
        try { detail = (await res.text()).slice(0, 240) } catch { /* ignore */ }
        const err = new Error(`API 请求失败（${status}）${detail ? '：' + detail : ''}`)
        err.code = 'HTTP'
        err.status = status
        // 4xx 不重试；5xx 才走退避
        if (status >= 500 && attempt < maxRetries) {
          lastError = err
          try { onError?.(err, { retrying: true, attempt }) } catch { /* listener crash */ }
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt), externalSignal)
          continue
        }
        await safeClose(res)
        throw err
      }

      // 已开整体超时：仅在首个 chunk 之后的静默阶段起作用
      let firstChunkAt = 0
      let aliveTimer = null
      const bumpAliveTimer = () => {
        clearTimeout(aliveTimer)
        aliveTimer = setTimeout(() => ac.abort(new Error('TOTAL_TIMEOUT')), totalTimeoutMs)
      }
      bumpAliveTimer()

      const ct = res.headers.get('content-type') || ''
      if (ct && !/text\/event-stream/i.test(ct) && !/stream/i.test(ct)) {
        // 不是流式响应：直接把 JSON 解析后当单段返回
        let data
        try { data = await res.json() } catch { data = null }
        await safeClose(res)
        clearTimeout(aliveTimer)
        const text = data?.choices?.[0]?.message?.content || ''
        if (!text) {
          const err = new Error('NOT_STREAM')
          err.code = 'NOT_STREAM'
          throw err
        }
        fullText = text
        onChunk?.(text)
        chunkCount += 1
        const result = { content: fullText, chunks: chunkCount, aborted: false }
        onDone?.(result)
        return result
      }

      totalTimer = setTimeout(() => ac.abort(new Error('TOTAL_TIMEOUT')), totalTimeoutMs)
      const reader = res.body?.getReader?.()
      if (!reader) {
        clearTimeout(totalTimer)
        await safeClose(res)
        const err = new Error('NOT_STREAM')
        err.code = 'NOT_STREAM'
        throw err
      }
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      try {
        while (true) {
          if (externalSignal?.aborted) {
            aborted = true
            try { await reader.cancel() } catch { /* ignore */ }
            break
          }
          const { value, done } = await reader.read()
          if (done) break
          chunkCount += 1
          if (chunkCount === 1) {
            firstChunkAt = Date.now()
            clearTimeout(totalTimer)
            bumpAliveTimer()
          }
          buffer += decoder.decode(value, { stream: true })
          // 按 SSE 事件边界解析
          let boundary
          while ((boundary = searchEventBoundary(buffer)) !== -1) {
            const raw = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const evt = parseEvent(raw)
            if (evt?.done) { aborted = false; break }
            if (evt?.data) {
              const delta = extractDelta(evt.data)
              if (delta) {
                fullText += delta
                onChunk?.(delta)
              }
            }
          }
        }
        // 兜底解析尾部残余
        if (buffer.trim()) {
          const evt = parseEvent(buffer)
          if (evt?.data) {
            const delta = extractDelta(evt.data)
            if (delta) { fullText += delta; onChunk?.(delta) }
          }
        }
      } finally {
        clearTimeout(aliveTimer)
        clearTimeout(totalTimer)
        try { reader.releaseLock() } catch { /* ignore */ }
        await safeClose(res)
      }

      const result = { content: fullText, chunks: chunkCount, aborted }
      onDone?.(result)
      return result
    } catch (err) {
      clearTimeout(connectTimer)
      clearTimeout(totalTimer)
      if (isAbortError(err) || externalSignal?.aborted) {
        const result = { content: fullText, chunks: chunkCount, aborted: true }
        onDone?.(result)
        return result
      }
      // 整体超时/网络层错误：标记成 NETWORK，尝试重试
      const e = err || {}
      const wrapped = new Error(e.message || 'NETWORK')
      wrapped.code = e.code === 'NOT_STREAM' || e.code === 'HTTP' ? e.code : 'NETWORK'
      wrapped.status = e.status
      wrapped.cause = e
      if ((wrapped.code === 'NETWORK' || (wrapped.code === 'HTTP' && wrapped.status >= 500)) && attempt < maxRetries) {
        lastError = wrapped
        try { onError?.(wrapped, { retrying: true, attempt }) } catch { /* listener crash */ }
        try { await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt), externalSignal) } catch { /* aborted during sleep */ }
        if (externalSignal?.aborted) {
          const result = { content: fullText, chunks: chunkCount, aborted: true }
          onDone?.(result)
          return result
        }
        continue
      }
      try { onError?.(wrapped, { retrying: false, attempt }) } catch { /* listener crash */ }
      throw wrapped
    }
  }
  if (lastError) throw lastError
  throw new Error('NETWORK')
}

// 老接口：内部走流式 + 拼接。AbortSignal 透传，保证 sanitizeHtml(cleanLLMOutput(...)) 链不动。
export async function callLLM(cfg, messages, { signal } = {}) {
  let chunks = 0
  const { content, aborted } = await streamLLM(cfg, messages, {
    signal,
    onChunk: () => { chunks += 1 },
    maxRetries: DEFAULT_MAX_RETRIES,
  })
  if (aborted) throw new DOMException('Aborted', 'AbortError')
  if (!content) throw new Error('API 返回内容为空')
  // 兼容：调用方代码无法拿到 partial chunks，故保留 chunks 计数以备 UI 扩展
  void chunks
  return content
}

// 非流式一次性请求：返回整体结果，构建与流式一致的 {content, chunks, aborted} 形状。
async function callLLMNonStream(cfg, messages, { signal, onChunk, onDone, onError } = {}) {
  try {
    const url = String(cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
    const ac = new AbortController()
    const combined = combineSignals(signal, ac.signal)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7 }),
      signal: combined,
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.json())?.error?.message || await res.text() } catch { /* ignore */ }
      const err = new Error(`API 请求失败（${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`)
      onError?.(err)
      throw err
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    if (content) onChunk?.(content)
    onDone?.(content)
    return { content, chunks: 1, aborted: false }
  } catch (error) {
    if (error?.name === 'AbortError') return { content: '', chunks: 0, aborted: true }
    onError?.(error)
    throw error
  }
}

export function cleanLLMOutput(text) {
  return String(text).replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
  return doc.body.innerHTML
}

// ---- SSE 解析（与 src/lib/streamParser.js 行为对齐；保持向后兼容由 api.js 内嵌使用） ----
function searchEventBoundary(buf) {
  return buf.indexOf('\n\n')
}

function parseEvent(raw) {
  const lines = raw.split('\n')
  let data = ''
  let done = false
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim()
    let value = line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') {
      data = data ? `${data}\n${value}` : value
      if (data === '[DONE]') done = true
    }
  }
  if (done) return { done: true }
  if (!data) return null
  return { data }
}

function extractDelta(payload) {
  let obj
  try { obj = JSON.parse(payload) } catch { return '' }
  if (typeof obj === 'string') return obj
  const choice = obj?.choices?.[0]
  if (!choice) return ''
  if (typeof choice.delta?.content === 'string') return choice.delta.content
  if (Array.isArray(choice.delta?.content)) {
    return choice.delta.content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join('')
  }
  if (typeof choice.text === 'string') return choice.text
  return ''
}

function isAbortError(err) {
  return Boolean(err && (err.name === 'AbortError' || err.code === 20 || /aborted/i.test(err.message || '')))
}

async function safeClose(res) {
  try { await res.body?.cancel?.() } catch { /* ignore */ }
}
