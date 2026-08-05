const VERSION_KEY = 'inkdocs.versions.v1'
const DEFAULT_LIMIT = 20

function versionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

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

function loadMap() {
  try {
    const value = JSON.parse(localStorage.getItem(VERSION_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function saveMap(map) {
  try {
    localStorage.setItem(VERSION_KEY, JSON.stringify(map))
    return true
  } catch (error) {
    console.error('版本历史保存失败', error)
    return false
  }
}

export function loadVersions(docId) {
  if (!docId) return []
  const versions = loadMap()[docId]
  return Array.isArray(versions) ? versions : []
}

export function saveVersionSnapshot(doc, options = {}) {
  if (!doc?.id) return []
  const map = loadMap()
  const next = appendVersion(map[doc.id], {
    title: doc.title,
    content: doc.content,
    label: options.label,
    force: options.force,
  }, options.limit)
  map[doc.id] = next
  saveMap(map)
  return next
}

export function removeVersion(docId, versionId) {
  const map = loadMap()
  map[docId] = (map[docId] || []).filter((version) => version.id !== versionId)
  saveMap(map)
  return map[docId]
}
