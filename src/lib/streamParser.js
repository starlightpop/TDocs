// SSE 解析纯函数：从按行/按事件到达的字符串块中解析 OpenAI 兼容流式增量。
// 不依赖浏览器/Node API，方便单测直接传入字符串验证。

// 单条 SSE 事件在文本流里的形式是若干 "key: value\n" 行 + 空行。
// 这里采用按字符累积分隔成事件；当当前块积累到 SSE 终止符 (\n\n) 就 flush 一次。
export function createSseParser({ onEvent, onDone } = {}) {
  let buffer = ''
  return {
    push(chunk) {
      if (chunk == null) return
      buffer += typeof chunk === 'string' ? chunk : String(chunk)
      let idx
      // 循环抽出完整事件（以 \n\n 或 \r\n\r\n 边界）
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2))
        const event = parseSingleEvent(raw)
        if (event === null) continue
        if (event.done) { onDone?.(); return }
        onEvent?.(event)
      }
    },
    flush() {
      // 最后一段没有 \n\n 边界：尽量容忍，把剩余内容当作一次事件尝试解析
      if (!buffer.trim()) { buffer = ''; return }
      const event = parseSingleEvent(buffer)
      buffer = ''
      if (event === null) return
      if (event.done) onDone?.()
      else onEvent?.(event)
    },
  }
}

// 解析一段单事件文本，返回 {done:true} / {data: '...'} / null（忽略的 ping）
function parseSingleEvent(raw) {
  const lines = raw.split(/\r?\n/)
  let data = ''
  let done = false
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim()
    let value = line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') {
      data = data ? `${data}\n${value}` : value
      if (data === '[DONE]') done = true
    }
    // 其他字段（event、id）目前忽略，OpenAI 兼容流只关心 data
  }
  if (done) return { done: true }
  if (!data) return null
  return { data }
}

// 把 SSE data 字符串解析为 JSON，并取 OpenAI 兼容的增量文本。
// 兼容：choices[0].delta.content（标准），以及 choices[0].text（少数厂商兜底）。
export function extractDeltaText(payload) {
  if (!payload) return ''
  let obj
  try { obj = JSON.parse(payload) } catch { return '' }
  if (typeof obj === 'string') return obj
  const choice = obj?.choices?.[0]
  if (!choice) return ''
  if (typeof choice.delta?.content === 'string') return choice.delta.content
  if (Array.isArray(choice.delta?.content)) {
    return choice.delta.content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join('')
  }
  if (typeof choice.text === 'string') return choice.text
  return ''
}

// 纯函数：给一串 SSE data 行（含 [DONE]），返回全部 deltas。
// 既用于单测也方便上层把多 chunk 缓冲一起解析。
export function parseSseStream(lines, onChunk) {
  const parser = createSseParser({
    onEvent: (event) => {
      const text = extractDeltaText(event.data)
      if (text) onChunk?.(text, event.data)
    },
    onDone: () => {},
  })
  for (const line of lines) parser.push(line + '\n\n')
  parser.flush()
}
