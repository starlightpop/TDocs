// 大纲：从编辑器中提取标题列表，支持按索引跳转与批量修改级别

export function extractHeadings(editor) {
  if (!editor?.view?.dom) return []
  const nodes = editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return Array.from(nodes)
    .map((el) => ({ level: Number(el.tagName[1]), text: el.textContent.trim() }))
    .filter((h) => h.text)
}

/** 按当前 DOM 顺序跳转到第 index 个标题（不依赖持久 id，永不失效） */
export function scrollToHeadingByIndex(editor, index) {
  const nodes = editor?.view?.dom?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const el = nodes?.[index]
  if (!el) return

  const canvas = el.closest('.canvas') || document.querySelector('.canvas')
  const page = el.closest('.document-page')

  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect()
    const elementRect = el.getBoundingClientRect()
    const topOffset = 20
    const targetTop = Math.max(0, canvas.scrollTop + elementRect.top - canvasRect.top - topOffset)

    if (page) {
      const pageRect = page.getBoundingClientRect()
      const pageTopInCanvas = canvas.scrollTop + pageRect.top - canvasRect.top
      const headingTopInPage = Math.max(0, targetTop - pageTopInCanvas)
      const requiredHeight = headingTopInPage + canvas.clientHeight * 2.25
      const currentHeight = Number.parseFloat(page.style.getPropertyValue('--infinite-document-min-height')) || page.offsetHeight
      if (requiredHeight > currentHeight) {
        page.style.setProperty('--infinite-document-min-height', `${Math.ceil(requiredHeight)}px`)
      }
    }

    requestAnimationFrame(() => {
      canvas.scrollTo({ top: targetTop, behavior: 'smooth' })
    })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 同步文档选区，但不调用 focus()，避免 ProseMirror 再次改写滚动位置。
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
