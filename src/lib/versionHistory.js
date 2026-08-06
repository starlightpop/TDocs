// 版本历史：每个文档独立存一条数组，存到 IDB 的 versions store。
// 老版本使用单个 JSON 对象（VERSION_KEY）。迁移由 bootstrapVersions() 负责。

import { storage, createStorage, createMemoryDriver } from './idb.js'

const VERSION_KEY = 'inkdocs.versions.v1'
const STORE_VERSION = 'versions.v1'
const DEFAULT_LIMIT = 20

function versionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

// 同步辅助：纯函数，给纯逻辑测试和老路径用。
export function appendVersion(list, snapshot, limit = DEFAULT_LIMIT) {
  const current = Array.isArray(list) ? list : []
  if (!snapshot) return current
  const latest = current[0]
  if (!snapshot.force && latest && latest.title === snapshot.title && latest.content === snapshot.content) {
    return current
  }
  const version = {
    id: snapshot.id || versionId(),
    title: snapshot.title || '无标题文档',
    content: snapshot.content || '',
    label: snapshot.label || '自动版本',
    createdAt: snapshot.createdAt || Date.now(),
  }
  return [version, ...current].slice(0, Math.max(1, limit))
}

// 老 localStorage key 转换，便于兼容启动早期的旧数据
function loadLegacyMap() {
  try {
    const value = JSON.parse(localStorage.getItem(VERSION_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function getIds(s) {
  if (s?.driver?.kind === 'memory' && s.driver.docs) {
    return Array.from(s.driver.docs.keys?.() || [])
  }
  return null
}

async function readVersions(s, docId) {
  try {
    const value = await s.getMeta(docId)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

async function writeVersions(s, docId, list) {
  try {
    await s.setMeta(docId, list)
    return true
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('版本历史保存失败', error)
    return false
  }
}

async function bootstrapOnce() {
  if (typeof window === 'undefined') return
  if (window.__tdocs_versions_bootstrapped) return
  window.__tdocs_versions_bootstrapped = true
  const legacy = loadLegacyMap()
  if (!Object.keys(legacy).length) return
  const s = storage()
  try {
    for (const [docId, list] of Object.entries(legacy)) {
      if (Array.isArray(list) && list.length) {
        await s.setMeta(docId, list)
      }
    }
    localStorage.removeItem(VERSION_KEY)
  } catch {
    window.__tdocs_versions_bootstrapped = false
  }
}

let bootstrapPromise = null
export async function ensureVersionsBootstrapped() {
  if (!bootstrapPromise) bootstrapPromise = bootstrapOnce()
  return bootstrapPromise
}

// 异步读取
export async function loadVersions(docId) {
  if (!docId) return []
  await ensureVersionsBootstrapped()
  const list = await readVersions(storage(), docId)
  return Array.isArray(list) ? list : []
}

// 同步读取（缓存）的版本：仅在测试或特殊情况下使用
export function loadVersionsSync(docId) {
  // 兼容旧测试：相同输入相同输出
  // 新代码路径使用 await loadVersions()
  // 没法在没有持久层的情况下返回真实数据；如果正在 bootstrap，触发一次
  if (!docId) return []
  ensureVersionsBootstrapped()
  return []
}

// 异步写入
export async function saveVersionSnapshot(doc, options = {}) {
  if (!doc?.id) return []
  await ensureVersionsBootstrapped()
  const s = storage()
  const existing = await readVersions(s, doc.id)
  const next = appendVersion(existing, {
    title: doc.title,
    content: doc.content,
    label: options.label,
    force: options.force,
  }, options.limit)
  await writeVersions(s, doc.id, next)
  return next
}

// await-aware 删除
export async function removeVersion(docId, versionIdToRemove) {
  if (!docId) return []
  await ensureVersionsBootstrapped()
  const s = storage()
  const existing = await readVersions(s, docId)
  const next = (existing || []).filter((v) => v.id !== versionIdToRemove)
  await writeVersions(s, docId, next)
  return next
}

// 暴露给测试
export const __versionStoreName = STORE_VERSION
export function __createVersionStorageForTest(driver) {
  return createStorage({ driver: driver || createMemoryDriver() })
}
