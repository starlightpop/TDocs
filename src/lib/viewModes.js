export const PAPER_PRESETS = Object.freeze({
  wide: Object.freeze(['文档', 880, 0]),
  a4: Object.freeze(['A4', 794, 1123]),
  b5: Object.freeze(['B5', 665, 937]),
})

export function normalizePaper(value) {
  return Object.hasOwn(PAPER_PRESETS, value) ? value : 'wide'
}

export function viewModeForPaper(paper) {
  return normalizePaper(paper) === 'wide' ? 'document' : 'page'
}

export function resolvePageSize(paper, availableWidth, options = {}) {
  const normalized = normalizePaper(paper)
  const [, baseWidth, baseHeight] = PAPER_PRESETS[normalized]
  if (normalized === 'wide') return { w: baseWidth, h: 0 }

  const minWidth = Number.isFinite(options.minWidth) ? options.minWidth : 420
  const maxScale = Number.isFinite(options.maxScale) ? options.maxScale : 1.15
  const safeAvailable = Number.isFinite(availableWidth) ? availableWidth : baseWidth
  const width = Math.round(Math.min(baseWidth * maxScale, Math.max(minWidth, safeAvailable)))
  return { w: width, h: Math.round((width * baseHeight) / baseWidth) }
}
