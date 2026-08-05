export function findAllTextRanges(text, query, caseSensitive = false) {
  const source = String(text || '')
  const needle = String(query || '')
  if (!needle) return []
  const haystack = caseSensitive ? source : source.toLocaleLowerCase()
  const target = caseSensitive ? needle : needle.toLocaleLowerCase()
  const ranges = []
  let cursor = 0
  while (cursor <= haystack.length - target.length) {
    const index = haystack.indexOf(target, cursor)
    if (index < 0) break
    ranges.push({ start: index, end: index + target.length })
    cursor = index + Math.max(1, target.length)
  }
  return ranges
}

// 在每个 ProseMirror textblock 内建立“字符索引 → 文档位置”映射。
// 这样查询可跨越粗体、斜体等 mark 边界，同时避免跨段落替换破坏结构。
export function findTextMatches(doc, query, caseSensitive = false) {
  if (!doc || !query) return []
  const matches = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const positions = []
    node.descendants((child, relativePos) => {
      if (!child.isText) return true
      const value = child.text || ''
      for (let i = 0; i < value.length; i += 1) {
        text += value[i]
        positions.push(pos + 1 + relativePos + i)
      }
      return true
    })
    for (const range of findAllTextRanges(text, query, caseSensitive)) {
      const from = positions[range.start]
      const last = positions[range.end - 1]
      if (Number.isInteger(from) && Number.isInteger(last)) {
        matches.push({ from, to: last + 1 })
      }
    }
    return false
  })
  return matches
}
