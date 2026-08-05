from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

editor = read('src/components/Editor.jsx')

font_style = r'''const FontStyleExt = TextStyle.extend({
  name: 'textStyle',
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el) => el.style.fontFamily || null,
        renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {}),
      },
    }
  },
})'''
font_start = editor.find('const FontStyleExt =')
sup_start = editor.find('const Superscript =', font_start)
if font_start < 0 or sup_start < 0:
    raise RuntimeError('FontStyleExt declaration boundaries missing')
comment_start = editor.rfind('// ----------', font_start, sup_start)
replacement_end = comment_start if comment_start > font_start else sup_start
editor = editor[:font_start] + font_style + '\n\n// ---------- 上标 / 下标 ----------\n' + editor[sup_start:]

code_start = editor.find('const CodeBlock = CodeBlockLowlight')
if code_start < 0:
    raise RuntimeError('CodeBlock declaration missing')
attrs_start = editor.find('  addAttributes()', code_start)
shortcuts_start = editor.find('  addKeyboardShortcuts()', code_start)
if attrs_start >= 0 and shortcuts_start > attrs_start:
    editor = editor[:attrs_start] + editor[shortcuts_start:]

old_render = '''          <div className="page-wrap" ref={wrapRef}>
            <EditorContent editor={editor} className="page document-page" />
          {ctxMenu && ('''
new_render = '''          <div className="page-wrap" ref={wrapRef}>
            <EditorContent editor={editor} className="page document-page" />
          </div>
          {ctxMenu && ('''
if old_render not in editor:
    raise RuntimeError('Editor render repair anchor missing')
editor = editor.replace(old_render, new_render, 1)
editor = editor.replace(
    '// 浏览器与桌面端统一使用中文自绘编辑菜单；普通输入框由 Electron 提供中文原生菜单。\n  // 浏览器开发模式使用自绘菜单；Electron 正式版使用系统原生编辑菜单。',
    '// 编辑器统一使用中文自绘菜单；普通输入框由 Electron 提供中文原生菜单。',
)
for token in ('lineStart', 'continued', 'codeId', 'data-line-start', 'data-continued', 'data-code-id'):
    if token in editor:
        raise RuntimeError(f'pagination code attribute still present: {token}')
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

css = read('src/app.css')
keywords = [
    'manual-page-break', 'add-word-page', 'pm-page-wrap', 'page-break-line',
    'editor-ruler', 'ruler-handle', 'word-workspace', 'doc-kind-badge.word',
    'data-workspace="word"', "data-workspace='word'",
]
for keyword in keywords:
    pattern = re.compile(r'(^|\n)([^{}]*' + re.escape(keyword) + r'[^{}]*)\{[^{}]*\}', re.I)
    while True:
        css, count = pattern.subn('\n', css, count=1)
        if not count:
            break
write('src/app.css', css)

print('document-only generated source repaired')
