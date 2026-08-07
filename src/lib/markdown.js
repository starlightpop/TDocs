// Markdown 识别与转换：粘贴、拖入 .md 文件以及编辑器输入规则共用。
// 注意：禁用“4 空格缩进即代码块”规则（markdown-it 默认启用）——
// VS Code 等编辑器的 md 源文件里缩进很常见，粘贴时会把普通文字误判成代码块。
// 只保留显式的围栏代码块（```）识别。
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, breaks: true, linkify: true }).disable('code')

const BLOCK_MARKDOWN_PATTERNS = [
  /^\s{0,3}#{1,6}\s+\S/,                 // 标题
  /^\s{0,3}[-*+]\s+\S/,                  // 无序列表
  /^\s{0,3}\d+[.)]\s+\S/,                // 有序列表
  /^\s{0,3}>\s?\S?/,                     // 引用
  /^\s{0,3}```[\w-]*\s*$/,                // 围栏代码块
  /^\s{0,3}~~~[\w-]*\s*$/,                // 围栏代码块
  /^\s{0,3}[-*+]\s+\[[ xX]\]\s+\S/,     // 任务列表
  /^\s{0,3}[-*_](?:\s*[-*_]){2,}\s*$/,   // 分割线
]

const INLINE_MARKDOWN_PATTERNS = [
  /\*\*[^*\n]+\*\*/,                     // 加粗
  /__[^_\n]+__/,                           // 加粗
  /~~[^~\n]+~~/,                           // 删除线
  /`[^`\n]+`/,                             // 行内代码
  /\[[^\]\n]+\]\([^)\n]+\)/,             // 链接
  /!\[[^\]\n]*\]\([^)\n]+\)/,            // 图片
]

const WHOLE_INLINE_MARKDOWN_PATTERNS = [
  /^\s*\*\*[^*\n]+\*\*\s*$/,
  /^\s*__[^_\n]+__\s*$/,
  /^\s*~~[^~\n]+~~\s*$/,
  /^\s*`[^`\n]+`\s*$/,
  /^\s*\[[^\]\n]+\]\([^)\n]+\)\s*$/,
  /^\s*!\[[^\]\n]*\]\([^)\n]+\)\s*$/,
]

function hasMarkdownTable(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  return lines.some((line, index) => (
    /\|/.test(line)
    && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || '')
  ))
}

function hasBlockMarkdown(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  return lines.some((line) => BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(line)))
    || hasMarkdownTable(text)
}

/** 判断纯文本是否具有足够明确的 Markdown 语法。 */
export function looksLikeMarkdown(text) {
  const value = String(text || '').replace(/\r/g, '')
  if (!value.trim()) return false
  if (hasBlockMarkdown(value)) return true
  if (WHOLE_INLINE_MARKDOWN_PATTERNS.some((pattern) => pattern.test(value))) return true

  const inlineHits = INLINE_MARKDOWN_PATTERNS.reduce((count, pattern) => (
    count + (pattern.test(value) ? 1 : 0)
  ), 0)
  return inlineHits >= 2
}

/**
 * 剪贴板经常同时提供 text/plain 与 text/html。
 * 只要纯文本包含明确的块级 Markdown，就优先按 Markdown 解析；
 * 对行内 Markdown，仅在 HTML 没有真实富文本语义时优先解析，避免破坏网页复制格式。
 */
export function shouldPreferMarkdownPaste(text, html = '') {
  const value = String(text || '')
  if (!looksLikeMarkdown(value)) return false
  if (!html) return true
  if (hasBlockMarkdown(value)) return true

  const semanticRichHtml = /<(?:h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|td|th|img|a|strong|b|em|i|del|s)\b/i
  return !semanticRichHtml.test(String(html))
}

/** Markdown 文本 → HTML 字符串。 */
export function renderMarkdown(text) {
  return md.render(String(text || ''))
}
