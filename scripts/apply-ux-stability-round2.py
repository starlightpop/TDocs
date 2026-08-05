from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'patch point not found: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Shared code-language definitions and lightweight IDE-style completions.
# ---------------------------------------------------------------------------
write('src/lib/codeLanguage.js', r'''export const CODE_LANGUAGES = [
  ['plaintext', '纯文本'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['matlab', 'MATLAB'],
  ['javascript', 'JavaScript'],
]

export function getCodeLanguageLabel(language) {
  return CODE_LANGUAGES.find(([value]) => value === language)?.[1] || language || '纯文本'
}

const COMPLETIONS = {
  python: {
    pri: { insert: 'print()', cursorBack: 1 },
    len: { insert: 'len()', cursorBack: 1 },
    inp: { insert: 'input()', cursorBack: 1 },
    ran: { insert: 'range()', cursorBack: 1 },
  },
  javascript: {
    con: { insert: 'console.log()', cursorBack: 1 },
    doc: { insert: 'document.querySelector()', cursorBack: 1 },
    par: { insert: 'parseInt()', cursorBack: 1 },
  },
  c: {
    pri: { insert: 'printf("\\n");', cursorBack: 5 },
    sca: { insert: 'scanf("", &value);', cursorBack: 11 },
  },
  cpp: {
    cou: { insert: 'cout << value << endl;', cursorBack: 8 },
    cin: { insert: 'cin >> value;', cursorBack: 6 },
  },
  java: {
    sou: { insert: 'System.out.println();', cursorBack: 2 },
    pri: { insert: 'System.out.print();', cursorBack: 2 },
  },
  rust: {
    pri: { insert: 'println!("");', cursorBack: 3 },
    vec: { insert: 'Vec::new()', cursorBack: 1 },
  },
  matlab: {
    dis: { insert: 'disp()', cursorBack: 1 },
    len: { insert: 'length()', cursorBack: 1 },
  },
}

export function resolveCodeCompletion(language, textBeforeCursor) {
  const token = String(textBeforeCursor || '').match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0]
  if (!token) return null
  const hit = COMPLETIONS[language]?.[token]
  if (!hit) return null
  return { ...hit, replaceLength: token.length }
}
''')


# ---------------------------------------------------------------------------
# Find/replace: dock under toolbar and persist the previous search state.
# ---------------------------------------------------------------------------
write('src/components/FindReplace.jsx', r'''import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { findTextMatches } from '../lib/search.js'
import { setSearchHighlights } from '../extensions/SearchHighlight.js'

const STORE_KEY = 'inkdocs.findReplace.v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore invalid local state */ }
  return { query: '', replacement: '', caseSensitive: false }
}

export default function FindReplace({ editor, onClose }) {
  const initial = useRef(loadState()).current
  const [query, setQuery] = useState(initial.query || '')
  const [replacement, setReplacement] = useState(initial.replacement || '')
  const [caseSensitive, setCaseSensitive] = useState(Boolean(initial.caseSensitive))
  const [matches, setMatches] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)

  const refresh = useCallback(() => {
    if (!editor || !query) {
      setMatches([])
      setActiveIndex(-1)
      return
    }
    const next = findTextMatches(editor.state.doc, query, caseSensitive)
    setMatches(next)
    setActiveIndex((current) => {
      if (!next.length) return -1
      return current >= 0 && current < next.length ? current : 0
    })
  }, [editor, query, caseSensitive])

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ query, replacement, caseSensitive }))
  }, [query, replacement, caseSensitive])

  useEffect(() => {
    refresh()
    if (!editor) return undefined
    editor.on('update', refresh)
    return () => editor.off('update', refresh)
  }, [editor, refresh])

  useEffect(() => {
    setSearchHighlights(editor, matches, activeIndex)
    return () => setSearchHighlights(editor, [], -1)
  }, [editor, matches, activeIndex])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const move = (delta) => {
    if (!matches.length || !editor) return
    const nextIndex = (activeIndex + delta + matches.length) % matches.length
    const range = matches[nextIndex]
    setActiveIndex(nextIndex)
    editor.chain().focus().setTextSelection(range).scrollIntoView().run()
  }

  const replaceCurrent = () => {
    if (!editor || activeIndex < 0 || !matches[activeIndex]) return
    const range = matches[activeIndex]
    editor.chain().focus().insertContentAt(range, replacement).run()
  }

  const replaceAll = () => {
    if (!editor || !matches.length) return
    let tr = editor.state.tr
    for (const range of [...matches].sort((a, b) => b.from - a.from)) {
      tr = tr.insertText(replacement, range.from, range.to)
    }
    editor.view.dispatch(tr.scrollIntoView())
  }

  return (
    <div className="find-replace find-replace-dock" role="search" aria-label="查找和替换">
      <div className="find-row">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          placeholder="查找"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') move(event.shiftKey ? -1 : 1)
            if (event.key === 'Escape') onClose()
          }}
        />
        <span className="find-count">{matches.length ? `${Math.max(0, activeIndex) + 1}/${matches.length}` : '0/0'}</span>
        <button className="icon-btn" data-tip="上一个" disabled={!matches.length} onClick={() => move(-1)}>↑</button>
        <button className="icon-btn" data-tip="下一个" disabled={!matches.length} onClick={() => move(1)}>↓</button>
        <button className="icon-btn" data-tip="关闭" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="replace-row">
        <Icon name="edit" size={16} />
        <input
          value={replacement}
          placeholder="替换为"
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') replaceCurrent()
            if (event.key === 'Escape') onClose()
          }}
        />
        <button className="btn" disabled={activeIndex < 0} onClick={replaceCurrent}>替换</button>
        <button className="btn" disabled={!matches.length} onClick={replaceAll}>全部替换</button>
      </div>
      <label className="find-option">
        <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
        区分大小写
      </label>
    </div>
  )
}
''')


