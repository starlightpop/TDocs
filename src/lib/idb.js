// 轻量 IndexedDB 封装。
// 设计原则：
// 1. 提供与当前 localStorage 工具等价的接口（loadDocs/saveDocs/group/meta）
// 2. 抽象存储引擎（driver），可在 Node 测试中替换为纯内存实现
// 3. 老版本数据迁移标记使用 `__idb_migrated__` 写入 localStorage，永不删除
//
// 存储：
//   docs     (keyPath: id)   完整文档（包含大段 content）
//   meta     (keyPath: key)  groups、activeId、theme、setting 等轻量元数据
//   recovery (keyPath: id)   崩溃恢复快照，每条对应一个切换前/切换中的文档
//   images   (keyPath: id)   由图片压缩生成、避免在 HTML 里塞 base64 的 blob

const DB_NAME = 'tdocs.v1'
const DB_VERSION = 1
const STORE_DOCS = 'docs'
const STORE_META = 'meta'
const STORE_RECOVERY = 'recovery'
const STORE_IMAGES = 'images'

// ---------- 抽象 driver：默认指向浏览器原生 IDB，可由 createStorage({driver}) 替换 ----------
function createIDBDriver() {
  if (typeof indexedDB === 'undefined') return null
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(STORE_RECOVERY)) db.createObjectStore(STORE_RECOVERY, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  let dbPromise = null
  const ensure = () => {
    if (!dbPromise) dbPromise = open()
    return dbPromise
  }

  const tx = (store, mode = 'readonly') => async () => {
    const db = await ensure()
    return db.transaction(store, mode).objectStore(store)
  }

  const get = (store) => async (key) => {
    const s = await tx(store)()
    return new Promise((resolve, reject) => {
      const req = s.get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  }
  const put = (store) => async (value) => {
    const s = await tx(store, 'readwrite')()
    return new Promise((resolve, reject) => {
      const req = s.put(value)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  }
  const del = (store) => async (key) => {
    const s = await tx(store, 'readwrite')()
    return new Promise((resolve, reject) => {
      const req = s.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  }
  const all = (store) => async () => {
    const s = await tx(store)()
    return new Promise((resolve, reject) => {
      const req = s.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }
  const clear = (store) => async () => {
    const s = await tx(store, 'readwrite')()
    return new Promise((resolve, reject) => {
      const req = s.clear()
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  }

  return {
    kind: 'idb',
    getDoc: get(STORE_DOCS),
    putDoc: (doc) => put(STORE_DOCS)(doc),
    deleteDoc: (id) => del(STORE_DOCS)(id),
    getAllDocs: all(STORE_DOCS),
    clearDocs: clear(STORE_DOCS),
    getMeta: get(STORE_META),
    putMeta: (key, value) => put(STORE_META)({ key, value }),
    getMetaByKey: get(STORE_META),
    deleteMeta: (key) => del(STORE_META)(key),
    clearMeta: clear(STORE_META),
    getRecovery: get(STORE_RECOVERY),
    putRecovery: (rec) => put(STORE_RECOVERY)(rec),
    deleteRecovery: (id) => del(STORE_RECOVERY)(id),
    getAllRecoveries: all(STORE_RECOVERY),
    clearRecoveries: clear(STORE_RECOVERY),
    getImage: get(STORE_IMAGES),
    putImage: (img) => put(STORE_IMAGES)(img),
    deleteImage: (id) => del(STORE_IMAGES)(id),
    getAllImages: all(STORE_IMAGES),
    clearImages: clear(STORE_IMAGES),
  }
}

// 内存 driver：用于 Node 测试 / SSR 等没有 IDB 的环境。键值映射 + Map 顺序。
function createMemoryDriver() {
  const docs = new Map()
  const meta = new Map()
  const recovery = new Map()
  const images = new Map()
  const pick = (m) => ({
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (v) => { m.set(v.id ?? v.key, v); return true },
    delete: async (k) => { m.delete(k); return true },
    all: async () => Array.from(m.values()),
    clear: async () => { m.clear(); return true },
  })
  const docOps = pick(docs)
  const metaOps = pick(meta)
  const recOps = pick(recovery)
  const imgOps = pick(images)
  return {
    kind: 'memory',
    getDoc: docOps.get,
    putDoc: (v) => docOps.put({ ...v }),
    deleteDoc: docOps.delete,
    getAllDocs: docOps.all,
    clearDocs: docOps.clear,
    // meta 接口同时支持 {key,value} 和直接 value 形式
    getMeta: async (key) => {
      const v = await metaOps.get(key)
      return v ? v.value : null
    },
    putMeta: async (key, value) => metaOps.put({ key, value }),
    deleteMeta: metaOps.delete,
    clearMeta: metaOps.clear,
    getRecovery: recOps.get,
    putRecovery: (v) => recOps.put({ ...v }),
    deleteRecovery: recOps.delete,
    getAllRecoveries: recOps.all,
    clearRecoveries: recOps.clear,
    getImage: imgOps.get,
    putImage: (v) => imgOps.put({ ...v }),
    deleteImage: imgOps.delete,
    getAllImages: imgOps.all,
    clearImages: imgOps.clear,
  }
}

// ---------- 默认驱动：单例，永远命中原生 IDB ----------
const defaultDriver = createIDBDriver()

// ---------- 工厂：测试或特殊场景可注入 driver ----------
export function createStorage(opts = {}) {
  const driver = opts.driver || defaultDriver
  return {
    driver,
    isUsable: Boolean(driver),
    setDoc: (doc) => driver.putDoc(doc),
    getDoc: (id) => driver.getDoc(id),
    getAllDocs: () => driver.getAllDocs(),
    deleteDoc: (id) => driver.deleteDoc(id),
    setMeta: (key, value) => driver.putMeta(key, value),
    getMeta: (key) => driver.getMeta(key),
    setRecovery: (rec) => driver.putRecovery(rec),
    getRecovery: (id) => driver.getRecovery(id),
    deleteRecovery: (id) => driver.deleteRecovery(id),
    listRecoveries: () => driver.getAllRecoveries(),
    setImage: (img) => driver.putImage(img),
    getImage: (id) => driver.getImage(id),
    listImages: () => driver.getAllImages(),
  }
}

// ---------- 直接使用默认驱动（浏览器内） ----------
let cached = null
export function storage() {
  if (!cached) cached = createStorage()
  return cached
}

// 工厂暴露的 driver 工具，便于测试 / debug
export { createMemoryDriver, createIDBDriver, DB_NAME, DB_VERSION }

// ---------- quota 检测 ----------
const QUOTA_ERRORS = new Set([
  'QuotaExceededError',
  'QUOTA_EXCEEDED_ERR',
  'NS_ERROR_DOM_QUOTA_REACHED',
])
export function isQuotaError(error) {
  if (!error) return false
  const name = error?.name || ''
  const code = error?.code
  return QUOTA_ERRORS.has(name) || code === 22 || code === 1014
}
