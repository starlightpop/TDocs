// 文档存储层：基于 localStorage 的多文档持久化

const STORAGE_KEY = 'inkdocs.documents.v1'
const THEME_KEY = 'inkdocs.theme'
const ACTIVE_KEY = 'inkdocs.activeDoc'
const GROUPS_KEY = 'inkdocs.groups.v1'

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const docs = JSON.parse(raw)
    return Array.isArray(docs) ? docs : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
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

export function createDoc(title = '无标题文档', content = '') {
  const now = Date.now()
  return {
    id: uid(),
    title,
    content,
    createdAt: now,
    updatedAt: now,
    autoTitle: true, // 标题自动跟随正文首行，手动改标题后置为 false
    group: '', // 所属分组 id，空为未分组
  }
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
// themePref: 'system' | 'light' | 'dark'，默认跟随系统
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
  // 使用 DOMParser 解析（不会执行脚本），仅提取纯文本
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

/** 提取正文第一个非空块级元素的文本，用作自动标题 */
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