# ---------------------------------------------------------------------------
# Provider metadata shared by settings and the rewrite model picker.
# ---------------------------------------------------------------------------
write('src/lib/aiProviders.js', r'''export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6', models: ['gpt-5.6', 'gpt-5.5', 'gpt-5'] },
  { id: 'anthropic', name: 'Anthropic（Claude）', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash', models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  { id: 'doubao', name: '字节 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2.1-pro', models: ['doubao-seed-2.1-pro', 'doubao-seed-2.1-turbo'] },
  { id: 'qwen', name: '阿里 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash'] },
  { id: 'moonshot', name: 'Moonshot（Kimi）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', models: ['kimi-k3', 'kimi-k2.7-code'] },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', models: ['glm-5.2', 'glm-5', 'glm-4.6'] },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4', models: ['deepseek-ai/DeepSeek-V4', 'moonshotai/Kimi-k3', 'Qwen/Qwen3.8-Max'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash', models: ['deepseek/deepseek-v4-flash', 'openai/gpt-5.5', 'anthropic/claude-sonnet-5'] },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', models: ['qwen3:8b', 'deepseek-r1:8b', 'llama4:10b'] },
  { id: 'custom', name: '自定义', baseUrl: '', model: '', models: [] },
]

export function getProvider(providerId) {
  return PROVIDERS.find((provider) => provider.id === providerId) || PROVIDERS[PROVIDERS.length - 1]
}
''')


# ---------------------------------------------------------------------------
# AI prompt: no API settings shortcut; current model is visible and switchable
# in a provider-grouped menu without leaving the rewrite flow.
# ---------------------------------------------------------------------------
write('src/components/AiPrompt.jsx', r'''// 浮动改写输入框：上下文选项、模型切换、结果 diff 对照、可拖拽
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Icon } from './Icons.jsx'
import { loadApiConfig, saveApiConfig, callLLM, cleanLLMOutput, sanitizeHtml } from '../lib/api.js'
import { PROVIDERS, getProvider } from '../lib/aiProviders.js'

function getSelectionHtml(editor, selection) {
  if (!selection || !editor) return ''
  const frag = editor.state.doc.slice(selection.from, selection.to).content
  const dom = DOMSerializer.fromSchema(editor.state.schema).serializeFragment(frag)
  const tmp = document.createElement('div')
  tmp.appendChild(dom)
  return tmp.innerHTML
}

function textOf(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim()
}

function splitParagraphs(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  const blocks = [...d.body.children].filter((el) => el.tagName === 'P' || /^H[1-6]$/.test(el.tagName))
  if (blocks.length === 0) return [{ html: d.body.innerHTML }]
  return blocks.map((el) => el.outerHTML)
}

export default function AiPrompt({ editor, selection, pos, onClose, onInlineDiff }) {
  const [text, setText] = useState('')
  const [withContext, setWithContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [accepted, setAccepted] = useState(null)
  const [cfg, setCfg] = useState(loadApiConfig)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const inputRef = useRef(null)
  const promptRef = useRef(null)

  const selectionHtml = useMemo(() => getSelectionHtml(editor, selection), [editor, selection])
  const fullHtml = useMemo(() => editor?.getHTML?.() || '', [editor])
  const provider = getProvider(cfg.provider)

  useEffect(() => {
    if (!modelMenuOpen) return undefined
    const close = (event) => {
      if (!promptRef.current?.contains(event.target)) setModelMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [modelMenuOpen])

  const chooseModel = (nextProvider, model) => {
    const next = {
      ...cfg,
      provider: nextProvider.id,
      baseUrl: nextProvider.baseUrl || cfg.baseUrl,
      model,
    }
    setCfg(next)
    saveApiConfig(next)
    setModelMenuOpen(false)
  }

  const run = async () => {
    if (!cfg.apiKey.trim()) {
      setError('尚未配置 API Key：请在右上角“设置 → AI 配置”中完成配置')
      return
    }
    const instruction = text.trim()
    if (!instruction) {
      setError('请输入改写要求，例如：换一种更有画面感的表达')
      return
    }
    setLoading(true)
    setError('')
    const started = Date.now()
    try {
      if (selection) {
        const sys = withContext
          ? '你是文档编辑助手。用户给出整篇文档和改写指令，请只改写选中的内容，直接输出改写后的内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
          : '你是文档编辑助手。用户给出选中内容和改写指令，请改写后直接输出内容（HTML，仅 p/strong/em/u/s 等基础标签），不要解释。'
        const answer = await callLLM(cfg, [
          { role: 'system', content: sys },
          { role: 'user', content: withContext
            ? `改写指令：${instruction}\n\n整篇文档（上下文）：\n${fullHtml}\n\n请只改写“选中内容”并输出：\n${selectionHtml}`
            : `改写指令：${instruction}\n\n选中内容：\n${selectionHtml}` },
        ])
        const newHtml = sanitizeHtml(cleanLLMOutput(answer))
        onInlineDiff?.({ oldHtml: selectionHtml, newHtml, range: { ...selection } })
        onClose()
      } else {
        const answer = await callLLM(cfg, [
          { role: 'system', content: '你是文档编辑助手。请按指令改写整篇文档，直接输出完整修改后的 HTML（仅 p/h1-h6/ul/ol/li/strong/em/u/s 等基础标签），不要解释。' },
          { role: 'user', content: `改写指令：${instruction}\n\n文档内容：\n${fullHtml}` },
        ])
        const newHtml = sanitizeHtml(cleanLLMOutput(answer))
        const oldParts = splitParagraphs(fullHtml)
        const newParts = splitParagraphs(newHtml)
        const parts = oldParts.map((old, i) => ({ old, new: newParts[i] || newParts[newParts.length - 1] || newHtml }))
        setResult({ mode: 'full', oldHtml: fullHtml, newHtml, parts })
      }
    } catch (e) {
      setError(`${e.message || String(e)}（耗时 ${Math.round((Date.now() - started) / 1000)}s）`)
    } finally {
      setLoading(false)
    }
  }

  const apply = (mode, partIdx) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (mode === 'part') {
      const ranges = []
      editor.state.doc.descendants((node, p) => {
        if (node.type.name === 'paragraph') ranges.push({ from: p, to: p + node.nodeSize })
      })
      const range = ranges[partIdx]
      if (range) chain.insertContentAt(range, result.parts[partIdx].new).run()
      setAccepted((prev) => { const next = new Set(prev === 'all' ? [] : prev || []); next.add(partIdx); return next })
    } else if (mode === 'all') {
      chain.setContent(result.newHtml, true).run()
      onClose()
    }
  }

  const dragRef = useRef(null)
  const onDragStart = (e) => {
    if (e.target.closest('button, input, textarea, .ai-model-menu')) return
    const prompt = e.currentTarget.closest('.ai-prompt')
    if (!prompt) return
    const rect = prompt.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, el: prompt }
    const onMove = (ev) => {
      const state = dragRef.current
      if (!state) return
      state.el.style.left = `${ev.clientX - state.dx}px`
      state.el.style.top = `${ev.clientY - state.dy}px`
      state.el.style.transform = 'none'
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const style = {
    top: pos.anchor === 'above' ? pos.top - 10 : pos.top + 10,
    left: pos.left,
    transform: pos.anchor === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  }

  return (
    <div className="ai-prompt" style={style} ref={promptRef} onMouseDown={(event) => event.stopPropagation()}>
      <div className="ai-prompt-head" onMouseDown={onDragStart}>
        <span><Icon name="sparkle" size={13} />AI 改写{result ? ' · 结果' : ''}</span>
        <div className="ai-prompt-head-actions">
          <div className="menu-wrap ai-model-picker">
            <button className="ai-model-btn" type="button" onClick={() => setModelMenuOpen((value) => !value)}>
              <span>{provider.name} · {cfg.model || '未选择模型'}</span>
              <Icon name="chevronDown" size={11} />
            </button>
            {modelMenuOpen && (
              <div className="menu ai-model-menu" onClick={(event) => event.stopPropagation()}>
                {PROVIDERS.filter((item) => item.models.length).map((item) => (
                  <div className="ai-model-group" key={item.id}>
                    <div className="settings-label">{item.name}</div>
                    {item.models.map((model) => (
                      <button
                        key={`${item.id}:${model}`}
                        className={`menu-item${cfg.provider === item.id && cfg.model === model ? ' active' : ''}`}
                        onClick={() => chooseModel(item, model)}
                      >
                        <span>{model}</span>
                        {cfg.provider === item.id && cfg.model === model && <span className="menu-item-check">✓</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" data-tip="关闭" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

      {!result ? (
        <>
          <div className="ai-quick-actions" aria-label="常用 AI 指令">
            {[
              ['润色', '润色这段文字，保持原意和事实不变，使表达更自然。'],
              ['精简', '压缩这段文字，删除重复和空泛表达，保留关键信息。'],
              ['扩写', '在不虚构事实的前提下扩写，补足必要细节和衔接。'],
              ['正式', '改成清晰、克制、专业的正式书面表达。'],
              ['口语', '改成自然、顺畅、像真人交流的口语表达。'],
            ].map(([label, prompt]) => (
              <button key={label} className="ai-quick-action" type="button" onClick={() => setText(prompt)}>{label}</button>
            ))}
          </div>
          <textarea
            ref={inputRef}
            className={`ai-prompt-input${text.trim() ? ' filled' : ''}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={selection ? '输入改写要求，例如：更有画面感、更简练…' : '输入改写要求（未选中文字时将改写整篇文档）'}
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
              if (e.key === 'Escape') onClose()
            }}
          />
          {selection && (
            <label className="ai-prompt-ctx">
              <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
              联系上下文改写
            </label>
          )}
          {withContext && selection && <div className="ai-prompt-warn">⚠ 将上传整篇文档作为上下文，消耗大量 Token</div>}
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">⌘/Ctrl+Enter</span>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? '改写中…' : '开始'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="ai-result-view">
            <div className="ai-result-view-hint">共 {result.parts.length} 段，可逐段接受</div>
            {result.parts.map((part, index) => (
              <div key={index} className="ai-diff">
                <div className="ai-diff-old">{textOf(part.old) || '（空段）'}</div>
                <div className="ai-diff-arrow"><Icon name="chevronDown" size={12} /></div>
                <div className="ai-diff-new" dangerouslySetInnerHTML={{ __html: part.new }} />
                <button className="ai-diff-accept" disabled={accepted === 'all' || (accepted && accepted.has(index))} onClick={() => apply('part', index)}>
                  {accepted && accepted.has(index) ? '✓ 已接受' : '接受此段'}
                </button>
              </div>
            ))}
          </div>
          {error && <div className="ai-error ai-prompt-error">{error}</div>}
          <div className="ai-prompt-actions">
            <span className="ai-prompt-hint">{Math.round((result.newHtml?.length || 0) / 100) / 10}KB</span>
            <button className="btn" onClick={() => setResult(null)}>返回修改</button>
            <button className="btn btn-primary" onClick={() => apply('all')}>全部替换</button>
          </div>
        </>
      )}
    </div>
  )
}
''')


