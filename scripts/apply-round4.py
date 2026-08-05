from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, value):
    Path(path).write_text(value, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


# ---------- version ----------
for filename in ('package.json', 'package-lock.json'):
    text = read(filename)
    text = text.replace('"version": "0.1.1-preview"', '"version": "0.2.0-preview"')
    write(filename, text)

# ---------- storage: file kinds, pinning and welcome migration ----------
write('src/lib/storage.js', r'''// 文档存储层：基于 localStorage 的多文档持久化

const STORAGE_KEY = 'inkdocs.documents.v1'
const THEME_KEY = 'inkdocs.theme'
const ACTIVE_KEY = 'inkdocs.activeDoc'
const GROUPS_KEY = 'inkdocs.groups.v1'

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function legacyKindFor(doc) {
  if (doc?.kind === 'word' || doc?.kind === 'document') return doc.kind
  if (doc?.paper === 'a4' || doc?.paper === 'b5') return 'word'
  const oldPaper = localStorage.getItem('inkdocs.paper')
  return oldPaper === 'a4' || oldPaper === 'b5' ? 'word' : 'document'
}

function looksLikeWelcome(doc) {
  return Boolean(doc?.isWelcome || doc?.title === '欢迎使用 TDocs')
}

export function normalizeDoc(doc) {
  const kind = legacyKindFor(doc)
  const isWelcome = looksLikeWelcome(doc)
  const normalized = {
    ...doc,
    kind,
    pinned: isWelcome ? true : Boolean(doc?.pinned),
    isWelcome,
    group: isWelcome ? '' : (doc?.group || ''),
  }
  if (kind === 'word') {
    const oldPaper = localStorage.getItem('inkdocs.paper')
    normalized.paper = doc?.paper === 'b5' || (!doc?.paper && oldPaper === 'b5') ? 'b5' : 'a4'
  } else {
    delete normalized.paper
  }
  return normalized
}

export function loadDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const docs = JSON.parse(raw)
    return Array.isArray(docs) ? docs.map(normalizeDoc) : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.map(normalizeDoc)))
    return true
  } catch (e) {
    console.error('保存失败', e)
    return false
  }
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id) {
  localStorage.setItem(ACTIVE_KEY, id || '')
}

export function createDoc(title = null, content = '', options = {}) {
  const now = Date.now()
  const kind = options.kind === 'word' ? 'word' : 'document'
  const defaultTitle = kind === 'word' ? '无标题 Word' : '无标题文档'
  const doc = {
    id: uid(),
    title: title || defaultTitle,
    content,
    createdAt: now,
    updatedAt: now,
    autoTitle: true,
    group: options.group || '',
    kind,
    pinned: Boolean(options.pinned),
    isWelcome: Boolean(options.isWelcome),
  }
  if (doc.isWelcome) {
    doc.pinned = true
    doc.group = ''
  }
  if (kind === 'word') doc.paper = options.paper === 'b5' ? 'b5' : 'a4'
  return doc
}

// ---------- 分组 ----------
export function loadGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    const groups = JSON.parse(raw)
    return Array.isArray(groups) ? groups : []
  } catch {
    return []
  }
}

export function saveGroups(groups) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
}

export function createGroup(name) {
  return { id: uid(), name }
}

// ---------- 主题 ----------
export function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

// ---------- 工具 ----------
export function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return `今天 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

export function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export function firstLineTitle(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = doc.body.querySelectorAll('h1, h2, h3, p, li, blockquote, pre, td, th')
  for (const b of blocks) {
    const t = (b.textContent || '').trim()
    if (t) return t.slice(0, 40)
  }
  return (doc.body.textContent || '').trim().slice(0, 40)
}
''')

# ---------- code completion: prefix candidates instead of exact three-letter triggers ----------
write('src/lib/codeLanguage.js', r'''export const CODE_LANGUAGES = [
  ['plaintext', '纯文本'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['matlab', 'MATLAB / Octave'],
  ['javascript', 'JavaScript'],
]

export function getCodeLanguageLabel(language) {
  return CODE_LANGUAGES.find(([value]) => value === language)?.[1] || language || '纯文本'
}

const SNIPPETS = {
  python: [
    ['print', 'print()', 1, '输出内容'], ['input', 'input()', 1, '读取输入'], ['len', 'len()', 1, '获取长度'],
    ['range', 'range()', 1, '生成整数序列'], ['enumerate', 'enumerate()', 1, '带索引遍历'],
    ['list', 'list()', 1, '创建列表'], ['dict', 'dict()', 1, '创建字典'], ['set', 'set()', 1, '创建集合'],
    ['def', 'def function_name():\n    pass', 0, '定义函数'], ['class', 'class ClassName:\n    pass', 0, '定义类'],
    ['for', 'for item in iterable:\n    pass', 0, '循环'], ['if', 'if condition:\n    pass', 0, '条件判断'],
    ['try', 'try:\n    pass\nexcept Exception as error:\n    print(error)', 0, '异常处理'],
    ['import', 'import module', 0, '导入模块'], ['from', 'from module import name', 0, '从模块导入'],
  ],
  javascript: [
    ['console.log', 'console.log()', 1, '输出日志'], ['console.error', 'console.error()', 1, '输出错误'],
    ['document.querySelector', 'document.querySelector()', 1, '查询元素'], ['document.querySelectorAll', 'document.querySelectorAll()', 1, '查询多个元素'],
    ['parseInt', 'parseInt()', 1, '转换整数'], ['parseFloat', 'parseFloat()', 1, '转换浮点数'],
    ['function', 'function name() {\n  \n}', 2, '定义函数'], ['const', 'const name = ', 0, '定义常量'],
    ['let', 'let name = ', 0, '定义变量'], ['for', 'for (const item of items) {\n  \n}', 2, '循环'],
    ['if', 'if (condition) {\n  \n}', 2, '条件判断'], ['async', 'async function name() {\n  \n}', 2, '异步函数'],
    ['fetch', 'fetch(url)', 1, '网络请求'], ['JSON.stringify', 'JSON.stringify()', 1, '序列化 JSON'],
  ],
  c: [
    ['printf', 'printf("\\n");', 5, '格式化输出'], ['scanf', 'scanf("", &value);', 11, '读取输入'],
    ['main', 'int main(void) {\n    return 0;\n}', 0, '程序入口'], ['include', '#include <stdio.h>', 0, '包含头文件'],
    ['malloc', 'malloc(sizeof())', 2, '分配内存'], ['free', 'free()', 1, '释放内存'],
  ],
  cpp: [
    ['cout', 'std::cout << value << std::endl;', 8, '标准输出'], ['cin', 'std::cin >> value;', 6, '标准输入'],
    ['main', 'int main() {\n    return 0;\n}', 0, '程序入口'], ['include', '#include <iostream>', 0, '包含头文件'],
    ['vector', 'std::vector<int> values;', 0, '动态数组'], ['string', 'std::string value;', 0, '字符串'],
  ],
  java: [
    ['System.out.println', 'System.out.println();', 2, '输出并换行'], ['System.out.print', 'System.out.print();', 2, '输出'],
    ['main', 'public static void main(String[] args) {\n    \n}', 2, '程序入口'],
    ['class', 'public class Main {\n    \n}', 2, '定义类'], ['ArrayList', 'new ArrayList<>()', 1, '动态数组'],
  ],
  rust: [
    ['println', 'println!("");', 3, '输出并换行'], ['print', 'print!("");', 3, '输出'],
    ['main', 'fn main() {\n    \n}', 2, '程序入口'], ['Vec', 'Vec::new()', 1, '动态数组'],
    ['match', 'match value {\n    _ => {}\n}', 0, '模式匹配'], ['Result', 'Result<(), Box<dyn std::error::Error>>', 0, '结果类型'],
  ],
  matlab: [
    ['disp', 'disp()', 1, '显示内容'], ['fprintf', 'fprintf("\\n")', 3, '格式化输出'],
    ['length', 'length()', 1, '向量长度'], ['size', 'size()', 1, '矩阵尺寸'], ['plot', 'plot(x, y)', 0, '绘图'],
    ['function', 'function result = name(input)\n    result = input;\nend', 0, '定义函数'],
  ],
}

function currentToken(textBeforeCursor) {
  return String(textBeforeCursor || '').match(/[A-Za-z_][A-Za-z0-9_.]*$/)?.[0] || ''
}

export function getCodeCompletionCandidates(language, textBeforeCursor, limit = 8) {
  const token = currentToken(textBeforeCursor)
  if (!token) return []
  const lower = token.toLowerCase()
  return (SNIPPETS[language] || [])
    .map(([label, insert, cursorBack, detail]) => ({ label, insert, cursorBack, detail, replaceLength: token.length }))
    .filter((item) => item.label.toLowerCase().startsWith(lower))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === lower ? 0 : 1
      const bExact = b.label.toLowerCase() === lower ? 0 : 1
      return aExact - bExact || a.label.length - b.label.length || a.label.localeCompare(b.label)
    })
    .slice(0, Math.max(1, limit))
}

export function resolveCodeCompletion(language, textBeforeCursor) {
  return getCodeCompletionCandidates(language, textBeforeCursor, 1)[0] || null
}
''')

# ---------- API provider inference and active provider repair ----------
write('src/lib/api.js', r'''// 大模型 API 接入：配置按厂商独立保存，改写菜单只展示已配置厂商。
import { getProvider } from './aiProviders.js'

const LEGACY_STORE = 'inkdocs.api.v1'
const API_STORE = 'inkdocs.api.v2'

export function inferProviderId(profile = {}) {
  if (profile.provider && profile.provider !== 'custom') return profile.provider
  const base = String(profile.baseUrl || '').toLowerCase()
  const model = String(profile.model || '').toLowerCase()
  const rules = [
    ['deepseek', /deepseek\.com/], ['openrouter', /openrouter\.ai/], ['siliconflow', /siliconflow\.cn/],
    ['gemini', /generativelanguage\.googleapis\.com/], ['anthropic', /anthropic\.com/],
    ['doubao', /volces\.com/], ['qwen', /dashscope\.aliyuncs\.com/], ['moonshot', /moonshot\.cn/],
    ['zhipu', /bigmodel\.cn/], ['ollama', /localhost:11434|127\.0\.0\.1:11434/], ['openai', /openai\.com/],
  ]
  for (const [id, pattern] of rules) if (pattern.test(base)) return id
  if (/^deepseek[-/]/.test(model)) return 'deepseek'
  if (/^claude[-/]/.test(model)) return 'anthropic'
  if (/^gemini[-/]/.test(model)) return 'gemini'
  if (/^qwen[-/:]/.test(model)) return 'qwen'
  if (/^glm[-/]/.test(model)) return 'zhipu'
  if (/^kimi[-/]/.test(model)) return 'moonshot'
  if (/^gpt[-/]/.test(model)) return 'openai'
  return profile.provider || 'custom'
}

function normalizeProfile(profile = {}, providerId = null) {
  const resolvedId = providerId || inferProviderId(profile)
  const provider = getProvider(resolvedId)
  return {
    provider: resolvedId,
    baseUrl: profile.baseUrl || provider.baseUrl || '',
    apiKey: profile.apiKey || '',
    model: profile.model || provider.model || '',
  }
}

function configuredProfiles(store) {
  return Object.values(store.profiles || {})
    .map((profile) => normalizeProfile(profile, profile.provider))
    .filter((profile) => profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim())
}

export function loadApiStore() {
  try {
    const raw = localStorage.getItem(API_STORE)
    if (raw) {
      const value = JSON.parse(raw)
      const profiles = {}
      for (const [storedId, profile] of Object.entries(value.profiles || {})) {
        const id = profile?.provider && profile.provider !== 'custom' ? profile.provider : inferProviderId(profile)
        profiles[id] = normalizeProfile(profile, id)
      }
      const configured = configuredProfiles({ profiles })
      const requested = value.activeProvider
      const activeProvider = profiles[requested]?.apiKey?.trim() ? requested : (configured[0]?.provider || requested || 'custom')
      return { activeProvider, profiles }
    }
  } catch { /* ignore invalid state */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE) || 'null')
    if (legacy) {
      const provider = inferProviderId(legacy)
      const store = { activeProvider: provider, profiles: { [provider]: normalizeProfile(legacy, provider) } }
      localStorage.setItem(API_STORE, JSON.stringify(store))
      return store
    }
  } catch { /* ignore invalid legacy state */ }

  return { activeProvider: 'custom', profiles: {} }
}

export function saveApiStore(store) {
  const profiles = {}
  for (const [storedId, profile] of Object.entries(store?.profiles || {})) {
    const id = profile?.provider || storedId || inferProviderId(profile)
    profiles[id] = normalizeProfile(profile, id)
  }
  const configured = configuredProfiles({ profiles })
  const activeProvider = profiles[store?.activeProvider]
    ? store.activeProvider
    : (configured[0]?.provider || Object.keys(profiles)[0] || 'custom')
  localStorage.setItem(API_STORE, JSON.stringify({ activeProvider, profiles }))
}

export function listConfiguredApiConfigs() {
  return configuredProfiles(loadApiStore())
}

export function loadApiConfig() {
  const store = loadApiStore()
  const configured = configuredProfiles(store)
  const active = store.profiles[store.activeProvider]
  if (active?.apiKey?.trim() && active?.baseUrl?.trim() && active?.model?.trim()) {
    return normalizeProfile(active, store.activeProvider)
  }
  if (configured.length) return configured[0]
  return normalizeProfile(active || {}, store.activeProvider || 'custom')
}

export function saveApiConfig(cfg) {
  const provider = cfg.provider || inferProviderId(cfg)
  const store = loadApiStore()
  const next = {
    activeProvider: provider,
    profiles: { ...store.profiles, [provider]: normalizeProfile(cfg, provider) },
  }
  saveApiStore(next)
}

export const AI_SYSTEM_PROMPT = `你是一个专业的文档编辑助手。用户会给你一段 HTML 格式的文档内容和修改指令。
请严格按照指令修改内容，并直接返回修改后的完整 HTML（只能使用 p、h1、h2、h3、ul、ol、li、strong、em、u、s、blockquote、pre、code、a、table 等基础标签）。
不要输出任何解释、问候语、markdown 代码块包裹，只输出 HTML 内容本身。`

export async function callLLM(cfg, messages, { signal } = {}) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
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

export function cleanLLMOutput(text) {
  return String(text).replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
  return doc.body.innerHTML
}
''')

# ---------- code runner installation guidance ----------
runner = read('electron/code-runner.cjs')
runner = replace_once(runner, "const DEFAULT_TIMEOUT = 8000\n", r'''const DEFAULT_TIMEOUT = 8000

const INSTALL_HELP = {
  python: {
    name: 'Python 3',
    url: 'https://www.python.org/downloads/',
    macCommand: '打开官方下载页安装 Python 3，完成后重新启动 TDocs。',
    winCommand: '从 Python.org 安装，并勾选 Add Python to PATH。',
    linuxCommand: '使用发行版包管理器安装 python3。',
  },
  c: {
    name: 'C 编译工具链',
    url: 'https://developer.apple.com/documentation/xcode/installing-the-command-line-tools',
    macCommand: 'xcode-select --install',
    winCommand: '安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”。',
    linuxCommand: '使用发行版包管理器安装 clang 或 gcc。',
  },
  cpp: {
    name: 'C++ 编译工具链',
    url: 'https://developer.apple.com/documentation/xcode/installing-the-command-line-tools',
    macCommand: 'xcode-select --install',
    winCommand: '安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”。',
    linuxCommand: '使用发行版包管理器安装 clang++ 或 g++。',
  },
  rust: {
    name: 'Rust',
    url: 'https://www.rust-lang.org/tools/install',
    macCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    winCommand: '从 Rust 官方页面下载并运行 rustup-init.exe。',
    linuxCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  },
  java: {
    name: 'Java JDK',
    url: 'https://adoptium.net/temurin/releases/',
    macCommand: '安装 JDK 后重新启动 TDocs，确认 javac 和 java 已加入 PATH。',
    winCommand: '安装 JDK 后重新启动 TDocs，确认 javac 和 java 已加入 PATH。',
    linuxCommand: '安装 JDK 17 或更高版本，并确认 javac 和 java 已加入 PATH。',
  },
  matlab: {
    name: 'GNU Octave 或 MATLAB',
    url: 'https://octave.org/download.html',
    macCommand: '安装 GNU Octave 或 MATLAB，并确保 octave 或 matlab 命令可在终端运行。',
    winCommand: '安装 GNU Octave 或 MATLAB，并确保 octave 或 matlab 命令可在终端运行。',
    linuxCommand: '使用发行版包管理器安装 octave，或配置现有 MATLAB。',
  },
}

function installHelp(language) {
  const item = INSTALL_HELP[language]
  if (!item) return null
  const platformKey = process.platform === 'darwin' ? 'macCommand' : process.platform === 'win32' ? 'winCommand' : 'linuxCommand'
  return {
    title: `缺少 ${item.name} 运行环境`,
    reason: `TDocs 为控制安装体积不会内置 ${item.name}。当前系统 PATH 中没有找到可用运行程序。`,
    url: item.url,
    command: item[platformKey],
  }
}
''', 'runner install help')
runner = replace_once(runner, "    if (result.missing) {\n      result.stderr = `本机没有安装 ${language} 运行环境，或运行程序不在 PATH 中。`\n    }\n\n    return { language, ...result }", "    if (result.missing) {\n      const install = installHelp(language)\n      result.stderr = install ? `${install.reason}\\n${install.command}` : `本机没有安装 ${language} 运行环境，或运行程序不在 PATH 中。`\n      result.install = install\n    }\n\n    return { language, ...result }", 'runner missing result')
runner = runner.replace("  normalizeLanguage,\n  runCode,", "  normalizeLanguage,\n  installHelp,\n  runCode,")
write('electron/code-runner.cjs', runner)

# ---------- preload and Electron native context menu ----------
preload = read('electron/preload.cjs')
preload = preload.replace("  runCode: (payload) => ipcRenderer.invoke('run-code', payload),", "  runCode: (payload) => ipcRenderer.invoke('run-code', payload),\n  readClipboardText: () => ipcRenderer.invoke('clipboard-read-text'),\n  openExternal: (url) => ipcRenderer.invoke('open-external', url),")
write('electron/preload.cjs', preload)

main = read('electron/main.cjs')
main = main.replace("const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron')", "const { app, BrowserWindow, Menu, shell, ipcMain, dialog, clipboard } = require('electron')")
main = replace_once(main, "  win.webContents.setWindowOpenHandler(({ url }) => {\n    if (url.startsWith('http')) shell.openExternal(url)\n    return { action: 'deny' }\n  })\n", r'''  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 使用系统原生编辑菜单，确保粘贴、匹配样式粘贴、拼写建议等行为与 macOS/Windows 一致。
  win.webContents.on('context-menu', (_event, params) => {
    const template = []
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
      }
      if (params.dictionarySuggestions.length) template.push({ type: 'separator' })
      template.push({ label: '添加到词典', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
      template.push({ type: 'separator' })
    }
    if (params.isEditable) {
      template.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { type: 'separator' }, { role: 'selectAll' },
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win })
  })
''', 'native context menu')
main = main.replace("  ipcMain.handle('run-code', async (_event, payload) => runCode(payload))", "  ipcMain.handle('run-code', async (_event, payload) => runCode(payload))\n  ipcMain.handle('clipboard-read-text', () => clipboard.readText())\n  ipcMain.handle('open-external', (_event, url) => {\n    if (typeof url === 'string' && /^https:\\/\\//i.test(url)) return shell.openExternal(url)\n    return false\n  })")
write('electron/main.cjs', main)

# ---------- terminal install panel ----------
terminal = read('src/components/CodeTerminal.jsx')
terminal = terminal.replace("            {run.stderr ? <pre className=\"term-out err\">{run.stderr}</pre> : null}\n            {!run.stdout", "            {run.stderr ? <pre className=\"term-out err\">{run.stderr}</pre> : null}\n            {run.install && (\n              <div className=\"runtime-install-help\">\n                <strong>{run.install.title}</strong>\n                <span>{run.install.reason}</span>\n                {run.install.command && <code>{run.install.command}</code>}\n                <button className=\"btn\" onClick={() => window.tdocs?.openExternal?.(run.install.url)}>打开官方下载页面</button>\n              </div>\n            )}\n            {!run.stdout")
write('src/components/CodeTerminal.jsx', terminal)

# ---------- bubble bar never appears inside code ----------
bubble = read('src/components/BubbleBar.jsx')
bubble = bubble.replace("  if (!editor || !pos) return null", "  const { $from, $to } = editor?.state?.selection || {}\n  const inCode = $from?.parent?.type?.name === 'codeBlock' || $to?.parent?.type?.name === 'codeBlock'\n  if (!editor || !pos || inCode) return null")
write('src/components/BubbleBar.jsx', bubble)

# ---------- sidebar pinning and new-file presentation ----------
sidebar = read('src/components/Sidebar.jsx')
sidebar = sidebar.replace("  onRenameDoc, onSetHeadingLevel, onDragExport, onReorderGroups, onOpenFiles,", "  onRenameDoc, onSetHeadingLevel, onDragExport, onReorderGroups, onOpenFiles, onTogglePin,")
sidebar = sidebar.replace("  const filtered = docs.filter((d) => {", "  const filtered = docs.filter((d) => {")
sidebar = sidebar.replace("  })\n\n  const toggleGroup", "  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)\n\n  const toggleGroup", 1)
sidebar = sidebar.replace("    { label: '重命名', icon: <Icon name=\"edit\" size={15} />, action: () => { setDocEditName(doc.title || ''); setEditingDocId(doc.id) } },\n    { sep: true },", "    { label: '重命名', icon: <Icon name=\"edit\" size={15} />, action: () => { setDocEditName(doc.title || ''); setEditingDocId(doc.id) } },\n    { label: doc.pinned ? '取消置顶' : '置顶', icon: <Icon name=\"pin\" size={15} />, action: () => onTogglePin?.(doc) },\n    { sep: true },")
sidebar = sidebar.replace("        className={`doc-item${doc.id === activeId ? ' active' : ''}`}", "        className={`doc-item${doc.id === activeId ? ' active' : ''}${doc.pinned ? ' pinned' : ''}`}")
sidebar = sidebar.replace("          <div className=\"doc-item-title\">{doc.title || '无标题文档'}</div>", "          <div className=\"doc-item-title\">{doc.pinned && <Icon name=\"pin\" size={12} />}<span>{doc.title || (doc.kind === 'word' ? '无标题 Word' : '无标题文档')}</span></div>")
sidebar = sidebar.replace("  const ungroupedDocs = filtered.filter((d) => !d.group)", "  const pinnedDocs = filtered.filter((d) => d.pinned)\n  const ungroupedDocs = filtered.filter((d) => !d.group && !d.pinned)")
sidebar = sidebar.replace("    const groupDocs = filtered.filter((d) => d.group === group.id)", "    const groupDocs = filtered.filter((d) => d.group === group.id && !d.pinned)")
sidebar = sidebar.replace("            {groups.map(renderGroupSection)}", "            {pinnedDocs.length > 0 && (\n              <div className=\"group-section pinned-section\">\n                <div className=\"pinned-section-label\"><Icon name=\"pin\" size={12} />置顶</div>\n                {pinnedDocs.map(renderDocItem)}\n              </div>\n            )}\n            {groups.map(renderGroupSection)}")
write('src/components/Sidebar.jsx', sidebar)

# ---------- add pin icon ----------
icons = read('src/components/Icons.jsx')
icons = icons.replace("  page: (\n", "  pin: (\n    <svg viewBox=\"0 0 24 24\" {...p}><path d=\"m9 3 6 2-1 5 4 4-5 1-3 6-1-7-4-3 5-2z\" /></svg>\n  ),\n  page: (\n")
write('src/components/Icons.jsx', icons)

# ---------- App: welcome, titles, root creation, pin handler, toolbar Word flag ----------
app = read('src/App.jsx')
welcome = r'''const WELCOME_HTML = `
<h1>欢迎使用 TDocs</h1>
<p>TDocs 0.2.0-preview 是一个本地优先的文档与 Word 双工作区编辑器。欢迎文件默认置顶，也可以删除。</p>
<h2>文档工作区</h2>
<ul>
  <li>连续画布写作、标题大纲、查找替换、自动保存与本地版本历史</li>
  <li>富文本格式、列表、任务清单、引用、表格、图片、链接与 Markdown 粘贴</li>
  <li>浅色、深色及跟随系统主题，支持多档缩放</li>
</ul>
<h2>Word 工作区</h2>
<ul>
  <li>A4 / B5 固定纸张、页边距标尺、自动分页、页码和显式分页符</li>
  <li>按 ⌘/Ctrl + Enter 插入分页符，也可以在页面底部点击“添加页面”</li>
  <li>Word 文件与连续文档是独立文件类型，内容可通过复制粘贴迁移</li>
</ul>
<h2>代码块</h2>
<ul>
  <li>C、C++、Java、JavaScript、Python、Rust、MATLAB / Octave 语法高亮</li>
  <li>连续行号、当前行高亮、前缀补全建议、块内运行按钮和可拖动运行结果</li>
  <li>JavaScript 使用应用自带运行环境；其他语言使用电脑中已安装并加入 PATH 的运行环境</li>
</ul>
<h2>AI 改写</h2>
<ul>
  <li>选区保持高亮、润色、精简、扩写、正式化、口语化及自定义指令</li>
  <li>模型按厂商独立配置，改写窗口只显示已经配置完成的厂商与模型</li>
  <li>支持内联差异预览、接受和撤销</li>
</ul>
<h2>文件与输出</h2>
<ul>
  <li>文件夹、置顶、拖拽移动、内联重命名、本地文件导入</li>
  <li>导出 PDF、DOCX、EPUB、Markdown、HTML 和纯文本</li>
  <li>原生右键菜单支持撤销、重做、剪切、复制、粘贴、匹配样式粘贴、删除和全选</li>
</ul>
<h2>常用快捷键</h2>
<table><tbody>
<tr><th><p>操作</p></th><th><p>快捷键</p></th></tr>
<tr><td><p>查找与替换</p></td><td><p>⌘ / Ctrl + F</p></td></tr>
<tr><td><p>撤销 / 重做</p></td><td><p>⌘ / Ctrl + Z / Shift + Z</p></td></tr>
<tr><td><p>插入分页符</p></td><td><p>⌘ / Ctrl + Enter（Word）</p></td></tr>
<tr><td><p>代码补全</p></td><td><p>Tab</p></td></tr>
<tr><td><p>退出代码块</p></td><td><p>空选区时 ⌘ / Ctrl + C，或点击代码块外</p></td></tr>
</tbody></table>
<hr>
<h2>版本更新</h2>
<h3>0.2.0-preview（当前版本）</h3>
<ul>
  <li>文档与 Word 工作区分离；新增 A4/B5、分页符与空白页保护</li>
  <li>代码块改为独立交互，增加前缀补全、运行环境诊断与官方安装入口</li>
  <li>新增中央设置中心、多厂商 AI 配置、模型识别修复、置顶文件和原生右键菜单</li>
</ul>
<h3>0.1.1-preview（上一个版本）</h3>
<ul>
  <li>加入基础分页、深色主题、AI 改写、代码运行、查找替换和版本历史</li>
</ul>
<blockquote><p>文档内容与配置默认保存在本机。AI 请求和外部下载只在你主动使用对应功能时发生。</p></blockquote>
`
'''
app = re.sub(r"const WELCOME_HTML = `.*?`\n", lambda _m: welcome, app, count=1, flags=re.S)
app = app.replace("    return [createDoc('欢迎使用 TDocs', WELCOME_HTML)]", "    const welcomeDoc = createDoc('欢迎使用 TDocs', WELCOME_HTML, { pinned: true, isWelcome: true })\n    saveDocs([welcomeDoc])\n    return [welcomeDoc]")
app = app.replace("    const doc = createDoc('无标题文档', '', { kind, paper: 'a4' })\n    doc.group = group || activeDoc?.group || ''", "    const doc = createDoc(kind === 'word' ? '无标题 Word' : '无标题文档', '', { kind, paper: 'a4', group })\n    doc.group = group || ''")
app = app.replace("      return { ...createDoc(title, content, { kind: activeDoc?.kind || 'document', paper: activeDoc?.paper || 'a4' }), group: activeDoc?.group || '' }", "      return { ...createDoc(title, content, { kind: activeDoc?.kind || 'document', paper: activeDoc?.paper || 'a4' }), group: '' }")
app = app.replace("  const doRenameDoc = (doc, name) => {\n    persist(docs.map((d) => (d.id === doc.id ? { ...d, title: name?.trim() || '无标题文档', updatedAt: Date.now() } : d)))\n  }", "  const doRenameDoc = (doc, name) => {\n    const fallback = doc.kind === 'word' ? '无标题 Word' : '无标题文档'\n    persist(docs.map((d) => (d.id === doc.id ? { ...d, title: name?.trim() || fallback, updatedAt: Date.now() } : d)))\n  }\n\n  const handleTogglePin = (doc) => {\n    persist(docs.map((d) => (d.id === doc.id ? { ...d, pinned: !d.pinned, updatedAt: Date.now() } : d)))\n  }")
app = app.replace("          onOpenFiles={handleOpenFiles}\n", "          onOpenFiles={handleOpenFiles}\n          onTogglePin={handleTogglePin}\n")
app = app.replace("              <Toolbar editor={editor} onAi={openAi} />", "              <Toolbar editor={editor} onAi={openAi} isWord={activeDoc.kind === 'word'} />")
app = app.replace("          placeholder=\"无标题文档\"", "          placeholder={activeDoc?.kind === 'word' ? '无标题 Word' : '无标题文档'}")
write('src/App.jsx', app)

# ---------- Toolbar: explicit page break ----------
toolbar = read('src/components/Toolbar.jsx')
toolbar = toolbar.replace("export default function Toolbar({ editor, onAi })", "export default function Toolbar({ editor, onAi, isWord = false })")
toolbar = toolbar.replace("      <TB icon=\"redo\" title=\"重做 (⌘⇧Z)\" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />\n      <div className=\"divider\" />", "      <TB icon=\"redo\" title=\"重做 (⌘⇧Z)\" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />\n      {isWord && <TB icon=\"page\" title=\"插入分页符 (⌘/Ctrl+Enter)\" onClick={() => editor.chain().focus().insertPageBreak().run()} />}\n      <div className=\"divider\" />")
write('src/components/Toolbar.jsx', toolbar)

# ---------- AI prompt portal, viewport clamp and configured model only ----------
ai_prompt = read('src/components/AiPrompt.jsx')
ai_prompt = ai_prompt.replace("import { useEffect, useMemo, useRef, useState } from 'react'", "import { useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'")
ai_prompt = ai_prompt.replace("                  const models = item.models?.length ? item.models : [profile.model]", "                  const models = [profile.model]")
ai_prompt = ai_prompt.replace("  const style = {\n    top: pos.anchor === 'above' ? pos.top - 10 : pos.top + 10,\n    left: pos.left,\n    transform: pos.anchor === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',\n  }", "  const width = Math.min(560, Math.max(320, window.innerWidth - 24))\n  const left = Math.max(12, Math.min(window.innerWidth - width - 12, pos.left - width / 2))\n  const requestedTop = pos.anchor === 'above' ? pos.top - 300 : pos.top + 10\n  const top = Math.max(12, Math.min(window.innerHeight - 220, requestedTop))\n  const style = { top, left, width, transform: 'none' }")
ai_prompt = ai_prompt.replace("  return (\n    <div className=\"ai-prompt\"", "  return createPortal(\n    <div className=\"ai-prompt\"")
ai_prompt = ai_prompt.replace("    </div>\n  )\n}", "    </div>,\n    document.body,\n  )\n}")
write('src/components/AiPrompt.jsx', ai_prompt)

# ---------- Editor: page breaks, code completion menu, code-aware selection/context ----------
editor = read('src/components/Editor.jsx')
editor = editor.replace("import { CODE_LANGUAGES, getCodeLanguageLabel, resolveCodeCompletion } from '../lib/codeLanguage.js'", "import { CODE_LANGUAGES, getCodeLanguageLabel, getCodeCompletionCandidates, resolveCodeCompletion } from '../lib/codeLanguage.js'")
page_break = r'''
// ---------- 显式分页符：Word 文件可通过 ⌘/Ctrl+Enter 或“添加页面”插入 ----------
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: () => ['div', { 'data-page-break': 'true', class: 'manual-page-break', contenteditable: 'false' }, ['span', {}, '分页符']],
  addCommands() {
    return {
      insertPageBreak: () => ({ commands }) => commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() }
  },
})
'''
editor = editor.replace("// ---------- 代码块：语法高亮、连续行号、当前行高亮与块内运行 ----------", page_break + "\n// ---------- 代码块：语法高亮、连续行号、当前行高亮与块内运行 ----------")
editor = editor.replace("      Page,\n      AiOldMark,", "      Page,\n      PageBreak,\n      AiOldMark,")
editor = editor.replace("      const code = document.createElement('code')\n      pre.append(gutter, code)\n\n      const footer", "      const code = document.createElement('code')\n      pre.append(gutter, code)\n\n      const completionMenu = document.createElement('div')\n      completionMenu.className = 'code-completion-menu'\n      completionMenu.hidden = true\n\n      const footer")
editor = editor.replace("      shell.append(head, pre, footer)", "      shell.append(head, pre, footer, completionMenu)")
completion_code = r'''

      const applyCompletion = (candidate) => {
        const { state } = view
        const { empty, from } = state.selection
        if (!empty || !candidate) return
        const start = Math.max(0, from - candidate.replaceLength)
        let tr = state.tr.insertText(candidate.insert, start, from)
        const cursor = start + candidate.insert.length - (candidate.cursorBack || 0)
        tr = tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView()
        view.dispatch(tr)
        completionMenu.hidden = true
      }

      const renderCompletions = () => {
        const pos = getPos()
        const { state } = view
        if (typeof pos !== 'number' || !state.selection.empty) { completionMenu.hidden = true; return }
        const start = pos + 1
        const end = start + node.content.size
        if (state.selection.from < start || state.selection.from > end) { completionMenu.hidden = true; return }
        const offset = Math.max(0, Math.min(node.content.size, state.selection.from - start))
        const before = node.textBetween(0, offset, '\n', '\n')
        const candidates = getCodeCompletionCandidates(node.attrs.language || 'plaintext', before)
        if (!candidates.length) { completionMenu.hidden = true; return }
        completionMenu.replaceChildren(...candidates.map((candidate, index) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = `code-completion-item${index === 0 ? ' active' : ''}`
          const label = document.createElement('strong')
          label.textContent = candidate.label
          const detail = document.createElement('span')
          detail.textContent = candidate.detail || ''
          button.append(label, detail)
          button.addEventListener('mousedown', (event) => { event.preventDefault(); applyCompletion(candidate) })
          return button
        }))
        const caret = view.coordsAtPos(state.selection.from)
        const rect = shell.getBoundingClientRect()
        completionMenu.style.left = `${Math.max(44, Math.min(rect.width - 240, caret.left - rect.left))}px`
        completionMenu.style.top = `${Math.max(40, caret.bottom - rect.top + 4)}px`
        completionMenu.hidden = false
      }
'''
editor = editor.replace("      const render = () => {", completion_code + "\n      const render = () => {")
editor = editor.replace("        syncActiveLine()\n      }\n      const onSelection = () => syncActiveLine()", "        syncActiveLine()\n        requestAnimationFrame(renderCompletions)\n      }\n      const onSelection = () => { syncActiveLine(); requestAnimationFrame(renderCompletions) }\n      const hideCompletions = () => { completionMenu.hidden = true }")
editor = editor.replace("      view.dom.addEventListener('tdocs:code-selection', onSelection)\n      render()", "      view.dom.addEventListener('tdocs:code-selection', onSelection)\n      view.dom.addEventListener('tdocs:hide-code-completions', hideCompletions)\n      render()")
editor = editor.replace("        destroy: () => view.dom.removeEventListener('tdocs:code-selection', onSelection),", "        destroy: () => {\n          view.dom.removeEventListener('tdocs:code-selection', onSelection)\n          view.dom.removeEventListener('tdocs:hide-code-completions', hideCompletions)\n        },")
editor = editor.replace("      'Mod-c': () => {", "      Escape: () => {\n        this.editor.view.dom.dispatchEvent(new CustomEvent('tdocs:hide-code-completions'))\n        return false\n      },\n      'Mod-c': () => {")
# build pages at explicit breaks
editor = editor.replace("  const toPaged = (rebuild = false) => {\n    if (!editor) return\n    const { state, view } = editor\n    if (!rebuild && state.doc.firstChild?.type.name === 'page') return\n    const blocks = flattenBlocks(state)\n    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]\n    const pageNode = state.schema.nodes.page.create(null, content)\n    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pageNode))\n  }", r'''  const buildPagesFromBlocks = (state, blocks) => {
    const pages = []
    let current = []
    const flush = () => {
      pages.push(state.schema.nodes.page.create(null, current.length ? current : [state.schema.nodes.paragraph.create()]))
      current = []
    }
    for (const block of blocks) {
      current.push(block)
      if (block.type.name === 'pageBreak') flush()
    }
    if (current.length || pages.length === 0) flush()
    return pages
  }

  const toPaged = (rebuild = false) => {
    if (!editor) return
    const { state, view } = editor
    if (!rebuild && state.doc.firstChild?.type.name === 'page') return
    const blocks = flattenBlocks(state)
    const pages = buildPagesFromBlocks(state, blocks)
    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pages))
  }''')
enforce = r'''
  const enforceManualPageBreaks = (state, view) => {
    let pagePos = 0
    for (let pageIndex = 0; pageIndex < state.doc.childCount; pageIndex += 1) {
      const page = state.doc.child(pageIndex)
      if (page.type.name !== 'page') { pagePos += page.nodeSize; continue }
      const children = []
      page.forEach((child) => children.push(child))
      const breakIndex = children.findIndex((child) => child.type.name === 'pageBreak')
      if (breakIndex >= 0 && breakIndex < children.length - 1) {
        const left = children.slice(0, breakIndex + 1)
        const right = children.slice(breakIndex + 1)
        const replacement = [
          state.schema.nodes.page.create(page.attrs, left),
          state.schema.nodes.page.create(null, right.length ? right : [state.schema.nodes.paragraph.create()]),
        ]
        dispatchLayout(view, state.tr.replaceWith(pagePos, pagePos + page.nodeSize, replacement))
        return true
      }
      pagePos += page.nodeSize
    }
    return false
  }

'''
editor = editor.replace("  // 删除内容后，后页内容应像 Word 一样自动向前回流。", enforce + "  // 删除内容后，后页内容应像 Word 一样自动向前回流。")
editor = editor.replace("      const current = pages[index]\n      const next = pages[index + 1]", "      const current = pages[index]\n      const next = pages[index + 1]\n      if (current.node.lastChild?.type.name === 'pageBreak') continue")
editor = editor.replace("    const { view, state } = editor\n    if (normalizeCodeFragments(state, view)) return true", "    const { view, state } = editor\n    if (enforceManualPageBreaks(state, view)) return true\n    if (normalizeCodeFragments(state, view)) return true")
# context menu and bubble behavior
pattern = re.compile(r"  // 右键菜单项\n  const buildCtxItems = \(\) => \{.*?\n  \}\n\n  // 选区浮动条定位", re.S)
replacement = r'''  // 浏览器开发模式使用自绘菜单；Electron 正式版使用系统原生编辑菜单。
  const buildCtxItems = () => {
    if (!editor) return []
    const chain = () => editor.chain().focus()
    const { $from, $to } = editor.state.selection
    const inCode = $from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock'
    const pasteText = async () => {
      const text = await window.tdocs?.readClipboardText?.() ?? await navigator.clipboard.readText()
      if (!text) return
      const { state, view } = editor
      view.dispatch(state.tr.insertText(text).scrollIntoView())
    }
    const selectAll = () => {
      if (!inCode) { chain().selectAll().run(); return }
      const { state, view } = editor
      const depth = $from.depth
      const start = $from.before(depth) + 1
      const end = start + $from.parent.content.size
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
    }
    const base = [
      { label: '撤销', shortcut: '⌘Z', icon: <Icon name="undo" size={15} />, disabled: !editor.can().undo(), action: () => chain().undo().run() },
      { label: '重做', shortcut: '⌘⇧Z', icon: <Icon name="redo" size={15} />, disabled: !editor.can().redo(), action: () => chain().redo().run() },
      { sep: true },
      { label: '剪切', shortcut: '⌘X', icon: <Icon name="edit" size={15} />, action: () => document.execCommand('cut') },
      { label: '复制', shortcut: '⌘C', icon: <Icon name="doc" size={15} />, action: () => document.execCommand('copy') },
      { label: '粘贴', shortcut: '⌘V', icon: <Icon name="paste" size={15} />, action: pasteText },
      { label: '全选', shortcut: '⌘A', icon: <Icon name="doc" size={15} />, action: selectAll },
    ]
    if (inCode) return base
    return [
      ...base,
      { sep: true },
      { label: '加粗', icon: <Icon name="bold" size={15} />, action: () => chain().toggleBold().run() },
      { label: '斜体', icon: <Icon name="italic" size={15} />, action: () => chain().toggleItalic().run() },
      { label: '高亮', icon: <Icon name="highlight" size={15} />, action: () => chain().toggleHighlight().run() },
      { label: '清除格式', icon: <Icon name="eraser" size={15} />, action: () => chain().clearNodes().unsetAllMarks().run() },
      { sep: true },
      { label: 'AI 改写', icon: <Icon name="sparkle" size={15} />, action: () => onAi?.() },
    ]
  }

  // 选区浮动条定位'''
editor, count = pattern.subn(replacement, editor, count=1)
if count != 1:
    raise RuntimeError('failed to replace editor context menu')
editor = editor.replace("    if (from === to) { setBubblePos(null); return }", "    const { $from, $to } = editor.state.selection\n    const inCode = $from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock'\n    if (from === to || inCode) { setBubblePos(null); return }")
editor = editor.replace("        e.preventDefault()\n        setCtxMenu({ x: e.clientX, y: e.clientY })", "        if (window.tdocs) return\n        e.preventDefault()\n        setCtxMenu({ x: e.clientX, y: e.clientY })")
editor = editor.replace("      </div>\n      {ctxMenu && (", "      </div>\n      {paged && (\n        <button className=\"add-word-page\" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus('end').insertPageBreak().run()}>\n          <Icon name=\"plus\" size={14} />添加页面\n        </button>\n      )}\n      {ctxMenu && (")
write('src/components/Editor.jsx', editor)

# ---------- CSS overrides ----------
css = read('src/app.css')
css += r'''

/* ---------- 0.2.0 regression fixes ---------- */
.new-doc-split {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
}
.new-doc-btn {
  min-width: 0;
  width: 100%;
  justify-content: center;
  white-space: nowrap;
  overflow: visible;
  border-radius: var(--radius-md) 0 0 var(--radius-md) !important;
}
.new-doc-arrow {
  width: 34px;
  min-width: 34px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0 !important;
}
.new-doc-menu { width: 240px; }
.new-doc-menu .menu-item > span { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.new-doc-menu small { color: var(--text-3); font-size: 11px; margin-top: 2px; }
.pinned-section { margin-bottom: 8px; }
.pinned-section-label { display: flex; align-items: center; gap: 5px; padding: 4px 8px; color: var(--text-3); font-size: 11px; }
.doc-item-title { display: flex; align-items: center; gap: 5px; min-width: 0; }
.doc-item-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-item.pinned { border-color: color-mix(in srgb, var(--accent) 38%, var(--border)); }

.ai-prompt {
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  overflow: auto;
  z-index: 920;
}
.ai-prompt-head { position: sticky; top: 0; z-index: 3; background: var(--surface); }
.ai-model-btn { max-width: 240px; }
.ai-model-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-model-menu { max-height: min(320px, calc(100vh - 120px)); overflow: auto; }

.runtime-install-help {
  display: grid;
  gap: 7px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #343a46;
  border-radius: 8px;
  background: #151922;
  color: #cbd2df;
  font-family: var(--font-ui);
  font-size: 12px;
}
.runtime-install-help strong { color: #f1f4fa; }
.runtime-install-help code { display: block; padding: 7px 8px; border-radius: 6px; background: #0b0e13; color: #9ed0ff; user-select: text; }
.runtime-install-help .btn { justify-self: start; color: #fff; border-color: #3b4658; background: #202735; }

.code-block-shell { position: relative; }
.code-completion-menu {
  position: absolute;
  z-index: 80;
  width: 230px;
  max-height: 240px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.code-completion-menu[hidden] { display: none; }
.code-completion-item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  text-align: left;
  font-family: var(--font-mono);
  cursor: pointer;
}
.code-completion-item:hover,
.code-completion-item.active { background: var(--accent-soft); }
.code-completion-item strong { overflow: hidden; text-overflow: ellipsis; }
.code-completion-item span { color: var(--text-3); font-family: var(--font-ui); font-size: 11px; }

.manual-page-break {
  position: relative;
  height: 18px;
  margin: 10px 0;
  border-top: 1px dashed var(--border-strong);
  pointer-events: none;
}
.manual-page-break span {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 7px;
  background: var(--page-bg);
  color: var(--text-3);
  font-size: 10px;
}
.add-word-page {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  margin: 4px auto 28px;
  padding: 7px 13px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.add-word-page:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
'''
write('src/app.css', css)

# ---------- tests ----------
write('tests/round4.test.mjs', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getCodeCompletionCandidates, resolveCodeCompletion } from '../src/lib/codeLanguage.js'

const editor = fs.readFileSync('src/components/Editor.jsx', 'utf8')
const sidebar = fs.readFileSync('src/components/Sidebar.jsx', 'utf8')
const main = fs.readFileSync('electron/main.cjs', 'utf8')
const runner = fs.readFileSync('electron/code-runner.cjs', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')

test('代码补全从首字母开始提供候选，而非要求完整触发词', () => {
  const candidates = getCodeCompletionCandidates('python', 'p')
  assert.ok(candidates.some((item) => item.label === 'print'))
  assert.equal(resolveCodeCompletion('javascript', 'con')?.label, 'console.log')
})

test('代码块选区不会显示普通富文本浮动菜单', () => {
  assert.match(editor, /from === to \|\| inCode/)
  assert.match(editor, /if \(window\.tdocs\) return/)
})

test('Electron 原生右键菜单包含粘贴与匹配样式粘贴', () => {
  assert.match(main, /role: 'paste'/)
  assert.match(main, /role: 'pasteAndMatchStyle'/)
})

test('Word 支持显式分页符和添加页面', () => {
  assert.match(editor, /name: 'pageBreak'/)
  assert.match(editor, /add-word-page/)
  assert.match(editor, /current\.node\.lastChild\?\.type\.name === 'pageBreak'/)
})

test('运行环境缺失时返回官方安装信息', () => {
  assert.match(runner, /INSTALL_HELP/)
  assert.match(runner, /installHelp\(language\)/)
  assert.match(runner, /python\.org\/downloads/)
})

test('DeepSeek 配置可按接口地址推断厂商', () => {
  assert.match(api, /deepseek\\\.com/)
  assert.match(api, /inferProviderId/)
})

test('新建文件默认不继承当前文件夹且 Word 使用独立标题', () => {
  assert.match(app, /kind === 'word' \? '无标题 Word'/)
  assert.match(app, /doc\.group = group \|\| ''/)
})

test('欢迎文件和普通文件均支持置顶', () => {
  assert.match(app, /pinned: true, isWelcome: true/)
  assert.match(sidebar, /取消置顶/)
  assert.match(sidebar, /pinnedDocs/)
})
''')

print('round 4 patch applied')
