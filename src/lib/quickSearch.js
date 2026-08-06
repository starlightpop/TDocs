// ⌘P / ⌘K 跨文档搜索：纯函数（剥 HTML + 标题/正文排序 + 命中片段）。
//
// 不引入 fuse.js 等第三方：标题用 lowerCase + includes，
// 正文先 stripHtml 再做同样的匹配。命中片段取 query 前后 24 字作为上下文。

const TEXT_TAG = /<[^>]+>/g
const WHITESPACE = /\s+/g

export function stripHtml(html = '') {
  // 依赖浏览器的 DOMParser；这里给一个轻量替代，避免测试时强制 jsdom。
  if (typeof DOMParser !== 'undefined') {
    const el = new DOMParser().parseFromString(String(html || ''), 'text/html').body
    return (el.textContent || el.innerText || '').replace(WHITESPACE, ' ').trim()
  }
  return String(html || '').replace(TEXT_TAG, ' ').replace(WHITESPACE, ' ').trim()
}

// 从正文中找到第一处命中，并把命中片段前后各 contextWidth 字裁出来。
export function makeSnippet(text, query, contextWidth = 24) {
  if (!text || !query) return ''
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx < 0) return ''
  const start = Math.max(0, idx - contextWidth)
  const end = Math.min(text.length, idx + lowerQuery.length + contextWidth)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

// 计算相关度分：标题命中 > 标题开头 > 正文命中。
function scoreDoc(doc, query) {
  const title = (doc.title || '无标题文档').trim()
  const titleLower = title.toLowerCase()
  const content = stripHtml(doc.content)
  const contentLower = content.toLowerCase()
  if (!query) {
    return { score: 0, inTitle: false, snippet: '' }
  }
  if (titleLower === query) return { score: 1000, inTitle: true, snippet: '' }
  if (titleLower.startsWith(query)) return { score: 800, inTitle: true, snippet: '' }
  const titleIdx = titleLower.indexOf(query)
  if (titleIdx >= 0) {
    return { score: 600 - titleIdx, inTitle: true, snippet: '' }
  }
  const contentIdx = contentLower.indexOf(query)
  if (contentIdx >= 0) {
    return { score: 300 - Math.min(contentIdx, 200), inTitle: false, snippet: makeSnippet(content, query.toLowerCase()) }
  }
  return null
}

function toMillis(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// 主搜索：
// - 空查询返回最近 N 个文档（按 updatedAt 倒序）
// - 有查询：标题命中优先，正文命中次之；同分类内按相关度降序
export function searchDocs(docs, query, options = {}) {
  const list = Array.isArray(docs) ? docs : []
  const recentLimit = options.recentLimit ?? 8
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    return [...list]
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
      .slice(0, recentLimit)
      .map((doc) => ({
        doc,
        score: 0,
        inTitle: false,
        snippet: '',
        kind: 'recent',
      }))
  }
  const matches = []
  for (const doc of list) {
    const result = scoreDoc(doc, q)
    if (!result) continue
    matches.push({ doc, ...result, kind: result.inTitle ? 'title' : 'content' })
  }
  // 同类按相关度降序；不同类按 (标题优先) + updatedAt
  matches.sort((a, b) => {
    if (a.inTitle !== b.inTitle) return a.inTitle ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    return toMillis(b.doc.updatedAt) - toMillis(a.doc.updatedAt)
  })
  return matches
}

// 高亮：在文本里把 query 命中位置标记出来（返回分段数组）。
// 供 React 渲染 <mark>。
export function splitHighlight(text, query) {
  if (!text || !query) return [{ text, match: false }]
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const out = []
  let cursor = 0
  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor)
    if (idx < 0) {
      out.push({ text: text.slice(cursor), match: false })
      break
    }
    if (idx > cursor) out.push({ text: text.slice(cursor, idx), match: false })
    out.push({ text: text.slice(idx, idx + query.length), match: true })
    cursor = idx + query.length
  }
  return out
}

// 在文档内容里查找 query 第一次出现的位置（PM doc 坐标），
// 找不到时返回 null。供 QuickSwitcher 在选中结果时设置选区。
export function findContentPosition(content, query) {
  if (!content || !query) return 0
  const text = stripHtml(content)
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  return idx < 0 ? 0 : idx
}