# ---------------------------------------------------------------------------
# AI settings panel imports provider metadata from the shared source.
# ---------------------------------------------------------------------------
ai_panel = read('src/components/AiPanel.jsx')
ai_panel = replace_once(
    ai_panel,
    "import { loadApiConfig, saveApiConfig, callLLM } from '../lib/api.js'\n",
    "import { loadApiConfig, saveApiConfig, callLLM } from '../lib/api.js'\nimport { PROVIDERS } from '../lib/aiProviders.js'\n",
    'AiPanel provider import',
)
ai_panel = re.sub(
    r"\n// 预设主流大模型厂商[\s\S]*?\nexport const PROVIDERS = \[[\s\S]*?\n\]\n\n/\*\* AI 配置面板",
    "\n/** AI 配置面板",
    ai_panel,
    count=1,
)
if "export const PROVIDERS" in ai_panel:
    raise SystemExit('AiPanel provider table was not removed')
write('src/components/AiPanel.jsx', ai_panel)


# ---------------------------------------------------------------------------
# Editor: logical cross-page code blocks, stable pagination, code completion,
# explicit exit command, and selection-range reporting.
# ---------------------------------------------------------------------------
editor = read('src/components/Editor.jsx')
editor = replace_once(
    editor,
    "import { Plugin, PluginKey } from '@tiptap/pm/state'",
    "import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'",
    'Editor TextSelection import',
)
editor = replace_once(
    editor,
    "import { SearchHighlightExtension } from '../extensions/SearchHighlight.js'\n",
    "import { SearchHighlightExtension } from '../extensions/SearchHighlight.js'\nimport { CODE_LANGUAGES, getCodeLanguageLabel, resolveCodeCompletion } from '../lib/codeLanguage.js'\n",
    'Editor code language import',
)
editor = re.sub(
    r"// 可用的语言列表（供语言选择菜单）\nconst CODE_LANGUAGES = \[[\s\S]*?\n\]\n\nconst CodeBlock = CodeBlockLowlight\.configure\(\{ lowlight \}\)\.extend\(\{[\s\S]*?\n\}\)\n\n// AI 内联 diff",
    r'''const CodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineStart: {
        default: 1,
        parseHTML: (element) => Number(element.dataset.lineStart || 1),
        renderHTML: (attrs) => ({ 'data-line-start': attrs.lineStart || 1 }),
      },
      continued: {
        default: false,
        parseHTML: (element) => element.dataset.continued === 'true',
        renderHTML: (attrs) => (attrs.continued ? { 'data-continued': 'true' } : {}),
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive('codeBlock')) return false
        return this.editor.commands.insertContent('\n')
      },
      Tab: () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const language = $from.parent.attrs.language || 'plaintext'
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
        const completion = resolveCodeCompletion(language, before)
        if (!completion) {
          view.dispatch(state.tr.insertText('  '))
          return true
        }
        const from = state.selection.from - completion.replaceLength
        let tr = state.tr.insertText(completion.insert, from, state.selection.from)
        const cursor = from + completion.insert.length - (completion.cursorBack || 0)
        tr = tr.setSelection(TextSelection.create(tr.doc, cursor))
        view.dispatch(tr)
        return true
      },
      'Mod-c': () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parent.type.name !== 'codeBlock') return false
        const depth = $from.depth
        const after = $from.after(depth)
        const next = state.doc.nodeAt(after)
        let tr = state.tr
        let target = after + 1
        if (next?.type.name !== 'paragraph') {
          tr = tr.insert(after, state.schema.nodes.paragraph.create())
        }
        target = Math.min(tr.doc.content.size, target)
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(target))).scrollIntoView()
        view.dispatch(tr)
        return true
      },
    }
  },
  addNodeView() {
    return ({ node: initialNode, getPos, view }) => {
      let node = initialNode
      const shell = document.createElement('div')
      shell.className = 'code-block-shell'
      const head = document.createElement('div')
      head.className = 'code-block-head'
      head.contentEditable = 'false'
      const title = document.createElement('span')
      title.className = 'code-block-title'
      title.textContent = '代码'
      const select = document.createElement('select')
      select.className = 'code-language-select'
      select.setAttribute('aria-label', '代码语言')
      for (const [value, label] of CODE_LANGUAGES) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        select.append(option)
      }
      select.addEventListener('change', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const attrs = { ...node.attrs, language: select.value }
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs))
      })
      head.append(title, select)

      const pre = document.createElement('pre')
      const gutter = document.createElement('div')
      gutter.className = 'code-gutter'
      gutter.setAttribute('aria-hidden', 'true')
      gutter.contentEditable = 'false'
      const code = document.createElement('code')
      pre.append(gutter, code)

      const footer = document.createElement('div')
      footer.className = 'code-block-footer'
      footer.contentEditable = 'false'
      footer.textContent = 'Tab 补全 · ⌘C / Ctrl+C 退出代码块'
      shell.append(head, pre, footer)

      const render = () => {
        const count = Math.max(1, ((node.textContent || '').match(/\n/g)?.length || 0) + 1)
        const start = Math.max(1, Number(node.attrs.lineStart) || 1)
        gutter.textContent = Array.from({ length: count }, (_, index) => start + index).join('\n')
        select.value = node.attrs.language || 'plaintext'
        title.textContent = node.attrs.continued ? '代码 · 续' : '代码'
        shell.dataset.language = getCodeLanguageLabel(select.value)
        shell.classList.toggle('continued', Boolean(node.attrs.continued))
      }
      render()
      return {
        dom: shell,
        contentDOM: code,
        update: (nextNode) => {
          if (nextNode.type.name !== 'codeBlock') return false
          node = nextNode
          render()
          return true
        },
        stopEvent: (event) => Boolean(event.target.closest?.('.code-block-head, .code-block-footer')),
      }
    }
  },
})

// AI 内联 diff''',
    editor,
    count=1,
)
if 'const CODE_LANGUAGES = [' in editor:
    raise SystemExit('local Editor language list was not removed')
