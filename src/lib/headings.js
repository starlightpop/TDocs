// 大纲：从编辑器中提取标题列表（含文档位置 pos），支持按索引跳转与批量修改级别

export function extractHeadings(editor) {
  if (!editor?.state) return []
  const result = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.textContent.trim()) {
      result.push({ level: node.attrs.level || 1, text: node.textContent.trim(), pos })
    }
  })
  return result
}

/** 按当前 DOM 顺序跳转到第 index 个标题（不依赖持久 id，永不失效） */
export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const el = nodes?.[index]
  if (!el) return

  const canvas = el.closest('.canvas') || document.querySelector('.canvas')
  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect()
    const elementRect = el.getBoundingClientRect()
    const targetTop = Math.max(0, canvas.scrollTop + elementRect.top - canvasRect.top - 20)
    canvas.scrollTo({ top: targetTop, behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 同步选区，不调用 focus()，避免编辑器重新改写滚动位置。
  const pos = editor.view.posAtDOM(el, 0)
  if (pos != null) editor.commands.setTextSelection(pos)
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
