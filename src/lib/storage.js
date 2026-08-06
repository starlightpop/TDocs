// 文档 / 元数据持久化（IndexedDB 优先 + localStorage 轻量缓存）。
//
// 行为约定：
// - loadDocs() 同步返回本地缓存或 fallback；首次启动在后台异步 bootstrap IDB。
// - saveDocs() 异步串行化写入 IDB，并维护同步 localStorage 元数据缓存。
// - 老格式（DOCS_KEY 完整文档数组）仅作为首次迁移数据源；迁移完成后写入 __idb_migrated__。
// - localStorage key 一律保留：DOCS_KEY、ACTIVE_KEY、THEME_KEY、GROUPS_KEY、WELCOME_SEED_KEY，
//   以及新增的 __idb_migrated__ 与 __docs_cache__（元数据轻量缓存，不存 content）。

import {
  storage,
  createMemoryDriver,
  createStorage,
  isQuotaError,
} from './idb.js'

const DOCS_KEY = 'inkdocs.documents.v1'
const ACTIVE_KEY = 'inkdocs.activeDoc.v1'
const THEME_KEY = 'inkdocs.theme.v1'
const GROUPS_KEY = 'inkdocs.groups.v1'
const MIGRATION_FLAG = '__idb_migrated__'
const DOC_CACHE_KEY = '__docs_cache__'
const META_GROUPS_KEY = 'groups.v1'
const META_ACTIVE_KEY = 'activeId.v1'

function normalizeGroup(group = {}) {
  return {
    ...group,
    id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: group.name || '新建文件夹',
    collapsed: Boolean(group.collapsed),
    pinned: Boolean(group.pinned),
  }
}

export function normalizeDoc(doc = {}) {
  const normalized = {
    ...doc,
    title: doc.title || '无标题文档',
    content: doc.content || '',
    kind: 'document',
    group: doc.isWelcome ? '' : (doc.group || ''),
    pinned: Boolean(doc.pinned || doc.isWelcome),
    isWelcome: Boolean(doc.isWelcome),
    createdAt: Number(doc.createdAt) || Date.now(),
    updatedAt: Number(doc.updatedAt) || Date.now(),
  }
  delete normalized.paper
  return normalized
}