editor = replace_once(
    editor,
    "export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, aiSelection = null, aiInline = null, onResolveInline }) {",
    "export default function Editor({ doc, onChange, onStats, onReady, onHeadings, onAi, paged = false, pageH = 0, breakStyle = 'dashed', pageLabelStyle = 'total', onSelection, onSelectionRange, aiSelection = null, aiInline = null, onResolveInline, layoutKey = '', visualScale = 1 }) {",
    'Editor props',
)
editor = replace_once(
    editor,
    "  const reflowRunRef = useRef(0)\n  const pagedRef = useRef(paged)",
    "  const reflowRunRef = useRef(0)\n  const reflowingRef = useRef(false)\n  const modeRef = useRef(paged)\n  const layoutKeyRef = useRef(layoutKey)\n  const pagedRef = useRef(paged)",
    'Editor pagination refs',
)
editor = replace_once(
    editor,
    "  // 保存用的 HTML：分页模式下把 page 节点展开为普通块（page 结构仅用于显示，不持久化）\n  const getSaveHtml = () => {\n    if (!editor) return ''\n    if (!paged || editor.state.doc.firstChild?.type.name !== 'page') return editor.getHTML()\n    const blocks = []\n    editor.state.doc.forEach((n) => {\n      if (n.type.name === 'page') n.forEach((b) => blocks.push(b))\n      else blocks.push(n)\n    })\n    const container = editor.state.schema.nodes.doc.create(null, blocks)",
    "  const mergeCodeNodes = (left, right, schema) => {\n    const text = `${left.textContent || ''}\\n${right.textContent || ''}`\n    return left.type.create(\n      { ...left.attrs, lineStart: Math.max(1, Number(left.attrs.lineStart) || 1), continued: Boolean(left.attrs.continued) },\n      text ? schema.text(text) : null,\n    )\n  }\n\n  const flattenBlocks = (state) => {\n    const blocks = []\n    state.doc.forEach((node) => {\n      if (node.type.name === 'page') node.forEach((child) => blocks.push(child))\n      else blocks.push(node)\n    })\n    const merged = []\n    for (const node of blocks) {\n      const previous = merged[merged.length - 1]\n      if (node.type.name === 'codeBlock' && node.attrs.continued && previous?.type.name === 'codeBlock') {\n        merged[merged.length - 1] = mergeCodeNodes(previous, node, state.schema)\n      } else {\n        merged.push(node)\n      }\n    }\n    return merged\n  }\n\n  const dispatchLayout = (view, tr) => {\n    reflowingRef.current = true\n    view.dispatch(tr)\n    queueMicrotask(() => { reflowingRef.current = false })\n  }\n\n  // 保存时合并跨页代码块，持久化为一个逻辑代码块。\n  const getSaveHtml = () => {\n    if (!editor) return ''\n    if (!paged || editor.state.doc.firstChild?.type.name !== 'page') return editor.getHTML()\n    const blocks = flattenBlocks(editor.state)\n    const container = editor.state.schema.nodes.doc.create(null, blocks)",
    'Editor flatten/save helpers',
)
editor = replace_once(
    editor,
    "  const toPaged = () => {\n    if (!editor) return\n    const { state } = editor\n    if (state.doc.firstChild?.type.name === 'page') return\n    const blocks = []\n    state.doc.forEach((n) => blocks.push(n))\n    if (!blocks.length) return\n    const pageNode = state.schema.nodes.page.create(null, blocks)\n    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, pageNode))\n  }\n  const toWide = () => {\n    if (!editor) return\n    const { state } = editor\n    if (state.doc.firstChild?.type.name !== 'page') return\n    const blocks = []\n    state.doc.forEach((n) => {\n      if (n.type.name === 'page') n.forEach((b) => blocks.push(b))\n      else blocks.push(n)\n    })\n    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]\n    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, content))\n  }",
    "  const toPaged = (rebuild = false) => {\n    if (!editor) return\n    const { state, view } = editor\n    if (!rebuild && state.doc.firstChild?.type.name === 'page') return\n    const blocks = flattenBlocks(state)\n    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]\n    const pageNode = state.schema.nodes.page.create(null, content)\n    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, pageNode))\n  }\n  const toWide = () => {\n    if (!editor) return\n    const { state, view } = editor\n    if (state.doc.firstChild?.type.name !== 'page') return\n    const blocks = flattenBlocks(state)\n    const content = blocks.length ? blocks : [state.schema.nodes.paragraph.create()]\n    dispatchLayout(view, state.tr.replaceWith(0, state.doc.content.size, content))\n  }",
    'Editor mode conversion',
)
insert_marker = "  // 删除内容后，后页内容应像 Word 一样自动向前回流。\n"
code_split_helper = r'''  const splitCodeBlockAcrossPages = (state, view, pagePos, child, childPos, splitPos) => {
    const text = child.textContent || ''
    const rawOffset = Math.max(1, splitPos - (childPos + 1))
    const cut = text.lastIndexOf('\n', Math.min(text.length - 1, rawOffset))
    if (cut <= 0 || cut >= text.length - 1) return false
    const beforeText = text.slice(0, cut)
    const afterText = text.slice(cut + 1)
    const startLine = Math.max(1, Number(child.attrs.lineStart) || 1)
    const consumedLines = beforeText.split('\n').length
    const first = child.type.create(
      { ...child.attrs, lineStart: startLine },
      beforeText ? state.schema.text(beforeText) : null,
    )
    const second = child.type.create(
      { ...child.attrs, lineStart: startLine + consumedLines, continued: true },
      afterText ? state.schema.text(afterText) : null,
    )
    let tr = state.tr.replaceWith(childPos, childPos + child.nodeSize, first)
    const currentPage = tr.doc.nodeAt(pagePos)
    const nextPos = pagePos + currentPage.nodeSize
    const nextPage = tr.doc.nodeAt(nextPos)
    if (nextPage?.type.name === 'page') tr = tr.insert(nextPos + 1, second)
    else tr = tr.insert(nextPos, state.schema.nodes.page.create(null, second))
    dispatchLayout(view, tr)
    return true
  }

'''
if insert_marker not in editor:
    raise SystemExit('code split insertion marker not found')
