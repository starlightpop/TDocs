// 大模型 API 接入（OpenAI 兼容接口，可对接任意兼容 /chat/completions 的服务）

const API_KEY_STORE = 'inkdocs.api.v1'

export function loadApiConfig() {
  try {
    const raw = localStorage.getItem(API_KEY_STORE)
    if (raw) {
      const cfg = JSON.parse(raw)
      return {
        provider: cfg.provider || 'custom',
        baseUrl: cfg.baseUrl || 'https://api.openai.com/v1',
        apiKey: cfg.apiKey || '',
        model: cfg.model || 'gpt-5.5',
      }
    }
  } catch { /* ignore */ }
  return { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-5.5' }
}

export function saveApiConfig(cfg) {
  localStorage.setItem(API_KEY_STORE, JSON.stringify(cfg))
}

export const AI_SYSTEM_PROMPT = `你是一个专业的文档编辑助手。用户会给你一段 HTML 格式的文档内容和修改指令。
请严格按照指令修改内容，并直接返回修改后的完整 HTML（只能使用 p、h1、h2、h3、ul、ol、li、strong、em、u、s、blockquote、pre、code、a、table 等基础标签）。
不要输出任何解释、问候语、markdown 代码块包裹，只输出 HTML 内容本身。`

/** 调用 OpenAI 兼容的 chat/completions 接口 */
export async function callLLM(cfg, messages, { signal } = {}) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7 }),
    signal,
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.error?.message || await res.text() } catch { /* ignore */ }
    throw new Error(`API 请求失败（${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回内容为空')
  return content
}

/** 清理模型输出中可能出现的代码块包裹 */
export function cleanLLMOutput(text) {
  return String(text)
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

/** 简单净化 HTML：移除脚本、事件属性与 javascript: 链接 */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}
