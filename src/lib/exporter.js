// 导出工具：HTML → Markdown / HTML 文件 / 纯文本 / PDF / DOCX / EPUB

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename, blob) {
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
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---------- DOCX 导出（docx 库，按需加载） ----------
function htmlToDocxChildren(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const out = []
  const { Paragraph, TextRun, HeadingLevel } = DOCX_MOD
  const inlineRuns = (el) => {
    const runs = []
    const pushText = (text, base = {}) => {
      if (!text) return
      runs.push(new TextRun({ text, ...base }))
    }
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { pushText(child.textContent); continue }
        if (child.nodeType !== Node.ELEMENT_NODE) continue
        const tag = child.tagName.toLowerCase()
        const base = {
          bold: tag === 'strong' || tag === 'b',
          italics: tag === 'em' || tag === 'i',
          underline: tag === 'u' || tag === 'ins' ? {} : undefined,
          strike: tag === 's' || tag === 'del' ? true : undefined,
          highlight: tag === 'mark' ? 'yellow' : undefined,
          font: tag === 'code' ? 'Courier New' : undefined,
        }
        // 叶子元素：收集其文本为一段 run
        if (['strong', 'b', 'em', 'i', 'u', 'ins', 's', 'del', 'mark', 'code', 'a', 'span'].includes(tag)) {
          pushText(child.textContent, Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)))
        } else {
          walk(child)
        }
      }
    }
    walk(el)
    return runs.length ? runs : [new TextRun({ text: '' })]
  }
  for (const el of doc.body.children) {
    const tag = el.tagName.toLowerCase()
    const text = el.textContent || ''
    if (tag.match(/^h[1-6]$/)) {
      out.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel[`HEADING_${Math.min(Number(tag[1]), 6)}`], spacing: { before: 240, after: 160 } }))
    } else if (tag === 'p' || tag === 'div') {
      out.push(new Paragraph({ children: inlineRuns(el), spacing: { after: 160 } }))
    } else if (tag === 'blockquote') {
      out.push(new Paragraph({ children: inlineRuns(el), indent: { left: 420 }, spacing: { after: 160 } }))
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(el.children).forEach((li) => {
        out.push(new Paragraph({ children: inlineRuns(li), bullet: tag === 'ul' ? { level: 0 } : undefined, numbering: tag === 'ol' ? { reference: 'ol', level: 0 } : undefined, spacing: { after: 80 } }))
      })
    } else if (tag === 'pre') {
      out.push(new Paragraph({ children: [new TextRun({ text: el.textContent, font: 'Courier New' })], spacing: { before: 160, after: 160 } }))
    } else if (tag === 'table') {
      Array.from(el.querySelectorAll('tr')).forEach((tr) => {
        out.push(new Paragraph({ children: [new TextRun({ text: Array.from(tr.children).map((c) => c.textContent.trim()).join(' | ') })], spacing: { after: 80 } }))
      })
    } else if (tag === 'hr') {
      out.push(new Paragraph({ children: [new TextRun({ text: '— — — — — — — —' })], spacing: { after: 160 } }))
    } else if (tag === 'img') {
      out.push(new Paragraph({ children: [new TextRun({ text: `[图片：${el.getAttribute('alt') || '未命名'}]` })], spacing: { after: 160 } }))
    }
  }
  return out
}

let DOCX_MOD = null
let DOCX_LOADING = null
function loadDocx() {
  if (!DOCX_LOADING) DOCX_LOADING = import('docx').then((m) => { DOCX_MOD = m; return m })
  return DOCX_LOADING
}

export async function exportDocx(title, html) {
  const { Document, Packer } = await loadDocx()
  const children = htmlToDocxChildren(html)
  if (!children.length) children.push(new DOCX_MOD.Paragraph({ children: [new DOCX_MOD.TextRun({ text: '' })] }))
  const doc = new Document({
    numbering: { config: [{ reference: 'ol', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'start' }] }] },
    styles: { default: { document: { run: { font: 'PingFang SC', size: 24 } } } }, // 12pt
    sections: [{ children }],
  })
  const blob = await Packer.toBlob(doc)
  downloadBlob(`${title || '未命名'}.docx`, blob)
}

// ---------- EPUB 导出（jszip 手写 epub3 结构） ----------
let JSZIP_MOD = null
let JSZIP_LOADING = null
function loadJSZip() {
  if (!JSZIP_LOADING) JSZIP_LOADING = import('jszip').then((m) => { JSZIP_MOD = m.default || m; return JSZIP_MOD })
  return JSZIP_LOADING
}

function htmlToXhtmlBody(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const body = doc.body
  // 序列化为 XHTML（void 元素自闭合）
  return new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>/, '').replace(/<\/body>$/, '')
}

export async function exportEpub(title, html) {
  const JSZip = await loadJSZip()
  const safeTitle = String(title || '未命名')
  const body = htmlToXhtmlBody(html)
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  const oebps = zip.folder('OEBPS')
  const uid = 'tdocs-' + Date.now().toString(36)
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${escapeHtml(safeTitle)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="content"/></spine>
</package>`)
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>${escapeHtml(safeTitle)}</title></head>
<body><nav epub:type="toc"><h1>目录</h1><ol><li><a href="content.xhtml">${escapeHtml(safeTitle)}</a></li></ol></nav></body>
</html>`)
  oebps.file('content.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head><meta charset="utf-8"/><title>${escapeHtml(safeTitle)}</title>
<style>body{font-family:serif;line-height:1.8;margin:5% 6%}h1,h2,h3{line-height:1.4}img{max-width:100%}</style>
</head>
<body><h1>${escapeHtml(safeTitle)}</h1>${body}</body>
</html>`)
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  downloadBlob(`${safeTitle}.epub`, blob)
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
