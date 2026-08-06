// 崩溃恢复判断：纯逻辑，便于测试覆盖。
// 数据源结构（来自 IDB recovery store）：
//   { id: 'doc-xxx', content: '<p>...</p>', title: '...', savedAt: 1712345678901 }

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

function strip(html = '') {
  if (!html) return ''
  if (typeof document === 'undefined') {
    return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  }
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim()
}

export function recoveryPreview(content, max = 80) {
  const text = strip(content)
  if (!text) return '（空内容）'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function isRecoverable(rec, now = Date.now(), windowMs = DEFAULT_WINDOW_MS) {
  if (!rec) return false
  const ts = Number(rec.savedAt)
  if (!Number.isFinite(ts) || ts <= 0) return false
  const age = now - ts
  // 同时过滤极旧记录和未来时间（时钟漂移）
  if (age < 0) return age > -60_000
  if (age > windowMs) return false
  const text = strip(rec.content || '')
  if (!text) return false
  return true
}

export function listRecoverableRecords(records, now = Date.now(), windowMs = DEFAULT_WINDOW_MS) {
  if (!Array.isArray(records)) return []
  return records
    .filter((rec) => isRecoverable(rec, now, windowMs))
    .sort((a, b) => Number(b.savedAt) - Number(a.savedAt))
}

// 给 UI 一个轻量的可渲染列表
export function buildRecoveryItems(records, now = Date.now(), windowMs = DEFAULT_WINDOW_MS) {
  return listRecoverableRecords(records, now, windowMs).map((rec) => ({
    id: rec.id,
    title: rec.title || '未命名文档',
    savedAt: Number(rec.savedAt) || 0,
    preview: recoveryPreview(rec.content),
    content: rec.content || '',
  }))
}

export { DEFAULT_WINDOW_MS }
