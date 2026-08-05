import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const searchHighlightKey = new PluginKey('tdocsSearchHighlight')

export const SearchHighlightExtension = Extension.create({
  name: 'tdocsSearchHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, current) {
          const meta = tr.getMeta(searchHighlightKey)
          if (meta) {
            const decorations = (meta.matches || []).map((match, index) => Decoration.inline(
              match.from,
              match.to,
              { class: index === meta.activeIndex ? 'search-match search-match-active' : 'search-match' },
            ))
            return DecorationSet.create(tr.doc, decorations)
          }
          return current.map(tr.mapping, tr.doc)
        },
      },
      props: {
        decorations(state) { return searchHighlightKey.getState(state) },
      },
    })]
  },
})

export function setSearchHighlights(editor, matches = [], activeIndex = -1) {
  if (!editor) return
  editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, { matches, activeIndex }))
}
