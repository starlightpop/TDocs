// 轻量级 word-level diff：手写 LCS（最长公共子序列），文件 < 200 行，零新依赖。
// 把两段文本拆成 token（中英混合：英文按词、中文按字），再走 LCS 得到公共区间，
// 最终输出 [{type:'eq'|'add'|'del', text}]。提供给 AiPrompt 双栏差异预览渲染时使用。

const WHITESPACE = /^\s+$/

// 中文按单字、英文/数字按 word，长空白按整体保留。
function tokenize(text) {
  if (!text) return []
  const out = []
  const re = /[A-Za-z0-9_]+|\s+|\s|[\s\S]/g
  let match
  while ((match = re.exec(text)) !== null) {
    const t = match[0]
    if (!t) continue
    if (WHITESPACE.test(t)) {
      if (out.length && out[out.length - 1].kind === 'ws') out[out.length - 1].value += t
      else out.push({ kind: 'ws', value: t })
    } else if (/^[A-Za-z0-9_]+$/.test(t)) {
      out.push({ kind: 'word', value: t })
    } else {
      // CJK or punctuation: 一字一 token
      for (const ch of t) out.push({ kind: 'cjk', value: ch })
    }
  }
  return out
}

function equals(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.value === b.value)
}

// 经典二维 LCS：行/列 = a.length+1 / b.length+1，时间 O(n*m)，空间 O(n*m)。
// 输入规模预期在单段落范围内（≤ 数千 token），不优化成空间压缩版本以保持可读。
function lcsMatrix(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1]
    for (let j = 1; j <= m; j += 1) {
      if (equals(ai, b[j - 1])) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1]
    }
  }
  return dp
}

// 把 dp 矩阵回溯成 ops：op 表示 a 的某个 token 是否被删，b 的 token 是否新增。
function backtrack(a, b, dp) {
  const ops = []
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    if (equals(a[i - 1], b[j - 1])) {
      ops.push({ type: 'eq', ai: i - 1, bj: j - 1 })
      i -= 1
      j -= 1
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: 'del', ai: i - 1 })
      i -= 1
    } else {
      ops.push({ type: 'add', bj: j - 1 })
      j -= 1
    }
  }
  while (i > 0) { ops.push({ type: 'del', ai: i - 1 }); i -= 1 }
  while (j > 0) { ops.push({ type: 'add', bj: j - 1 }); j -= 1 }
  return ops.reverse()
}

// 合并相邻同类型片段，返回 [{type, text}]。
export function diffWords(a, b) {
  const tokensA = tokenize(String(a ?? ''))
  const tokensB = tokenize(String(b ?? ''))
  if (!tokensA.length && !tokensB.length) return []
  if (!tokensA.length) return [{ type: 'add', text: tokensB.map((t) => t.value).join('') }]
  if (!tokensB.length) return [{ type: 'del', text: tokensA.map((t) => t.value).join('') }]
  const dp = lcsMatrix(tokensA, tokensB)
  const ops = backtrack(tokensA, tokensB, dp)
  const out = []
  for (const op of ops) {
    const type = op.type
    const text = type === 'eq' ? tokensA[op.ai].value : type === 'del' ? tokensA[op.ai].value : tokensB[op.bj].value
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  return out
}

// 给一段 ops 数组，按 eq/add/del 渲染：add 绿下划线，del 删除线并被 add 留痕。
// options.accept 决定是否最终产出净文本（用于"接受差异"）。
export function renderDiffHtml(parts, { accept = true } = {}) {
  if (!parts?.length) return ''
  if (!accept) {
    // 撤销：保留 eq 和 del（旧文本回填）
    const out = []
    for (const p of parts) {
      if (p.type === 'add') continue
      if (p.type === 'del') out.push(`<s>${escapeHtml(p.text)}</s>`)
      else out.push(escapeHtml(p.text))
    }
    return out.join('')
  }
  // 接受：仅 eq + add
  const out = []
  for (const p of parts) {
    if (p.type === 'del') continue
    if (p.type === 'add') out.push(`<ins class="ai-diff-add">${escapeHtml(p.text)}</ins>`)
    else out.push(escapeHtml(p.text))
  }
  return out.join('')
}

// 完整预览 HTML（左 eq/右整体；旧块删除线、新块绿下划线）—— 双栏差异预览的中间产物
export function renderBothPreview(parts) {
  const oldOut = []
  const newOut = []
  for (const p of parts) {
    if (p.type === 'eq') {
      oldOut.push(escapeHtml(p.text))
      newOut.push(escapeHtml(p.text))
    } else if (p.type === 'del') {
      oldOut.push(`<s>${escapeHtml(p.text)}</s>`)
    } else if (p.type === 'add') {
      newOut.push(`<ins class="ai-diff-add">${escapeHtml(p.text)}</ins>`)
    }
  }
  return { oldHtml: oldOut.join(''), newHtml: newOut.join('') }
}

// 接受差异时只写入 add 部分（保留 eq，其余删除）。返回纯文本字符串供插入编辑器。
export function applyAcceptText(parts) {
  if (!parts?.length) return ''
  return parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
