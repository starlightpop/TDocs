import { useRef, useState } from 'react'
import { Icon } from './Icons.jsx'

const TEXT_COLORS = [
  '#1c1e21', '#6b7280', '#9aa2b1', '#e5484d', '#f2814a', '#e0a428',
  '#9bc53d', '#2f9e6e', '#2bb3a3', '#3b82c4', '#4f6ef7', '#7048e8',
  '#9d4edd', '#d63384', '#8d5524',
]

const BLOCK_OPTIONS = [
  ['paragraph', '正文'],
  ['h1', '标题 1'],
  ['h2', '标题 2'],
  ['h3', '标题 3'],
  ['bulletList', '无序列表'],
  ['orderedList', '有序列表'],
  ['taskList', '任务列表'],
  ['blockquote', '引用'],
  ['codeBlock', '代码块'],
]
const HIGHLIGHT_COLORS = [
  '#ffe58a', '#ffd3a3', '#ffb3b5', '#ffc9e2', '#d5b8ff', '#b8d4ff',
  '#a8e6d2', '#d3f2b6', '#fff3bf', '#c3fae8', '#d0ebff', '#e7e9ee',
  '#f5c6aa', '#b197fc', '#63e6be',
]

function TB({ icon, title, active, disabled, onClick }) {
  return (
    <button
      className={`icon-btn${active ? ' active' : ''}`}
      data-tip={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Icon name={icon} size={17} />
    </button>
  )
}

export default function Toolbar({ editor, onAi }) {
  const [showTextColor, setShowTextColor] = useState(false)
  const [showHighlight, setShowHighlight] = useState(false)
  const [showTableGrid, setShowTableGrid] = useState(false)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [showFontFamily, setShowFontFamily] = useState(false)
  const [hoverCell, setHoverCell] = useState({ r: 0, c: 0 })
  const fileRef = useRef(null)

  if (!editor) return null

  const blockValue = (() => {
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    if (editor.isActive('bulletList')) return 'bulletList'
    if (editor.isActive('orderedList')) return 'orderedList'
    if (editor.isActive('taskList')) return 'taskList'
    if (editor.isActive('blockquote')) return 'blockquote'
    if (editor.isActive('codeBlock')) return 'codeBlock'
    return 'paragraph'
  })()

  const setBlock = (v) => {
    const chain = editor.chain().focus()
    if (v === 'paragraph') chain.setParagraph().run()
    else if (v.startsWith('h')) chain.setHeading({ level: Number(v[1]) }).run()
    else if (v === 'bulletList') chain.toggleBulletList().run()
    else if (v === 'orderedList') chain.toggleOrderedList().run()
    else if (v === 'taskList') chain.toggleTaskList().run()
    else if (v === 'blockquote') chain.setParagraph().toggleBlockquote().run()
    else if (v === 'codeBlock') chain.setParagraph().toggleCodeBlock().run()
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

  const insertImage = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
  }

  const closePopovers = () => {
    setShowTextColor(false)
    setShowHighlight(false)
    setShowTableGrid(false)
    setShowBlockMenu(false)
    setShowFontSize(false)
    setShowFontFamily(false)
  }

  return (
    <div className="toolbar">
      {(showTextColor || showHighlight || showTableGrid || showBlockMenu || showFontSize || showFontFamily) && (
        <div className="overlay" onClick={closePopovers} />
      )}

      <TB icon="undo" title="撤销 (⌘Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <TB icon="redo" title="重做 (⌘⇧Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      <div className="divider" />

      {/* 段落样式：再次点击当前样式 → 恢复正文 */}
      <div className="menu-wrap">
        <button
          className="tb-block-btn"
          title="段落样式（再次点击当前样式可恢复正文）"
          onClick={() => { setShowBlockMenu(!showBlockMenu); setShowTextColor(false); setShowHighlight(false); setShowTableGrid(false) }}
        >
          {BLOCK_OPTIONS.find(([v]) => v === blockValue)?.[1] || '正文'}
          <Icon name="chevronDown" size={13} />
        </button>
        {showBlockMenu && (
          <div className="menu block-menu" onClick={(e) => e.stopPropagation()}>
            {BLOCK_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                className={`menu-item${v === blockValue ? ' active' : ''}`}
                onClick={() => {
                  // 再次点击当前样式 = 取消，恢复正文
                  setBlock(v === blockValue ? 'paragraph' : v)
                  setShowBlockMenu(false)
                }}
              >
                <span>{label}</span>
                {v === blockValue && <span className="menu-item-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="divider" />

      {/* 字号 + 字体（自定义下拉，风格统一） */}
      <div className="menu-wrap">
        <button
          className="tb-block-btn tb-font-btn"
          title="字号"
          onClick={() => { setShowFontSize(!showFontSize); setShowFontFamily(false); setShowBlockMenu(false); setShowTextColor(false); setShowHighlight(false) }}
        >
          {editor.getAttributes('textStyle').fontSize ? Number.parseFloat(editor.getAttributes('textStyle').fontSize) : '字号'}
          <Icon name="chevronDown" size={12} />
        </button>
        {showFontSize && (
          <div className="menu font-menu" onClick={(e) => e.stopPropagation()}>
            <button
              className={`menu-item${!editor.getAttributes('textStyle').fontSize ? ' active' : ''}`}
              onClick={() => { editor.chain().focus().setMark('textStyle', { fontSize: null }).run(); setShowFontSize(false) }}
            >
              <span>默认</span>
              {!editor.getAttributes('textStyle').fontSize && <span className="menu-item-check">✓</span>}
            </button>
            {['12', '14', '16', '18', '20', '24', '28', '32'].map((s) => {
              const cur = editor.getAttributes('textStyle').fontSize
              return (
                <button
                  key={s}
                  className={`menu-item${cur === `${s}px` ? ' active' : ''}`}
                  onClick={() => { editor.chain().focus().setMark('textStyle', { fontSize: `${s}px` }).run(); setShowFontSize(false) }}
                >
                  <span>{s}</span>
                  {cur === `${s}px` && <span className="menu-item-check">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="menu-wrap">
        <button
          className="tb-block-btn tb-font-btn tb-font-btn-wide"
          title="字体"
          onClick={() => { setShowFontFamily(!showFontFamily); setShowFontSize(false); setShowBlockMenu(false); setShowTextColor(false); setShowHighlight(false) }}
        >
          {(() => {
            const fam = editor.getAttributes('textStyle').fontFamily || ''
            if (!fam) return '字体'
            if (fam.includes('Songti') || fam.includes('SimSun')) return '宋体'
            if (fam.includes('Kaiti') || fam.includes('KaiTi')) return '楷体'
            if (fam.includes('FangSong') || fam.includes('Fangsong')) return '仿宋'
            if (fam.includes('Georgia')) return '衬线'
            return '黑体'
          })()}
          <Icon name="chevronDown" size={12} />
        </button>
        {showFontFamily && (
          <div className="menu font-menu" onClick={(e) => e.stopPropagation()}>
            {[
              ['', '默认'],
              ["serif, 'Songti SC', 'SimSun'", '宋体'],
              ["sans-serif, 'PingFang SC', 'Microsoft YaHei'", '黑体'],
              ["'Kaiti SC', 'KaiTi', serif", '楷体'],
              ["'STFangsong', 'FangSong', serif", '仿宋'],
              ["'Georgia', 'Times New Roman', serif", '衬线'],
            ].map(([v, label]) => {
              const cur = editor.getAttributes('textStyle').fontFamily || ''
              return (
                <button
                  key={label}
                  className={`menu-item${cur === v ? ' active' : ''}`}
                  style={{ fontFamily: v || undefined }}
                  onClick={() => { editor.chain().focus().setMark('textStyle', { fontFamily: v || null }).run(); setShowFontFamily(false) }}
                >
                  <span>{label}</span>
                  {cur === v && <span className="menu-item-check">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <TB icon="bold" title="加粗 (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <TB icon="italic" title="斜体 (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <TB icon="underline" title="下划线 (⌘U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <TB icon="strike" title="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />

      {/* 文字颜色 */}
      <div className="menu-wrap">
        <button className="color-btn" data-tip="文字颜色" aria-label="文字颜色" onClick={() => { setShowTextColor(!showTextColor); setShowHighlight(false); setShowTableGrid(false); setShowBlockMenu(false) }}>
          A<div className="bar" />
        </button>
        {showTextColor && (
          <div className="color-popover" onClick={(e) => e.stopPropagation()}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                className="color-swatch"
                style={{ background: c }}
                onClick={() => { editor.chain().focus().setColor(c).run(); setShowTextColor(false) }}
              />
            ))}
            <button className="color-swatch none" title="清除颜色" onClick={() => { editor.chain().focus().unsetColor().run(); setShowTextColor(false) }} />
          </div>
        )}
      </div>

      {/* 高亮 */}
      <div className="menu-wrap">
        <button className="color-btn" data-tip="高亮背景" aria-label="高亮背景" onClick={() => { setShowHighlight(!showHighlight); setShowTextColor(false); setShowTableGrid(false); setShowBlockMenu(false) }}>
          <Icon name="highlight" size={15} />
        </button>
        {showHighlight && (
          <div className="color-popover">
            {HIGHLIGHT_COLORS.map((c, i) => (
              <button
                key={i}
                className="color-swatch"
                style={{ background: c === 'transparent' ? undefined : c }}
                onClick={() => {
                  if (c === 'transparent') editor.chain().focus().unsetHighlight().run()
                  else editor.chain().focus().toggleHighlight({ color: c }).run()
                  setShowHighlight(false)
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="divider" />

      <TB icon="link" title="插入/移除链接" active={editor.isActive('link')} onClick={setLink} />
      <div className="divider" />

      <TB icon="alignLeft" title="左对齐" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
      <TB icon="alignCenter" title="居中对齐" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
      <TB icon="alignRight" title="右对齐" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      <div className="divider" />

      <TB icon="bulletList" title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <TB icon="orderedList" title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <TB icon="taskList" title="任务列表" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <TB icon="quote" title="引用块" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <TB icon="codeBlock" title="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <TB icon="hr" title="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <div className="divider" />

      {/* 表格 */}
      <div className="menu-wrap">
        <button className="icon-btn" data-tip="插入表格" aria-label="插入表格" onClick={() => { setShowTableGrid(!showTableGrid); setShowTextColor(false); setShowHighlight(false); setShowBlockMenu(false) }}>
          <Icon name="table" size={17} />
        </button>
        {showTableGrid && (
          <div className="table-grid-pop" onMouseLeave={() => setHoverCell({ r: 0, c: 0 })}>
            <div className="table-grid">
              {Array.from({ length: 30 }).map((_, i) => {
                const r = Math.floor(i / 6) + 1
                const c = (i % 6) + 1
                return (
                  <button
                    key={i}
                    className={`table-grid-cell${r <= hoverCell.r && c <= hoverCell.c ? ' hot' : ''}`}
                    onMouseEnter={() => setHoverCell({ r, c })}
                    onClick={() => {
                      editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run()
                      setShowTableGrid(false)
                    }}
                  />
                )
              })}
            </div>
            <div className="table-grid-label">
              {hoverCell.r ? `${hoverCell.r} × ${hoverCell.c}` : '拖动选择大小'}
            </div>
          </div>
        )}
      </div>

      {/* 图片 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }}
      />
      <TB icon="image" title="插入图片" onClick={() => fileRef.current?.click()} />

      {/* 表格编辑操作 */}
      {editor.isActive('table') && (
        <>
          <div className="divider" />
          <TB icon="plus" title="添加行" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <TB icon="plus" title="添加列" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <TB icon="trash" title="删除表格" onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
      <div className="divider" />
      <TB icon="eraser" title="清除格式" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} />
      <div className="divider" />
      <button className="ai-btn" data-tip="AI 改写（调用大模型修改内容）" onClick={onAi}>
        <Icon name="sparkle" size={15} /> AI
      </button>
    </div>
  )
}