export function createDoc(title = '无标题文档', content = '', options = {}) {
  const now = Date.now()
  return normalizeDoc({
    id: `doc-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: title || '无标题文档',
    content,
    group: options.group || '',
    pinned: Boolean(options.pinned),
    isWelcome: Boolean(options.isWelcome),
    autoTitle: options.autoTitle !== false,
    createdAt: now,
    updatedAt: now,
  })
}

export function createGroup(name = '新建文件夹') {
  return normalizeGroup({
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    collapsed: false,
    pinned: false,
  })
}

// ---------- 元数据轻量缓存（同步） ----------
// 不存 content，仅用于 loadDocs / 渲染侧栏时保持响应。

function readCache() {
  try {
    const raw = localStorage.getItem(DOC_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeMeta) : []
  } catch {
    return []
  }
}

function normalizeMeta(meta) {
  if (!meta || !meta.id) return null
  return {
    id: meta.id,
    title: meta.title || '无标题文档',
    kind: 'document',
    group: meta.isWelcome ? '' : (meta.group || ''),
    pinned: Boolean(meta.pinned || meta.isWelcome),
    isWelcome: Boolean(meta.isWelcome),
    autoTitle: meta.autoTitle !== false,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
  }
}

function writeCache(docs) {
  try {
    const meta = docs.map((d) => normalizeMeta(d))
    localStorage.setItem(DOC_CACHE_KEY, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

// ---------- 同步 API：UI 可在第一时间拿到列表 ----------

let cachedDocs = null
function ensureCache() {
  if (cachedDocs) return cachedDocs
  const cache = readCache()
  if (cache.length) {
    cachedDocs = cache
    return cache
  }
  // 回退到老 key（迁移尚未发生时的兜底）
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        cachedDocs = parsed.map(normalizeDoc).map((d) => normalizeMeta(d))
        return cachedDocs
      }
    }
  } catch { /* ignore */ }
  cachedDocs = []
  return cachedDocs
}

function invalidateCache() {
  cachedDocs = null
}

export function loadDocs() {
  // 返回当前已知元数据（仅列表展示），content 由 Editor 按 id 取
  return ensureCache().map((d) => ({ ...d, content: '' }))
}

export function loadGroups() {
  // 同步：先读 localStorage
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value.map(normalizeGroup) : []
  } catch {
    return []
  }
}

export function saveGroups(groups) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify((groups || []).map(normalizeGroup)))
  // 同步写入 IDB meta，便于后续读路径统一
  storage().setMeta(META_GROUPS_KEY, (groups || []).map(normalizeGroup)).catch(() => {})
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
  storage().setMeta(META_ACTIVE_KEY, id || null).catch(() => {})
}

export function loadTheme() {
  const value = localStorage.getItem(THEME_KEY)
  return ['light', 'dark', 'system'].includes(value) ? value : 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

// ---------- 异步 / 真实写入 ----------

let writeQueue = Promise.resolve()

function enqueueWrite(task) {
  writeQueue = writeQueue.then(() => task().catch((err) => {
    // 不在 enqueue 内部抛出，否则后续任务会被打断
    // eslint-disable-next-line no-console
    console.error('写入队列任务失败', err)
  }))
  return writeQueue
}

export function getDoc(id) {
  return storage().getDoc(id)
}

export function getAllDocs() {
  return storage().getAllDocs()
}

export function getDocSize(id) {
  return storage().getDoc(id).then((doc) => {
    const len = (doc?.content || '').length
    return {
      id,
      contentLength: len,
      approxBytes: len, // UTF-16 长度，等比估算
      recoverable: Boolean(doc),
    }
  })
}

// 写入主路径：debounce 由调用点（App.jsx）控制；这里只负责串行化。
// 返回 {ok:true} 或 {ok:false, reason:'quota'|'error', error}
export function tryWriteDocs(docs) {
  return enqueueWrite(async () => {
    const normalized = (docs || []).map(normalizeDoc)
    const s = storage()
    try {
      // 先删旧的（id 不再出现）
      const existing = await s.getAllDocs()
      const incomingIds = new Set(normalized.map((d) => d.id))
      for (const prev of existing) {
        if (!incomingIds.has(prev.id)) {
          await s.deleteDoc(prev.id)
        }
      }
      for (const doc of normalized) {
        await s.setDoc(doc)
      }
      writeCache(normalized)
      cachedDocs = null
      ensureCache.__refreshed = true
      invalidateCache()
      return { ok: true }
    } catch (error) {
      if (isQuotaError(error)) {
        return { ok: false, reason: 'quota', error }
      }
      return { ok: false, reason: 'error', error }
    }
  })
}

// 与 tryWriteDocs 等价（保持旧 API 名以减少破坏）。saveDocs 现在返回 Promise<{ok,...}>。
export function saveDocs(docs) {
  return tryWriteDocs(docs)
}

// ---------- 迁移 ----------

function readLegacyDocs() {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeDoc) : []
  } catch {
    return []
  }
}

function readLegacyGroups() {
  return loadGroups()
}

export async function bootstrapStorage() {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' }
  const s = storage()
  if (!s.isUsable) {
    // 浏览器没有 IDB：至少完成 cache 初始化，避免侧栏空列表
    const legacy = readLegacyDocs()
    if (legacy.length) {
      cachedDocs = legacy.map((d) => normalizeMeta(d))
      writeCache(legacy)
    }
    return { ok: false, reason: 'idb-unavailable', usedLegacy: legacy.length > 0 }
  }
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') {
      // 已迁移；只需要把元数据缓存对齐
      const docs = await s.getAllDocs()
      writeCache(docs)
      cachedDocs = null
      invalidateCache()
      return { ok: true, migrated: false, count: docs.length }
    }
    // 首次启动：把 localStorage 中的 docs + groups 全部复制到 IDB
    const legacyDocs = readLegacyDocs()
    const legacyGroups = readLegacyGroups()
    for (const doc of legacyDocs) await s.setDoc(doc)
    if (legacyGroups.length) await s.setMeta(META_GROUPS_KEY, legacyGroups)
    const active = localStorage.getItem(ACTIVE_KEY)
    if (active) await s.setMeta(META_ACTIVE_KEY, active)
    localStorage.setItem(MIGRATION_FLAG, '1')
    writeCache(legacyDocs)
    cachedDocs = null
    invalidateCache()
    return { ok: true, migrated: true, count: legacyDocs.length }
  } catch (error) {
    // 迁移失败也要让 UI 用老的本地数据继续工作
    const legacy = readLegacyDocs()
    if (legacy.length) {
      cachedDocs = legacy.map((d) => normalizeMeta(d))
      writeCache(legacy)
    }
    return { ok: false, reason: 'migration-failed', error, usedLegacy: legacy.length > 0 }
  }
}

export async function migrateFromLocalStorage() {
  return bootstrapStorage()
}

export async function resetStorageForTest() {
  const s = storage()
  try {
    const docs = await s.getAllDocs()
    for (const doc of docs) await s.deleteDoc(doc.id)
  } catch { /* ignore */ }
  localStorage.removeItem(MIGRATION_FLAG)
  localStorage.removeItem(DOC_CACHE_KEY)
  invalidateCache()
}

// ---------- UI 辅助 ----------

export function stripHtml(html = '') {
  if (typeof document === 'undefined') {
    return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  }
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent || element.innerText || ''
}

export function formatTime(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function estimateDocSize(content = '') {
  return String(content || '').length
}

export function classifyDocSize(content = '') {
  const size = estimateDocSize(content)
  if (size > 500 * 1024) return 'danger'
  if (size > 200 * 1024) return 'warn'
  return 'ok'
}

// ---------- 测试钩子：替换默认 driver ----------
export function __setStorageDriverForTest(driver) {
  cachedDocs = null
  return createStorage({ driver: driver || createMemoryDriver() })
}

export { storage as __idbInstance }
