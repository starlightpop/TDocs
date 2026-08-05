export const PAPER_PRESETS = Object.freeze({
  wide: Object.freeze(['文档', 880, 0]),
  // 96 CSS DPI：210 × 297 mm。100% 缩放时保持稳定版式，不再按窗口任意放大。
  a4: Object.freeze(['A4', 794, 1123]),
  // ISO B5：176 × 250 mm。
  b5: Object.freeze(['B5', 665, 945]),
})

export function normalizePaper(value) {
  return Object.hasOwn(PAPER_PRESETS, value) ? value : 'wide'
}

export function viewModeForPaper(paper) {
  return normalizePaper(paper) === 'wide' ? 'document' : 'page'
}

export function resolvePageSize(paper) {
  const normalized = normalizePaper(paper)
  const [, w, h] = PAPER_PRESETS[normalized]
  return { w, h }
}