editor = editor.replace(insert_marker, code_split_helper + insert_marker, 1)
editor = replace_once(
    editor,
    "      const fitsWhole = firstRect.height <= remaining + 1\n      const canTakeTextLine = first.isTextblock && remaining >= lineHeight * 1.25\n      if (!fitsWhole && !canTakeTextLine) continue\n\n      const currentChildren = []",
    "      const fitsWhole = firstRect.height <= remaining + 1\n      if (!fitsWhole) continue\n\n      const currentChildren = []",
    'stable pull-forward condition',
)
editor = replace_once(
    editor,
    "      const replacementPages = [\n        state.schema.nodes.page.create(current.node.attrs, [...currentChildren, first]),\n      ]",
    "      const previous = currentChildren[currentChildren.length - 1]\n      if (first.type.name === 'codeBlock' && first.attrs.continued && previous?.type.name === 'codeBlock') {\n        currentChildren[currentChildren.length - 1] = mergeCodeNodes(previous, first, state.schema)\n      } else {\n        currentChildren.push(first)\n      }\n      const replacementPages = [\n        state.schema.nodes.page.create(current.node.attrs, currentChildren),\n      ]",
    'merge code continuation on pull-forward',
)
editor = replace_once(
    editor,
    "      view.dispatch(\n        state.tr.replaceWith(\n          current.pos,\n          next.pos + next.node.nodeSize,\n          replacementPages,\n        ),\n      )",
    "      dispatchLayout(\n        view,\n        state.tr.replaceWith(\n          current.pos,\n          next.pos + next.node.nodeSize,\n          replacementPages,\n        ),\n      )",
    'pull-forward dispatch guard',
)
editor = replace_once(
    editor,
    "      if (splitPos) {\n        view.dispatch(state.tr.split(splitPos))\n        return true\n      }",
    "      if (splitPos) {\n        if (firstOverflow.child.type.name === 'codeBlock') {\n          return splitCodeBlockAcrossPages(state, view, pos, firstOverflow.child, firstOverflow.childPos, splitPos)\n        }\n        dispatchLayout(view, state.tr.split(splitPos))\n        return true\n      }",
    'code block custom split',
)
editor = editor.replace("    view.dispatch(tr)\n    return true\n  }\n  // 每一帧只执行一次分页事务", "    dispatchLayout(view, tr)\n    return true\n  }\n  // 每一帧只执行一次分页事务", 1)
editor = replace_once(
    editor,
    "    let steps = 0\n    const step = () => {\n      if (runId !== reflowRunRef.current || !editor || !paged) return\n      const changed = reflow()\n      steps += 1",
    "    let steps = 0\n    const seen = new Set()\n    const step = () => {\n      if (runId !== reflowRunRef.current || !editor || !paged) return\n      const signature = []\n      editor.state.doc.forEach((page) => signature.push(`${page.childCount}:${page.textContent.length}`))\n      const key = signature.join('|')\n      if (seen.has(key)) return\n      seen.add(key)\n      const changed = reflow()\n      steps += 1",
    'reflow cycle guard',
)
editor = replace_once(
    editor,
    "  // paged 切换：结构转换 + 重排\n  useEffect(() => {\n    if (!editor) return\n    if (paged) {\n      toPaged()\n      // 等待页面 DOM 布局后逐帧重排\n      runReflow()\n    } else {\n      toWide()\n    }\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [paged, editor])",
    "  // 版式切换先将内容还原为单一逻辑流，再按目标纸张重新分页。\n  useEffect(() => {\n    if (!editor) return\n    const enteringPaged = paged && !modeRef.current\n    const layoutChanged = paged && layoutKeyRef.current !== layoutKey\n    reflowRunRef.current += 1\n    cancelAnimationFrame(reflowRafRef.current)\n    if (paged) {\n      toPaged(enteringPaged || layoutChanged)\n      requestAnimationFrame(() => {\n        if (enteringPaged && canvasRef.current) {\n          canvasRef.current.scrollTop = 0\n          canvasRef.current.scrollLeft = 0\n        }\n        runReflow()\n      })\n    } else {\n      toWide()\n    }\n    modeRef.current = paged\n    layoutKeyRef.current = layoutKey\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [paged, editor, layoutKey])",
    'deterministic layout switch',
)
editor = replace_once(
    editor,
    "    const schedule = () => runReflow()",
    "    const schedule = () => { if (!reflowingRef.current) runReflow() }",
    'reflow listener guard',
)
editor = replace_once(
    editor,
    "  }, [editor, paged])",
    "  }, [editor, paged, layoutKey, visualScale])",
    'page rect layout dependency',
)
editor = replace_once(
    editor,
    "    onSelection?.(len)\n    if (from === to)",
    "    onSelection?.(len)\n    onSelectionRange?.(from !== to ? { from, to } : null)\n    if (from === to)",
    'selection range reporting',
)
write('src/components/Editor.jsx', editor)


