// 大纲：从编辑器中提取标题列表，支持按索引跳转与批量修改级别

export function extractHeadings(editor) {
  if (!editor?.view?.dom) return []
  const nodes = editor.view.dom.querySelectorAll('h1, h2, h3')
  return Array.from(nodes)
    .map((el) => ({ level: Number(el.tagName[1]), text: el.textContent.trim() }))
    .filter((h) => h.text)
}

/** 按当前 DOM 顺序跳转到第 index 个标题（不依赖持久 id，永不失效） */
export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3')
  const el = nodes?.[index]
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // 光标同步移到标题处，避免停留在原地
  const pos = editor.view.posAtDOM(el, 0)
  if (pos != null) {
    editor.chain().focus().setTextSelection(pos).run()
  }
}

/**
 * 批量设置标题级别
 * level: 1/2/3 → 设为对应标题；null → 转为正文段落
 */
export function setHeadingsLevel(editor, indexes, level) {
  if (!editor || !indexes?.length) return
  const { state, view } = editor
  // 收集文档中所有标题节点的位置（与 DOM 顺序一致）
  const targets = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') targets.push({ pos, node })
  })
  let tr = state.tr
  for (const i of indexes) {
    const t = targets[i]
    if (!t) continue
    if (level) {
      tr = tr.setNodeMarkup(t.pos, state.schema.nodes.heading, { ...t.node.attrs, level })
    } else {
      tr = tr.setNodeMarkup(t.pos, state.schema.nodes.paragraph, {})
    }
  }
  view.dispatch(tr.scrollIntoView())
}
