from pathlib import Path

editor_path = Path('src/components/Editor.jsx')
editor = editor_path.read_text()

old_plugin = """    apply: (tr, set) => {
      const meta = tr.getMeta(aiSelKey)
      return meta ? DecorationSet.create(tr.doc, meta) : set.map(tr.mapping, tr.doc)
    },"""
new_plugin = """    apply: (tr, set) => {
      const meta = tr.getMeta(aiSelKey)
      if (meta !== undefined) {
        return Array.isArray(meta) && meta.length
          ? DecorationSet.create(tr.doc, meta)
          : DecorationSet.empty
      }
      return set.map(tr.mapping, tr.doc)
    },"""
if old_plugin not in editor:
    raise SystemExit('AI selection plugin patch point not found')
editor = editor.replace(old_plugin, new_plugin, 1)
editor = editor.replace(
    "editor.view.dispatch(editor.state.tr.setMeta(aiSelKey, decos.length ? decos : null))",
    "editor.view.dispatch(editor.state.tr.setMeta(aiSelKey, decos))",
    1,
)

marker = """  const reflow = () => {
    if (!editor || !paged) return false
    const { view, state } = editor
"""
replacement = """  // 删除内容后，后页内容应像 Word 一样自动向前回流。
  // 整块能放下时直接前移；文本块至少能容纳一行时先前移，再由溢出逻辑在行末拆开。
  const pullForward = (state, view) => {
    const pages = []
    state.doc.forEach((node, pos) => {
      if (node.type.name === 'page') pages.push({ node, pos })
    })

    for (let index = 0; index < pages.length - 1; index += 1) {
      const current = pages[index]
      const next = pages[index + 1]
      const currentDom = view.nodeDOM(current.pos)
      const currentPage = currentDom?.matches?.('[data-page]')
        ? currentDom
        : currentDom?.querySelector?.('[data-page]')
      if (!currentPage || !next.node.firstChild) continue

      const first = next.node.firstChild
      if (next.node.childCount === 1 && first.isTextblock && first.textContent.length === 0) {
        view.dispatch(state.tr.delete(next.pos, next.pos + next.node.nodeSize))
        return true
      }

      const last = current.node.lastChild
      const lastPos = current.pos + 1 + current.node.content.size - last.nodeSize
      const lastDom = view.nodeDOM(lastPos)
      const firstDom = view.nodeDOM(next.pos + 1)
      const lastRect = lastDom?.getBoundingClientRect?.()
      const firstRect = firstDom?.getBoundingClientRect?.()
      if (!lastRect || !firstRect) continue

      const remaining = getPageContentBottom(currentPage) - lastRect.bottom
      const lineHeight = Number.parseFloat(getComputedStyle(firstDom).lineHeight) || 24
      const fitsWhole = firstRect.height <= remaining + 1
      const canTakeTextLine = first.isTextblock && remaining >= lineHeight * 1.25
      if (!fitsWhole && !canTakeTextLine) continue

      const currentChildren = []
      const nextChildren = []
      current.node.forEach((child) => currentChildren.push(child))
      next.node.forEach((child, _offset, childIndex) => {
        if (childIndex > 0) nextChildren.push(child)
      })

      const replacementPages = [
        state.schema.nodes.page.create(current.node.attrs, [...currentChildren, first]),
      ]
      if (nextChildren.length) {
        replacementPages.push(state.schema.nodes.page.create(next.node.attrs, nextChildren))
      }

      view.dispatch(
        state.tr.replaceWith(
          current.pos,
          next.pos + next.node.nodeSize,
          replacementPages,
        ),
      )
      return true
    }
    return false
  }

  const reflow = () => {
    if (!editor || !paged) return false
    const { view, state } = editor
"""
if marker not in editor:
    raise SystemExit('page flow insertion point not found')
editor = editor.replace(marker, replacement, 1)
editor = editor.replace(
    """    if (!target) return false

    const { node, pos, pageEl } = target""",
    """    if (!target) return pullForward(state, view)

    const { node, pos, pageEl } = target""",
    1,
)
editor_path.write_text(editor)

test_path = Path('tests/codeRunner.test.mjs')
tests = test_path.read_text()
addition = """

test('print 调用通过 Python 返回直接标准输出', async () => {
  const result = await runCode({ language: 'plaintext', code: 'print(\"p\")' })
  assert.equal(result.ok, true)
  assert.equal(result.language, 'python')
  assert.equal(result.stdout, 'p')
  assert.equal(result.stderr, '')
})
"""
if 'print 调用通过 Python 返回直接标准输出' not in tests:
    tests += addition
test_path.write_text(tests)

print('AI selection cleanup, forward page flow and Python stdout test applied.')