# ---------------------------------------------------------------------------
# Toolbar: transaction-aware undo/redo, mutually exclusive popovers, terminal
# visual consistency, no duplicate language picker, and AI mousedown retention.
# ---------------------------------------------------------------------------
toolbar = read('src/components/Toolbar.jsx')
toolbar = replace_once(toolbar, "import { useRef, useState } from 'react'", "import { useEffect, useRef, useState } from 'react'", 'Toolbar useEffect import')
toolbar = replace_once(toolbar, "import { Icon } from './Icons.jsx'\n", "import { Icon } from './Icons.jsx'\nimport { getCodeLanguageLabel } from '../lib/codeLanguage.js'\n", 'Toolbar code language import')
toolbar = re.sub(r"// 代码块支持的语言（与 lowlight 注册一致）\nconst CODE_LANGS = \[[\s\S]*?\n\]\n\n", "", toolbar, count=1)
toolbar = toolbar.replace("  const [showLangMenu, setShowLangMenu] = useState(false)\n", "")
toolbar = replace_once(
    toolbar,
    "  const fileRef = useRef(null)\n\n  if (!editor) return null",
    "  const fileRef = useRef(null)\n  const [, setRevision] = useState(0)\n\n  useEffect(() => {\n    if (!editor) return undefined\n    const refresh = () => setRevision((value) => value + 1)\n    editor.on('transaction', refresh)\n    return () => editor.off('transaction', refresh)\n  }, [editor])\n\n  if (!editor) return null",
    'Toolbar transaction subscription',
)
toolbar = toolbar.replace("    setShowLangMenu(false)\n", "")
toolbar = replace_once(
    toolbar,
    "      {(showTextColor || showHighlight || showTableGrid || showBlockMenu || showFontSize || showFontFamily) && (",
    "      {(showTextColor || showHighlight || showTableGrid || showBlockMenu || showFontSize || showFontFamily) && (",
    'Toolbar overlay condition',
)
# Normalize popover toggles so only the most recently requested menu remains open.
replacements = {
    "onClick={() => { setShowBlockMenu(!showBlockMenu); setShowTextColor(false); setShowHighlight(false); setShowTableGrid(false) }}": "onClick={() => { const next = !showBlockMenu; closePopovers(); setShowBlockMenu(next) }}",
    "onClick={() => { setShowFontSize(!showFontSize); setShowFontFamily(false); setShowBlockMenu(false); setShowTextColor(false); setShowHighlight(false) }}": "onClick={() => { const next = !showFontSize; closePopovers(); setShowFontSize(next) }}",
    "onClick={() => { setShowFontFamily(!showFontFamily); setShowFontSize(false); setShowBlockMenu(false); setShowTextColor(false); setShowHighlight(false) }}": "onClick={() => { const next = !showFontFamily; closePopovers(); setShowFontFamily(next) }}",
    "onClick={() => { setShowTextColor(!showTextColor); setShowHighlight(false); setShowTableGrid(false); setShowBlockMenu(false) }}": "onClick={() => { const next = !showTextColor; closePopovers(); setShowTextColor(next) }}",
    "onClick={() => { setShowHighlight(!showHighlight); setShowTextColor(false); setShowTableGrid(false); setShowBlockMenu(false) }}": "onClick={() => { const next = !showHighlight; closePopovers(); setShowHighlight(next) }}",
    "onClick={() => { setShowTableGrid(!showTableGrid); setShowTextColor(false); setShowHighlight(false); setShowBlockMenu(false) }}": "onClick={() => { const next = !showTableGrid; closePopovers(); setShowTableGrid(next) }}",
}
for old, new in replacements.items():
    if old not in toolbar:
        raise SystemExit(f'Toolbar popover patch point missing: {old[:42]}')
    toolbar = toolbar.replace(old, new, 1)
# Remove toolbar language picker while keeping the run action.
toolbar = re.sub(
    r"      \{\/\* 代码块语言选择 \+ 运行（代码块激活时显示） \*\/\}\n      \{editor\.isActive\('codeBlock'\) && \(\n        <>[\s\S]*?\n        </>\n      \)\}",
    "      {/* 语言选择位于代码块右上角；工具栏只保留运行入口。 */}\n      {editor.isActive('codeBlock') && (\n        <button className=\"tb-sup-sub tb-run-btn\" title=\"在本机运行当前代码块\" disabled={runOutput?.running} onClick={runCode}>▶</button>\n      )}",
    toolbar,
    count=1,
)
if 'showLangMenu' in toolbar or 'CODE_LANGS' in toolbar:
    raise SystemExit('Toolbar language picker cleanup failed')
