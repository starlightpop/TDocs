// AI 提示词模板持久化：5 条快捷改写 prompt + 用户最近使用的自定义 prompt。
// IndexedDB key: `tdocs.ai.templates`；如 IDB 不可用则降级到 localStorage。
// ⚠️ 与 storage 子代理约定一致的 schema：
//   { prompts: [{ id, label, value, builtin:boolean, lastUsed:number }] }

const STORAGE_KEY = 'tdocs.ai.templates'
const MAX_RECENT = 12

export const BUILTIN_PROMPTS = [
  { id: 'builtin-polish', label: '润色', value: '润色这段文字，保持原意和事实不变，使表达更自然。', builtin: true },
  { id: 'builtin-trim', label: '精简', value: '压缩这段文字，删除重复和空泛表达，保留关键信息。', builtin: true },
  { id: 'builtin-expand', label: '扩写', value: '在不虚构事实的前提下扩写，补足必要细节和衔接。', builtin: true },
  { id: 'builtin-formal', label: '正式', value: '改成清晰、克制、专业的正式书面表达。', builtin: true },
  { id: 'builtin-casual', label: '口语', value: '改成自然、顺畅、像真人交流的口语表达。', builtin: true },
]

function safeAria() {
  if (typeof indexedDB === 'undefined') return null
  try { return indexedDB } catch { return null }
}

function idbConnect() {
  return new Promise((resolve, reject) => {
    const idb = safeAria()
    if (!idb) { resolve(null); return }
    let req
    try {
      req = idb.open('tdocs', 1)
    } catch (err) { resolve(null); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

function idbGet(db, key) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readonly')
      const req = tx.objectStore('kv').get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

function idbPut(db, key, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    } catch { resolve(false) }
  })
}

function mergeWithBuiltins(stored) {
  const recent = Array.isArray(stored?.prompts) ? stored.prompts.filter((p) => !p.builtin) : []
  return { prompts: [...BUILTIN_PROMPTS, ...recent] }
}

function lsRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { prompts: BUILTIN_PROMPTS }
    const data = JSON.parse(raw)
    return mergeWithBuiltins(data)
  } catch { return { prompts: BUILTIN_PROMPTS } }
}

function lsWrite(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true }
  catch { return false }
}

export async function loadTemplates() {
  const db = await idbConnect()
  if (db) {
    const stored = await idbGet(db, 'tdocs.ai.templates')
    if (stored) {
      try { db.close(); return mergeWithBuiltins(stored) } catch { /* fall through */ }
    }
    try { db.close() } catch { /* ignore */ }
  }
  return lsRead()
}

export async function saveTemplates(state) {
  const builtins = BUILTIN_PROMPTS.map((p) => ({ ...p }))
  const recents = (state?.prompts || []).filter((p) => !p.builtin && p.value && p.value.trim())
  // 截断到 MAX_RECENT：按 lastUsed 倒序保留前 N 条
  recents.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
  const trimmed = recents.slice(0, MAX_RECENT)
  const payload = { prompts: [...builtins, ...trimmed] }
  const db = await idbConnect()
  if (db) {
    const ok = await idbPut(db, 'tdocs.ai.templates', payload)
    try { db.close() } catch { /* ignore */ }
    if (ok) return payload
  }
  lsWrite({ prompts: trimmed })
  return payload
}

function hashValue(value) {
  const str = String(value || '')
  // 简单 djb2 hash，避免哈希 32 字节的 ESM 依赖
  let h = 5381
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff
  return `r${(h >>> 0).toString(36)}`
}

export async function recordRecentPrompt(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  // 不记录内建快捷改写（5 条 builtin 的内容）
  const builtins = BUILTIN_PROMPTS.find((p) => p.value === trimmed)
  if (builtins) return null
  const state = await loadTemplates()
  const id = hashValue(trimmed)
  const next = (state.prompts || []).filter((p) => p.id !== id)
  next.push({ id, label: trimmed.length > 14 ? `${trimmed.slice(0, 14)}…` : trimmed, value: trimmed, builtin: false, lastUsed: Date.now() })
  await saveTemplates({ prompts: next })
  return id
}

export async function removeRecentPrompt(id) {
  const state = await loadTemplates()
  const next = (state.prompts || []).filter((p) => p.id !== id)
  await saveTemplates({ prompts: next })
}
