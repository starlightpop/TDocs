// 选中文字后的浮动格式工具条（飞书式：自定位浮动条，内部下拉悬停展开，箭头旋转）
import { useRef, useState } from 'react'
import { Icon } from './Icons.jsx'

const TEXT_COLORS = [
  '#1c1e21', '#6b7280', '#9aa2b1', '#e5484d', '#f2814a', '#e0a428',
  '#9bc53d', '#2f9e6e', '#2bb3a3', '#3b82c4', '#4f6ef7', '#7048e8',
  '#9d4edd', '#d63384', '#8d5524',
]
const BG_COLORS = [
  '#ffe58a', '#ffd3a3', '#ffb3b5', '#ffc9e2', '#d5b8ff', '#b8d4ff',
  '#a8e6d2', '#d3f2b6', '#fff3bf', '#c3fae8', '#d0ebff', '#e7e9ee',
  '#f5c6aa', '#b197fc', '#63e6be', 'transparent',
]

const BLOCK_ITEMS = [
  ['paragraph', '正文'],
  ['h1', '标题 1'], ['h2', '标题 2'], ['h3', '标题 3'],
  ['h4', '标题 4'], ['h5', '标题 5'], ['h6', '标题 6'],
]

export default function BubbleBar({ editor, pos, onAi }) {
  const [hoverMenu, setHoverMenu] = useState(null) // 'block' | 'color' | 'align'
  const closeTimer = useRef(null)

  const hoverOpen = (name) => {
    clearTimeout(closeTimer.current)
    setHoverMenu(name)
  }
  const hoverClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHoverMenu(null), 180)
  }

  const setBlock = (v) => {
    const chain = editor.chain().focus()
    if (v === 'paragraph') chain.setParagraph()
    else chain.setHeading({ level: Number(v[1]) })
    chain.run()
  }

  const setLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('输入链接地址', 'https://')
    if (url && url !== 'https://') {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  if (!editor || !pos) return null

  return (
    <div
      className="bubble-wrap"
      style={{ top: pos.top - 46, left: pos.left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.preventDefault() /* 防止点击浮动条让选区消失 */}
    >
      <div className="bubble-bar">
        {/* T：段落/标题，悬停展开 */}
        <div className="bm-item" onMouseEnter={() => hoverOpen('block')} onMouseLeave={hoverClose}>
          <button className={`bm-btn${hoverMenu === 'block' ? ' open' : ''}`} title="段落样式" onClick={() => setBlock('paragraph')}>
            <span className="bm-t">T</span>
            <Icon name="chevronDown" size={10} />
          </button>
          {hoverMenu === 'block' && (
            <div className="menu bm-menu" onMouseEnter={() => hoverOpen('block')} onMouseLeave={hoverClose}>
              {BLOCK_ITEMS.map(([v, label]) => {
                const active = v === 'paragraph'
                  ? !['1', '2', '3', '4', '5', '6'].some((l) => editor.isActive('heading', { level: Number(l) }))
                  : editor.isActive('heading', { level: Number(v[1]) })
                return (
                  <button
                    key={v}
                    className={`menu-item${active ? ' active' : ''}`}
                    onClick={() => { setBlock(v); setHoverMenu(null) }}
                  >
                    <span>{label}</span>
                    {active && <span className="menu-item-check">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="bm-sep" />
        <button className="bm-btn" title="加粗 (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button className="bm-btn" title="斜体 (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button className="bm-btn" title="下划线 (⌘U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
        <button className="bm-btn" title="删除线" onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
        <div className="bm-sep" />

        {/* A：文字颜色 + 背景，悬停展开 */}
        <div className="bm-item" onMouseEnter={() => hoverOpen('color')} onMouseLeave={hoverClose}>
          <button className={`bm-btn bm-color${hoverMenu === 'color' ? ' open' : ''}`} title="文字颜色 / 高亮背景">
            A
            <span className="bm-bar" />
            <Icon name="chevronDown" size={10} />
          </button>
          {hoverMenu === 'color' && (
            <div className="menu bm-menu bm-color-menu" onMouseEnter={() => hoverOpen('color')} onMouseLeave={hoverClose}>
              <div className="bm-label">字体颜色</div>
              <div className="bm-swatches">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="color-swatch"
                    style={{ background: c }}
                    title={c}
                    onClick={() => { editor.chain().focus().setColor(c).run() }}
                  />
                ))}
                <button className="color-swatch none" title="清除颜色" onClick={() => { editor.chain().focus().unsetColor().run() }} />
              </div>
              <div className="bm-label">背景颜色</div>
              <div className="bm-swatches">
                {BG_COLORS.map((c, i) => (
                  <button
                    key={i}
                    className="color-swatch"
                    style={c === 'transparent' ? undefined : { background: c }}
                    title={c === 'transparent' ? '无背景' : ''}
                    onClick={() => {
                      if (c === 'transparent') editor.chain().focus().unsetHighlight().run()
                      else editor.chain().focus().toggleHighlight({ color: c }).run()
                    }}
                  />
                ))}
              </div>
              <button className="bm-reset" onClick={() => { editor.chain().focus().unsetColor().unsetHighlight().run(); setHoverMenu(null) }}>
                恢复默认
              </button>
            </div>
          )}
        </div>

        {/* 对齐，悬停展开 */}
        <div className="bm-item" onMouseEnter={() => hoverOpen('align')} onMouseLeave={hoverClose}>
          <button className={`bm-btn${hoverMenu === 'align' ? ' open' : ''}`} title="对齐">
            <Icon name="alignLeft" size={15} />
            <Icon name="chevronDown" size={10} />
          </button>
          {hoverMenu === 'align' && (
            <div className="menu bm-menu" onMouseEnter={() => hoverOpen('align')} onMouseLeave={hoverClose}>
              {[
                ['left', '左对齐', 'alignLeft'],
                ['center', '居中对齐', 'alignCenter'],
                ['right', '右对齐', 'alignRight'],
              ].map(([v, label, ic]) => (
                <button
                  key={v}
                  className={`menu-item${editor.isActive({ textAlign: v }) ? ' active' : ''}`}
                  onClick={() => { editor.chain().focus().setTextAlign(v).run(); setHoverMenu(null) }}
                >
                  <Icon name={ic} size={15} />
                  <span>{label}</span>
                  {editor.isActive({ textAlign: v }) && <span className="menu-item-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bm-sep" />
        <button className={`bm-btn${editor.isActive('link') ? ' active' : ''}`} title="插入/移除链接" onClick={setLink}>
          <Icon name="link" size={15} />
        </button>
        {onAi && (
          <>
            <div className="bm-sep" />
            <button className="bm-btn bm-ai" title="AI 改写选中内容" onClick={() => onAi?.()}>
              <Icon name="sparkle" size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
