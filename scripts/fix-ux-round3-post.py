from pathlib import Path

editor_path = Path('src/components/Editor.jsx')
editor = editor_path.read_text(encoding='utf-8')
old = """        previousLogical = { codeId, nextLine: lineStart + countCodeLines(normalized.textContent) }
"""
new = """        const normalizedStart = Math.max(1, Number(normalized.attrs.lineStart) || 1)
        previousLogical = { codeId, nextLine: normalizedStart + countCodeLines(normalized.textContent) }
"""
if old not in editor:
    raise SystemExit('code continuation next-line patch point not found')
editor_path.write_text(editor.replace(old, new, 1), encoding='utf-8')

icons_path = Path('src/components/Icons.jsx')
icons = icons_path.read_text(encoding='utf-8')
marker = """  doc: (
    <svg viewBox=\"0 0 24 24\" {...p}><path d=\"M6 2h8l5 5v15H6z\" /><path d=\"M14 2v5h5M9 12h7M9 16h7\" /></svg>
  ),
"""
replacement = """  page: (
    <svg viewBox=\"0 0 24 24\" {...p}><rect x=\"5\" y=\"2.5\" width=\"14\" height=\"19\" rx=\"1.5\" /><path d=\"M8 7h8M8 11h8M8 15h6\" /></svg>
  ),
""" + marker
if marker not in icons:
    raise SystemExit('page icon insertion point not found')
icons_path.write_text(icons.replace(marker, replacement, 1), encoding='utf-8')

test_path = Path('tests/uxRound3.test.mjs')
test = test_path.read_text(encoding='utf-8')
append = """

test('续块合并后按合并节点起始行计算下一页行号', () => {
  assert.match(editor, /normalizedStart \+ countCodeLines\(normalized\.textContent\)/)
})

const icons = fs.readFileSync('src/components/Icons.jsx', 'utf8')
test('Word 工作区拥有明确纸张图标', () => {
  assert.match(icons, /page:\s*\(/)
})
"""
if '续块合并后按合并节点起始行计算下一页行号' not in test:
    test_path.write_text(test + append, encoding='utf-8')

print('UX round 3 post-fixes applied.')
