// Markdown 识别与转换（粘贴 / 拖入 .md 文件时自动转为富文本）
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, breaks: true, linkify: true })

const MD_PATTERNS = [
  /^\s{0,3}#{1,6}\s/,          // 标题
  /^\s{0,3}[-*+]\s+\S/,        // 无序列表
  /^\s{0,3}\d+[.)]\s+\S/,      // 有序列表
  /^\s{0,3}>\s?/,              // 引用
  /^\s*```/,                   // 代码块
  /^\s{0,3}\|.+\|\s*$/,        // 表格
  /^\s*[-*_]{3,}\s*$/,         // 分割线
  /\*\*[^*\n]+\*\*/,           // 加粗
  /\[[^\]\n]+\]\([^)\n]+\)/,   // 链接
  /^\s*!\[[^\]\n]*\]\(/,       // 图片
]

/** 判断纯文本是否像 Markdown */
export function looksLikeMarkdown(text) {
  if (!text || !text.trim()) return false
  const lines = text.split('\n')
  let hits = 0
  for (const line of lines) {
    if (MD_PATTERNS.some((p) => p.test(line))) hits++
  }
  if (hits >= 2) return true
  // 短文本只要命中一个强特征（标题/代码块/表格）也算
  return lines.length <= 4 && hits >= 1 &&
    [/^\s{0,3}#{1,6}\s/, /^\s*```/, /^\s{0,3}\|.+\|/].some((p) => p.test(lines[0] || '') || p.test(text))
}

/** Markdown 文本 → HTML 字符串 */
export function renderMarkdown(text) {
  return md.render(text)
}
