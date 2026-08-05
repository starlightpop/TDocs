const DOCS_KEY = 'inkdocs.documents.v1'
const ACTIVE_KEY = 'inkdocs.activeDoc.v1'
const THEME_KEY = 'inkdocs.theme.v1'
const GROUPS_KEY = 'inkdocs.groups.v1'

export function loadDocs() {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.map(normalizeDoc) : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  localStorage.setItem(DOCS_KEY, JSON.stringify((docs || []).map(normalizeDoc)))
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function loadTheme() {
  const value = localStorage.getItem(THEME_KEY)
  return ['light', 'dark', 'system'].includes(value) ? value : 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

function normalizeGroup(group = {}) {
  return {
    ...group,
    id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: group.name || '新建文件夹',
    collapsed: Boolean(group.collapsed),
    pinned: Boolean(group.pinned),
  }
}

export function loadGroups() {
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
}

export function createGroup(name = '新建文件夹') {
  return normalizeGroup({ id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, collapsed: false, pinned: false })
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

export function stripHtml(html = '') {
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
