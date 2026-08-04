// 导出工具：HTML → Markdown / HTML 文件 / 纯文本

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportHtml(title, html) {
  const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  body{max-width:820px;margin:40px auto;padding:0 24px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;color:#1c1e21}
  img{max-width:100%}
  pre{background:#f1f3f6;padding:14px;border-radius:8px;overflow-x:auto}
  blockquote{border-left:3px solid #4f6ef7;margin-left:0;padding-left:16px;color:#555}
  table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${html}
</body>
</html>`
  downloadFile(`${title || '未命名'}.html`, doc, 'text/html;charset=utf-8')
}

export function exportText(title, text) {
  downloadFile(`${title || '未命名'}.txt`, text, 'text/plain;charset=utf-8')
}

export function exportMarkdown(title, html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const md = nodesToMd(doc.body).replace(/\n{3,}/g, '\n\n').trim()
  downloadFile(`${title || '未命名'}.md`, `# ${title || '未命名'}\n\n${md}\n`, 'text/markdown;charset=utf-8')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function nodesToMd(parent, ctx = {}) {
  let out = ''
  for (const node of parent.childNodes) out += nodeToMd(node, ctx)
  return out
}

function nodeToMd(node, ctx) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const tag = node.tagName.toLowerCase()
  const inner = () => nodesToMd(node, ctx)

  switch (tag) {
    case 'h1': return `\n# ${inner().trim()}\n\n`
    case 'h2': return `\n## ${inner().trim()}\n\n`
    case 'h3': return `\n### ${inner().trim()}\n\n`
    case 'h4': return `\n#### ${inner().trim()}\n\n`
    case 'p': {
      if (node.querySelector('img')) return nodesToMd(node, ctx)
      const text = inner().trim()
      return text ? `${text}\n\n` : '\n'
    }
    case 'br': return '\n'
    case 'strong': case 'b': return `**${inner()}**`
    case 'em': case 'i': return `*${inner()}*`
    case 'u': return inner()
    case 's': case 'strike': case 'del': return `~~${inner()}~~`
    case 'code': return ctx.inPre ? node.textContent : `\`${node.textContent}\``
    case 'pre': return `\n\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`
    case 'blockquote':
      return inner().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
    case 'a': return `[${inner()}](${node.getAttribute('href') || ''})`
    case 'img': {
      const src = node.getAttribute('src') || ''
      return src.startsWith('data:') ? '\n*[内嵌图片已省略导出]*\n\n' : `![${node.getAttribute('alt') || ''}](${src})\n\n`
    }
    case 'hr': return '\n---\n\n'
    case 'mark': return `==${inner()}==`
    case 'ul': {
      if (node.getAttribute('data-type') === 'taskList') {
        return Array.from(node.children).map((li) => {
          const checked = li.getAttribute('data-checked') === 'true'
          const text = nodesToMd(li.querySelector('div') || li, ctx).trim()
          return `- [${checked ? 'x' : ' '}] ${text}\n`
        }).join('') + '\n'
      }
      return Array.from(node.children).map((li) => `- ${nodesToMd(li, ctx).trim()}\n`).join('') + '\n'
    }
    case 'ol':
      return Array.from(node.children).map((li, i) => `${i + 1}. ${nodesToMd(li, ctx).trim()}\n`).join('') + '\n'
    case 'li': case 'div': return nodesToMd(node, ctx)
    case 'table': return tableToMd(node) + '\n\n'
    default: return inner()
  }
}

function tableToMd(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((cell) => nodesToMd(cell, {}).replace(/\n/g, ' ').trim())
  )
  if (!rows.length) return ''
  const cols = Math.max(...rows.map((r) => r.length))
  const pad = (r) => r.concat(Array(cols - r.length).fill(''))
  const lines = rows.map((r) => `| ${pad(r).join(' | ')} |`)
  lines.splice(1, 0, `| ${Array(cols).fill('---').join(' | ')} |`)
  return lines.join('\n')
}
