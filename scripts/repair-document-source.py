from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def remove_css_blocks(text, keywords):
    for keyword in keywords:
        pattern = re.compile(r'(^|\n)([^{}]*' + re.escape(keyword) + r'[^{}]*)\{[^{}]*\}', re.I)
        while True:
            text, count = pattern.subn('\n', text, count=1)
            if not count:
                break
    return text

editor = read('src/components/Editor.jsx')
code_start = editor.find('const CodeBlock = CodeBlockLowlight')
if code_start < 0:
    raise RuntimeError('CodeBlock declaration missing')
attrs_start = editor.find('  addAttributes()', code_start)
shortcuts_start = editor.find('  addKeyboardShortcuts()', code_start)
if attrs_start >= 0 and shortcuts_start > attrs_start:
    editor = editor[:attrs_start] + editor[shortcuts_start:]

render_pattern = re.compile(
    r'(<div className="page-wrap" ref=\{wrapRef\}>\s*<EditorContent editor=\{editor\} className="page document-page"\s*/>)\s*(\{ctxMenu && \()',
    re.S,
)
editor, render_count = render_pattern.subn(r'\1\n          </div>\n          \2', editor, count=1)
if render_count != 1 and not re.search(r'<EditorContent editor=\{editor\} className="page document-page"\s*/>\s*</div>\s*\{ctxMenu && \(', editor, re.S):
    raise RuntimeError('Editor render repair anchor missing')
editor = editor.replace(
    '// 浏览器与桌面端统一使用中文自绘编辑菜单；普通输入框由 Electron 提供中文原生菜单。\n  // 浏览器开发模式使用自绘菜单；Electron 正式版使用系统原生编辑菜单。',
    '// 编辑器统一使用中文自绘菜单；普通输入框由 Electron 提供中文原生菜单。',
)
for token in ('lineStart', 'continued', 'codeId', 'data-line-start', 'data-continued', 'data-code-id'):
    if token in editor:
        raise RuntimeError(f'pagination code attribute still present: {token}')
if 'fontSize:' not in editor or 'const Superscript' not in editor or 'const CodeBlock = CodeBlockLowlight' not in editor:
    raise RuntimeError('core text or code editor declarations were damaged')
write('src/components/Editor.jsx', editor)

ai = read('src/components/AiPanel.jsx')
old_model = '''          <SelectMenu
            value={inList ? cfg.model : '__custom__'}'''
new_model = '''          <SelectMenu
            menuId="model"
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            value={inList ? cfg.model : '__custom__'}'''
if old_model in ai:
    ai = ai.replace(old_model, new_model, 1)
if 'menuId="provider"' not in ai or 'menuId="model"' not in ai:
    raise RuntimeError('AI dropdown control repair failed')
write('src/components/AiPanel.jsx', ai)

storage = read('src/lib/storage.js')
if 'export function formatTime' not in storage:
    storage += '''\nexport function formatTime(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}\n'''
write('src/lib/storage.js', storage)

page_keywords = [
    'manual-page-break', 'add-word-page', 'pm-page-wrap', 'page-break-line',
    'editor-ruler', 'ruler-handle', 'word-workspace', 'doc-kind-badge.word',
    'data-workspace="word"', "data-workspace='word'", 'code-block-shell.continued',
]
write('src/app.css', remove_css_blocks(read('src/app.css'), page_keywords))
write('src/design-system.css', remove_css_blocks(read('src/design-system.css'), page_keywords))

print('document-only generated source repaired')