toolbar = toolbar.replace("{CODE_LANGS.find(([value]) => value === runOutput.language)?.[1] || runOutput.language}", "{getCodeLanguageLabel(runOutput.language)}")
toolbar = replace_once(
    toolbar,
    "            <span className=\"code-terminal-dots\"><i /><i /><i /></span>\n            <span className=\"code-terminal-title\">",
    "            <span className=\"code-terminal-icon\"><Icon name=\"codeBlock\" size={13} /></span>\n            <span className=\"code-terminal-title\">",
    'terminal fake traffic lights',
)
toolbar = replace_once(
    toolbar,
    "      <button className=\"ai-btn\" data-tip=\"AI 改写（调用大模型修改内容）\" onClick={onAi}>",
    "      <button className=\"ai-btn\" data-tip=\"AI 改写（调用大模型修改内容）\" onMouseDown={(event) => event.preventDefault()} onClick={onAi}>",
    'AI selection retention',
)
write('src/components/Toolbar.jsx', toolbar)


# ---------------------------------------------------------------------------
# Sidebar document menu follows Google Docs' quiet circular affordance.
# ---------------------------------------------------------------------------
sidebar = read('src/components/Sidebar.jsx')
sidebar = replace_once(sidebar, 'className="icon-btn"\n            data-tip="更多操作"', 'className="icon-btn doc-more-btn"\n            data-tip="更多操作"', 'Sidebar more button class')
sidebar = replace_once(
    sidebar,
    "              setCtxMenu({ x: r.left, y: r.bottom + 4, items: docMenuItems(doc) })",
    "              const width = 156\n              const x = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))\n              setCtxMenu({ x, y: r.bottom + 4, items: docMenuItems(doc) })",
    'Sidebar menu anchor',
)
write('src/components/Sidebar.jsx', sidebar)


# ---------------------------------------------------------------------------
# App: dock find bar, deterministic paper switching, zoom scroll correction,
# side-panel mutual exclusion, and stable AI selection bookmark.
# ---------------------------------------------------------------------------
app = read('src/App.jsx')
app = replace_once(
    app,
    "  const versionCheckpointRef = useRef(new Map())",
    "  const versionCheckpointRef = useRef(new Map())\n  const lastSelectionRef = useRef(null)\n  const previousZoomRef = useRef(zoom)",
    'App refs',
)
# previousZoomRef was inserted before zoom declaration in current source; move it after zoom state.
app = app.replace("  const previousZoomRef = useRef(zoom)\n\n  // 拖动标尺", "\n  // 拖动标尺", 1)
app = replace_once(
    app,
    "  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('inkdocs.zoom')) || 1)\n  const mainRef = useRef(null)",
    "  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('inkdocs.zoom')) || 1)\n  const previousZoomRef = useRef(zoom)\n  const mainRef = useRef(null)",
    'App zoom ref location',
)
zoom_effect_marker = "  // 缩放菜单始终锚定状态栏按钮。大纲、侧边栏或窗口尺寸变化时重新计算。\n"
zoom_effect = r'''  // 页面缩放后按比例修正滚动坐标并钳制到新画布范围，避免缩小后停在不存在的空白区域。
  useEffect(() => {
    const previous = previousZoomRef.current || 1
    previousZoomRef.current = zoom
    if (paper === 'wide') return
    const canvas = mainRef.current?.querySelector('.canvas')
    if (!canvas) return
    const ratio = zoom / previous
    const frame = requestAnimationFrame(() => {
      canvas.scrollTop *= ratio
      canvas.scrollLeft *= ratio
      requestAnimationFrame(() => {
        canvas.scrollTop = Math.max(0, Math.min(canvas.scrollTop, canvas.scrollHeight - canvas.clientHeight))
        canvas.scrollLeft = Math.max(0, Math.min(canvas.scrollLeft, canvas.scrollWidth - canvas.clientWidth))
        window.dispatchEvent(new Event('tdocs:layout'))
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [zoom, paper])

  const changePaper = (nextPaper) => {
    if (nextPaper === paper) return
    setPaper(nextPaper)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const canvas = mainRef.current?.querySelector('.canvas')
      if (canvas) {
        canvas.scrollTop = 0
        canvas.scrollLeft = 0
      }
      window.dispatchEvent(new Event('tdocs:layout'))
    }))
  }

'''
if zoom_effect_marker not in app:
    raise SystemExit('App zoom effect marker missing')
app = app.replace(zoom_effect_marker, zoom_effect + zoom_effect_marker, 1)
app = replace_once(
    app,
    "    const { from, to } = editor.state.selection\n    const selection = from !== to ? { from, to } : null",
    "    const { from, to } = editor.state.selection\n    const selection = from !== to ? { from, to } : lastSelectionRef.current",
    'AI selection bookmark',
)
app = app.replace("onClick={() => { setPaper('wide'); setShowPageMenu(false) }}", "onClick={() => { changePaper('wide'); setShowPageMenu(false) }}")
app = app.replace("onClick={() => { setPaper('a4'); setShowPageMenu(false) }}", "onClick={() => { changePaper('a4'); setShowPageMenu(false) }}")
app = app.replace("onClick={() => { setPaper('b5'); setShowPageMenu(false) }}", "onClick={() => { changePaper('b5'); setShowPageMenu(false) }}")
app = replace_once(
    app,
    "              <Toolbar editor={editor} onAi={openAi} />\n              {/* 边距标尺",
    "              <Toolbar editor={editor} onAi={openAi} />\n              {showFindReplace && (\n                <FindReplace editor={editor} onClose={() => setShowFindReplace(false)} />\n              )}\n              {/* 边距标尺",
    'dock find bar',
)
app = re.sub(
    r"\n          \{showFindReplace && \(\n            <FindReplace editor=\{editor\} onClose=\{\(\) => setShowFindReplace\(false\)\} />\n          \)\}",
    "",
    app,
    count=1,
)
app = replace_once(
    app,
    "                onSelection={setSelectedChars}\n                aiSelection={aiPrompt?.selection || null}",
    "                onSelection={setSelectedChars}\n                onSelectionRange={(range) => { lastSelectionRef.current = range }}\n                aiSelection={aiPrompt?.selection || null}\n                layoutKey={`${paper}:${pageSize.w}:${pageSize.h}:${pagePad}`}\n                visualScale={zoom}",
    'Editor layout and selection props',
)
app = app.replace("              onOpenConfig={() => { setAiConfigOpen(true); setAiPrompt(null) }}\n", "")
# Side panels are mutually exclusive; find remains docked and may coexist.
app = replace_once(
    app,
    "            onClick={() => setShowVersionHistory((value) => !value)}",
    "            onClick={() => { setShowOutline(false); setAiConfigOpen(false); setShowVersionHistory((value) => !value) }}",
    'version panel exclusivity',
)
app = replace_once(
    app,
    "                  onClick={() => { setShowSettings(false); setAiConfigOpen(true) }}",
    "                  onClick={() => { setShowSettings(false); setShowOutline(false); setShowVersionHistory(false); setAiConfigOpen(true) }}",
    'AI settings panel exclusivity',
)
app = replace_once(
    app,
    "                    onClick={() => setShowOutline(!showOutline)}",
    "                    onClick={() => { setShowVersionHistory(false); setAiConfigOpen(false); setShowOutline(!showOutline) }}",
    'outline panel exclusivity',
)
write('src/App.jsx', app)


