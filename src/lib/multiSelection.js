// 多选区批量改写辅助：把多个 range 片段拼成一段 HTML 文本，发给 LLM 一起改写，
// 然后按约定的 `<!--TDOCS_SPLIT n -->` 标记拆回每段。零依赖，纯字符串操作以便单测。

export const SPLIT_MARKER = /<!--\s*TDOCS_SPLIT\s*(\d+)\s*-->/g

// 把 chunks 拼成一段带分隔标记的请求体。第 i 段前面的标记是 `<!--TDOCS_SPLIT i-->`，
// 整体末尾再写一份 `<!--TDOCS_SPLIT N-->`，确保正则按出现顺序严格配对。
export function joinChunksWithMarker(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return ''
  return chunks.map((c, i) => `<!--TDOCS_SPLIT ${i}-->\n${c}`).join('\n') + `\n<!--TDOCS_SPLIT ${chunks.length}-->`
}

// 从 LLM 输出里按标记拆分。容忍标记外的多余字符、空白、缺失尾部标记。
// expectedCount 默认 markers.length - 1（与 joinChunksWithMarker 对齐）：
// joinChunksWithMarker 为 N 段写出 N+1 个 markers（编号 0..N），返回 N 段。
// 调用方可以在 expectedCount 传入预期段数（不传则默认使用 markers.length-1）。
//	- LLM 产生不足 markers 时少返回，reconcileChunks 对带后段视为 fallback。
//	- LLM 多写在尾 marker 之后的文本会补到最后一段（optional tail）。
export function splitHtmlByMarker(html, marker = SPLIT_MARKER, expectedCount) {
  const text = String(html || '')
  if (!text) return []
  const re = new RegExp(marker.source, marker.flags.replace(/g/g, '') + 'g')
  const positions = []
  let match
  while ((match = re.exec(text)) !== null) {
    positions.push({ index: match.index, end: match.index + match[0].length, n: Number(match[1]) })
  }
  if (!positions.length) return []
  const segments = []
  for (let i = 0; i < positions.length - 1; i += 1) {
    const start = positions[i].end
    const end = positions[i + 1].index
    segments.push(text.slice(start, end).trim())
  }
  return segments
}


// 把 LLM 返回的段落（按 splitHtmlByMarker 拆分的）与原 chunks 配对。
// 失败兜底：少了 → 用原文；多了 → 截断；空 → 用原文。
export function reconcileChunks(originalChunks, llmSegments) {
  if (!Array.isArray(originalChunks)) return []
  const out = []
  for (let i = 0; i < originalChunks.length; i += 1) {
    const original = String(originalChunks[i] ?? '')
    const result = llmSegments[i]
    if (typeof result !== 'string' || !result.trim()) {
      out.push({ index: i, html: original, status: 'fallback' })
    } else {
      out.push({ index: i, html: result, status: 'ok' })
    }
  }
  return out
}

// 多选区的 browser-side 收集：`window.getSelection()` 通常只暴露一个 range。
// 飞书式实现需要在用户 ⌘/Ctrl + 多选时把多个 range 缓存到一个全局数组。
const multiSelState = { active: false, ranges: [] }

export function beginMultiSelection() {
  multiSelState.active = true
  multiSelState.ranges = []
}

export function captureMultiRange(range) {
  if (!multiSelState.active) return false
  if (!range || range.collapsed) return false
  multiSelState.ranges.push(range)
  return true
}

export function endMultiSelection() {
  multiSelState.active = false
  return multiSelState.ranges
}

export function clearMultiSelection() {
  multiSelState.active = false
  multiSelState.ranges = []
}

export function getMultiSelectionRanges() {
  return [...multiSelState.ranges]
}
