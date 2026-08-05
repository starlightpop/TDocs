from pathlib import Path

path = Path('scripts/apply-round4.py')
text = path.read_text(encoding='utf-8')

old_map = """    .map(([label, insert, cursorBack, detail]) => ({ label, insert, cursorBack, detail, replaceLength: token.length }))
    .filter((item) => item.label.toLowerCase().startsWith(lower))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === lower ? 0 : 1
      const bExact = b.label.toLowerCase() === lower ? 0 : 1
      return aExact - bExact || a.label.length - b.label.length || a.label.localeCompare(b.label)
    })
    .slice(0, Math.max(1, limit))
"""
new_map = """    .map(([label, insert, cursorBack, detail], order) => ({ label, insert, cursorBack, detail, replaceLength: token.length, order }))
    .filter((item) => item.label.toLowerCase().startsWith(lower))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === lower ? 0 : 1
      const bExact = b.label.toLowerCase() === lower ? 0 : 1
      return aExact - bExact || a.order - b.order
    })
    .slice(0, Math.max(1, limit))
    .map(({ order, ...item }) => item)
"""
if old_map not in text:
    raise RuntimeError('completion candidate anchor missing')
text = text.replace(old_map, new_map, 1)

old_resolve = """export function resolveCodeCompletion(language, textBeforeCursor) {
  return getCodeCompletionCandidates(language, textBeforeCursor, 1)[0] || null
}
"""
new_resolve = """export function resolveCodeCompletion(language, textBeforeCursor) {
  const candidate = getCodeCompletionCandidates(language, textBeforeCursor, 1)[0]
  if (!candidate) return null
  return {
    insert: candidate.insert,
    cursorBack: candidate.cursorBack,
    replaceLength: candidate.replaceLength,
  }
}
"""
if old_resolve not in text:
    raise RuntimeError('completion resolver anchor missing')
text = text.replace(old_resolve, new_resolve, 1)

text = text.replace(
    "assert.equal(resolveCodeCompletion('javascript', 'con')?.label, 'console.log')",
    "assert.equal(resolveCodeCompletion('javascript', 'con')?.insert, 'console.log()')",
    1,
)

text = text.replace(
    "for (const suggestion of params.dictionarySuggestions.slice(0, 5))",
    "for (const suggestion of (params.dictionarySuggestions || []).slice(0, 5))",
    1,
)
text = text.replace(
    "if (params.dictionarySuggestions.length) template.push({ type: 'separator' })",
    "if ((params.dictionarySuggestions || []).length) template.push({ type: 'separator' })",
    1,
)

path.write_text(text, encoding='utf-8')
print('round 4 compatibility repair applied')
