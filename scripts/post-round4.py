from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Refresh the welcome document once per release, but do not recreate it after the user deletes it.
app_path = Path('src/App.jsx')
app = app_path.read_text(encoding='utf-8')
app = replace_once(
    app,
    "`\n\nexport default function App() {",
    "`\n\nconst WELCOME_SEED_KEY = 'inkdocs.welcomeSeed.0.2.0-preview'\n\nexport default function App() {",
    'welcome seed constant',
)
old_init = """  const [docs, setDocs] = useState(() => {
    const existing = loadDocs()
    if (existing.length) return existing
    const welcomeDoc = createDoc('欢迎使用 TDocs', WELCOME_HTML, { pinned: true, isWelcome: true })
    saveDocs([welcomeDoc])
    return [welcomeDoc]
  })
"""
new_init = """  const [docs, setDocs] = useState(() => {
    const existing = loadDocs()
    const welcomeIndex = existing.findIndex((doc) => doc.isWelcome || doc.title === '欢迎使用 TDocs')
    if (welcomeIndex >= 0) {
      const current = existing[welcomeIndex]
      const welcomeDoc = {
        ...current,
        title: '欢迎使用 TDocs',
        content: WELCOME_HTML,
        pinned: true,
        isWelcome: true,
        group: '',
      }
      const next = [welcomeDoc, ...existing.filter((_doc, index) => index !== welcomeIndex)]
      localStorage.setItem(WELCOME_SEED_KEY, '1')
      saveDocs(next)
      return next
    }
    if (localStorage.getItem(WELCOME_SEED_KEY) !== '1') {
      const welcomeDoc = createDoc('欢迎使用 TDocs', WELCOME_HTML, { pinned: true, isWelcome: true })
      const next = [welcomeDoc, ...existing]
      localStorage.setItem(WELCOME_SEED_KEY, '1')
      saveDocs(next)
      return next
    }
    return existing
  })
"""
app = replace_once(app, old_init, new_init, 'welcome init')
app_path.write_text(app, encoding='utf-8')

# A provider label saved by an older release must not override a more specific URL/model signature.
api_path = Path('src/lib/api.js')
api = api_path.read_text(encoding='utf-8')
api = replace_once(
    api,
    "export function inferProviderId(profile = {}) {\n  if (profile.provider && profile.provider !== 'custom') return profile.provider\n  const base = String(profile.baseUrl || '').toLowerCase()",
    "export function inferProviderId(profile = {}) {\n  const base = String(profile.baseUrl || '').toLowerCase()",
    'provider early return',
)
api = replace_once(
    api,
    "  if (/^gpt[-/]/.test(model)) return 'openai'\n  return profile.provider || 'custom'",
    "  if (/^gpt[-/]/.test(model)) return 'openai'\n  return profile.provider && profile.provider !== 'custom' ? profile.provider : 'custom'",
    'provider fallback',
)
api = replace_once(
    api,
    "        const id = profile?.provider && profile.provider !== 'custom' ? profile.provider : inferProviderId(profile)",
    "        const id = inferProviderId(profile)",
    'stored profile inference',
)
api_path.write_text(api, encoding='utf-8')

# Code blocks use a dedicated toolbar state rather than normal rich-text controls.
toolbar_path = Path('src/components/Toolbar.jsx')
toolbar = toolbar_path.read_text(encoding='utf-8')
anchor = """  if (!editor) return null

  const blockValue = (() => {
"""
replacement = """  if (!editor) return null

  const inCodeBlock = editor.isActive('codeBlock')
  if (inCodeBlock) {
    return (
      <div className="toolbar code-context-toolbar">
        <TB icon="undo" title="撤销 (⌘Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <TB icon="redo" title="重做 (⌘⇧Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
        {isWord && <TB icon="page" title="在代码块后插入分页符" onClick={() => editor.chain().focus().insertPageBreak().run()} />}
        <div className="divider" />
        <span className="code-context-label"><Icon name="codeBlock" size={15} />代码编辑</span>
        <span className="code-context-hint">语言、补全和运行位于代码块内部；右键使用系统编辑菜单</span>
      </div>
    )
  }

  const blockValue = (() => {
"""
toolbar = replace_once(toolbar, anchor, replacement, 'code toolbar state')
toolbar_path.write_text(toolbar, encoding='utf-8')

css_path = Path('src/app.css')
css = css_path.read_text(encoding='utf-8')
css += """

.code-context-toolbar { min-height: 54px; }
.code-context-label { display: inline-flex; align-items: center; gap: 6px; color: var(--text); font-size: 13px; font-weight: 600; }
.code-context-hint { color: var(--text-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
"""
css_path.write_text(css, encoding='utf-8')

# Regression checks.
test_path = Path('tests/round4Migration.test.mjs')
test_path.write_text("""import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const toolbar = fs.readFileSync('src/components/Toolbar.jsx', 'utf8')

test('欢迎文件刷新一次且删除后不会自动重建', () => {
  assert.match(app, /WELCOME_SEED_KEY/)
  assert.match(app, /localStorage\.getItem\(WELCOME_SEED_KEY\) !== '1'/)
  assert.match(app, /return existing/)
})

test('DeepSeek URL 优先于旧版错误的 OpenAI 标签', () => {
  const start = api.indexOf('export function inferProviderId')
  const end = api.indexOf('function normalizeProfile')
  const body = api.slice(start, end)
  assert.ok(body.indexOf('deepseek\\.com') < body.indexOf("return profile.provider"))
  assert.match(api, /const id = inferProviderId\(profile\)/)
})

test('代码块使用独立顶部工具栏状态', () => {
  assert.match(toolbar, /inCodeBlock/)
  assert.match(toolbar, /code-context-toolbar/)
  assert.match(toolbar, /语言、补全和运行位于代码块内部/)
})
""", encoding='utf-8')

print('round 4 migration post-fixes applied')
