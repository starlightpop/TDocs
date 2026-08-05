from pathlib import Path

path = Path('scripts/apply-ux-stability-round2.py')
text = path.read_text()
needle = "if 'showLangMenu' in toolbar or 'CODE_LANGS' in toolbar:\n    raise SystemExit('Toolbar language picker cleanup failed')\n"
replacement = r'''if 'showLangMenu' in toolbar or 'CODE_LANGS' in toolbar:
    start = toolbar.find("      {/* 代码块语言选择 + 运行（代码块激活时显示） */}")
    end = toolbar.find("      {runOutput && (", start)
    if start >= 0 and end > start:
        toolbar = toolbar[:start] + """      {/* 语言选择位于代码块右上角；工具栏只保留运行入口。 */}
      {editor.isActive('codeBlock') && (
        <button className=\"tb-sup-sub tb-run-btn\" title=\"在本机运行当前代码块\" disabled={runOutput?.running} onClick={runCode}>▶</button>
      )}
""" + toolbar[end:]
    toolbar = toolbar.replace("{CODE_LANGS.find(([value]) => value === runOutput.language)?.[1] || runOutput.language}", "{getCodeLanguageLabel(runOutput.language)}")
if 'showLangMenu' in toolbar or 'CODE_LANGS' in toolbar:
    raise SystemExit('Toolbar language picker cleanup failed after anchored fallback')
'''
if needle not in text:
    raise SystemExit('runner repair point not found')
path.write_text(text.replace(needle, replacement, 1))
print('Round 2 runner hardened.')