# ---------------------------------------------------------------------------
# CSS overrides: stable scroll geometry, docked search, fixed-height menus,
# integrated code block chrome, quiet doc menu, and consistent result window.
# ---------------------------------------------------------------------------
css = read('src/app.css')
css += r'''

/* ============================================================
   UX stability round 2
   ============================================================ */
.canvas {
  overflow-anchor: none;
  scroll-behavior: auto;
}
.page.paged,
.page.paged .editor-content {
  min-height: 0 !important;
}
.editor-content .pm-page-wrap {
  contain: layout paint;
}
.editor-content [data-page] {
  backface-visibility: hidden;
  will-change: transform;
}

/* All long dropdowns have a bounded viewport instead of extending under the window. */
.toolbar .menu,
.topbar .menu,
.ai-select-menu,
.ai-model-menu,
.zoom-menu {
  max-height: min(360px, calc(100vh - 24px));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

/* Google Docs-style document overflow action: quiet circle, vertically centred. */
.doc-item-actions {
  top: 50%;
  right: 7px;
  transform: translateY(-50%);
  background: transparent !important;
}
.doc-item-actions .doc-more-btn {
  width: 28px;
  height: 28px;
  border-radius: 50% !important;
  color: var(--text-3);
}
.doc-item-actions .doc-more-btn:hover,
.doc-item.active .doc-item-actions .doc-more-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 10%, transparent);
}
.doc-item.active .doc-item-actions .doc-more-btn {
  background: transparent;
}

/* Find/replace is a document row below the toolbar, so topbar menus never cover it. */
.find-replace.find-replace-dock {
  position: relative;
  inset: auto;
  z-index: 24;
  width: 100%;
  max-width: none;
  flex-shrink: 0;
  padding: 7px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0 !important;
  box-shadow: none;
  background: var(--surface);
  backdrop-filter: none;
}
.find-replace-dock .find-row,
.find-replace-dock .replace-row {
  max-width: 760px;
  margin-inline: auto;
}
.find-replace-dock .find-option {
  display: flex;
  width: min(760px, 100%);
  margin: 6px auto 0;
  padding-left: 24px;
}

/* A code block remains one logical object across pages. Continuations preserve line numbers. */
.code-block-shell {
  position: relative;
  margin: .7em 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-3);
  break-inside: avoid;
}
.code-block-shell.continued {
  margin-top: .25em;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}
.code-block-head {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-3);
  font-family: var(--font-sans);
  font-size: 11.5px;
  user-select: none;
}
.code-block-title {
  letter-spacing: .02em;
}
.code-language-select {
  max-width: 150px;
  height: 24px;
  padding: 0 24px 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-size: 11.5px;
  outline: none;
  cursor: pointer;
}
.code-language-select:hover,
.code-language-select:focus {
  border-color: var(--border-strong);
  background: var(--surface);
}
.code-block-shell > pre {
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent;
}
.code-block-footer {
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 78%, transparent);
  color: var(--text-3);
  font-family: var(--font-sans);
  font-size: 10.5px;
  user-select: none;
}

/* The result viewer is app chrome, not a native macOS terminal; use one right-side close action. */
.code-terminal-head {
  min-height: 36px;
  padding: 6px 8px 6px 10px;
}
.code-terminal-icon {
  display: inline-flex;
  align-items: center;
  color: #8b93a1;
}
.code-terminal-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.code-terminal-status {
  margin-left: auto;
}
.code-terminal-head .icon-btn {
  margin-left: 2px;
}

/* Model picker stays inside the rewrite header and groups models by provider. */
.ai-prompt-head-actions {
  min-width: 0;
  align-items: center;
}
.ai-model-picker {
  min-width: 0;
}
.ai-model-btn {
  max-width: 250px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 7px !important;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 11px;
  cursor: pointer;
}
.ai-model-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-model-menu {
  top: calc(100% + 5px);
  right: 0;
  width: min(330px, calc(100vw - 32px));
  padding: 6px;
}
.ai-model-group + .ai-model-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.ai-model-menu .settings-label {
  position: sticky;
  top: -6px;
  z-index: 1;
  background: var(--surface);
}

.ai-sel-highlight {
  background: linear-gradient(110deg, rgba(90,117,255,.34), rgba(171,91,255,.38), rgba(70,210,224,.28)) !important;
  box-shadow: inset 0 -2px 0 rgba(126,100,255,.95), 0 0 0 1px rgba(124,102,255,.28) !important;
}

@media (max-width: 720px) {
  .find-replace-dock .replace-row { flex-wrap: wrap; }
  .ai-model-btn { max-width: 150px; }
}
'''
write('src/app.css', css)

# The design-system stylesheet loads after app.css; override its fixed search window.
design = read('src/design-system.css')
design += r'''

/* Docked search row wins over the legacy fixed search panel. */
.find-replace.find-replace-dock {
  position: relative;
  inset: auto;
  width: 100%;
  max-width: none;
  border-radius: 0 !important;
  box-shadow: none;
}
'''
write('src/design-system.css', design)


# ---------------------------------------------------------------------------
# Pure helper tests.
# ---------------------------------------------------------------------------
write('tests/codeLanguage.test.mjs', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { getCodeLanguageLabel, resolveCodeCompletion } from '../src/lib/codeLanguage.js'

test('代码语言标签与代码块选择器一致', () => {
  assert.equal(getCodeLanguageLabel('python'), 'Python')
  assert.equal(getCodeLanguageLabel('javascript'), 'JavaScript')
})

test('Python 常用函数可通过 Tab 补全', () => {
  assert.deepEqual(resolveCodeCompletion('python', 'pri'), {
    insert: 'print()', cursorBack: 1, replaceLength: 3,
  })
})

test('未知前缀不进行破坏性补全', () => {
  assert.equal(resolveCodeCompletion('python', 'unknown_name'), null)
})
''')

print('UX stability round 2 patch applied.')
