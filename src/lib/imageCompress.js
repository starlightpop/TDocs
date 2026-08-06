// 图片压缩工具：在不破坏现有粘贴/拖拽 UX 的前提下，把大图先压成 WebP Blob。
// 设计要点：
// - 浏览器优先使用 createImageBitmap + OffscreenCanvas；不可用时降级到 <img>+<canvas>。
// - Node 测试里只有 data URL → Blob 的降级路径也能用。
// - 不修改或迁移现有 FileReader.readAsDataURL 调用，导出选项独立提供 compressBase64DataUrl。

const DEFAULT_MAX_WIDTH = 1600
const DEFAULT_QUALITY = 0.82

async function fileToBlob(file) {
  if (!file) return null
  if (file instanceof Blob) return file
  if (typeof file?.arrayBuffer === 'function') return new Blob([await file.arrayBuffer()])
  return null
}

async function decodeBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // 某些浏览器在 webp/png 边缘会抛错，降级到 <img>
    }
  }
  if (typeof document !== 'undefined') {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = (err) => { URL.revokeObjectURL(url); reject(err) }
      img.src = url
    })
  }
  return null
}

function drawToCanvas(source, width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(source, 0, 0, width, height)
    return canvas
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(source, 0, 0, width, height)
    return canvas
  }
  return null
}

async function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return await canvas.convertToBlob({ type, quality })
  }
  if (typeof canvas.toBlob === 'function') {
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), type, quality)
    })
  }
  return null
}

function pickMimeType(target) {
  if (typeof target === 'string' && target) return target
  // 检查浏览器对 webp 的支持；不支持就退回 jpeg
  if (typeof document !== 'undefined') {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const dataUrl = probe.toDataURL('image/webp')
    if (dataUrl.startsWith('data:image/webp')) return 'image/webp'
    return 'image/jpeg'
  }
  return 'image/webp'
}

// 压缩一个图片 File / Blob，返回 { blob, type, width, height, originalSize, size }。
export async function compressImageFile(file, options = {}) {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH
  const quality = options.quality ?? DEFAULT_QUALITY
  const requestedType = options.mimeType
  const blob = await fileToBlob(file)
  if (!blob) throw new Error('无法读取输入文件')
  const originalSize = blob.size
  const source = await decodeBitmap(blob)
  if (!source) throw new Error('当前环境不支持图片解码')
  const sw = source.width || 1
  const sh = source.height || 1
  const ratio = Math.min(1, maxWidth / sw)
  const width = Math.max(1, Math.round(sw * ratio))
  const height = Math.max(1, Math.round(sh * ratio))
  const canvas = drawToCanvas(source, width, height)
  const type = pickMimeType(requestedType)
  const outBlob = await canvasToBlob(canvas, type, quality)
  if (!outBlob) throw new Error('当前环境不支持图片编码')
  return { blob: outBlob, type, width, height, originalSize, size: outBlob.size }
}

// 处理旧的 base64 dataUrl：把它转换为 Blob，再走一次压缩。
export async function compressBase64DataUrl(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('需要合法的 base64 dataUrl')
  }
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx < 0) throw new Error('base64 格式错误')
  const header = dataUrl.slice(5, commaIdx)
  const base64 = dataUrl.slice(commaIdx + 1)
  const mimeMatch = /^image\/[\w+.-]+;?/.exec(header)
  const mime = mimeMatch ? mimeMatch[0].replace(/;$/, '') : 'image/png'
  let bytes
  if (typeof Buffer !== 'undefined') {
    bytes = Buffer.from(base64, 'base64')
  } else if (typeof atob === 'function') {
    const bin = atob(base64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
    bytes = arr
  } else {
    throw new Error('当前环境不支持 base64 解码')
  }
  const blob = new Blob([bytes], { type: mime })
  return compressImageFile(blob, options)
}

// 估算是否值得压缩（>200KB），UI 用
export function shouldCompress(blob, threshold = 200 * 1024) {
  if (!blob || typeof blob.size !== 'number') return false
  return blob.size > threshold
}

// 给节点 <img> 一个稳定的图片 id（hash 简化）
export function makeImageId(seed = '') {
  const rand = Math.random().toString(36).slice(2, 8)
  return `img-${Date.now().toString(36)}${rand}${seed ? `-${seed}` : ''}`
}

// 写回正文时插入的 img 标签：data-tdocs-img 是真实 id，src 是占位自定义协议
export function renderImageTag(id, alt = '') {
  const safeAlt = String(alt || '').replace(/"/g, '&quot;')
  return `<img data-tdocs-img="${id}" src="tdocs://img/${id}" alt="${safeAlt}" />`
}

// 渲染前的解析：把正文里所有 data-tdocs-img 替换成对应 blob 的 base64 URL
export function resolveTdocsImages(html, lookup) {
  if (!html || typeof lookup !== 'function') return html
  return String(html).replace(/<img\b([^>]*?)>/g, (full, attrs) => {
    const idMatch = /\bdata-tdocs-img="([^"]+)"/.exec(attrs)
    if (!idMatch) return full
    const srcMatch = /\bsrc="([^"]*)"/.exec(attrs)
    const lookupId = srcMatch && srcMatch[1].startsWith('tdocs://img/')
      ? srcMatch[1].slice('tdocs://img/'.length)
      : idMatch[1]
    const url = lookup(lookupId)
    if (!url) return full
    return `<img${attrs.replace(/\bsrc="[^"]*"/, `src="${url}"`)}>`
  })
}
