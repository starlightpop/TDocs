import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import ContextMenu from './ContextMenu.jsx'
import { formatTime, stripHtml } from '../lib/storage.js'

export default function Sidebar({
  docs, groups, activeId, collapsed, headings = [],
  onSelect, onCreate, onRename, onDelete,
  onMoveDoc, onAddGroup, onRenameGroup, onDeleteGroup,
  onJumpHeading, treeOpen = true, editingGroupId, onCommitGroupName,
  onRenameDoc, onSetHeadingLevel, onDragExport, onReorderGroups, onOpenFiles, onTogglePin,
}) {
  const [query, setQuery] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const [editName, setEditName] = useState('')
  // 侧边栏标题树多选
  const [headingSel, setHeadingSel] = useState(() => new Set())
  // 拖拽高亮的文件夹
  const [dragOverGroupId, setDragOverGroupId] = useState(null)
  // 文件内联重命名
  const [editingDocId, setEditingDocId] = useState(null)
  const [docEditName, setDocEditName] = useState('')

  useEffect(() => {
    if (!createMenuOpen) return undefined
    const close = (event) => { if (!event.target.closest?.('.new-doc-split')) setCreateMenuOpen(false) }
    document.addEventListener('mousedown', close, true)
    return () => document.removeEventListener('mousedown', close, true)
  }, [createMenuOpen])

  // 进入内联编辑时初始化名称（新建或重命名文件夹）
  useEffect(() => {
    if (editingGroupId) {
      const g = groups.find((x) => x.id === editingGroupId)
      setEditName(g?.name || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGroupId])

  const searching = query.trim().length > 0
  const filtered = docs.filter((d) => {
    if (!searching) return true
    const q = query.toLowerCase()
    return d.title.toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q)
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)

  const toggleGroup = (gid) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return next
    })
  }

  const docMenuItems = (doc) => [
    { label: '打开', icon: <Icon name="doc" size={15} />, action: () => onSelect(doc.id) },
    { label: '重命名', icon: <Icon name="edit" size={15} />, action: () => { setDocEditName(doc.title || ''); setEditingDocId(doc.id) } },
    { label: doc.pinned ? '取消置顶' : '置顶', icon: <Icon name="pin" size={15} />, action: () => onTogglePin?.(doc) },
    { sep: true },
    // 移动到：子菜单列出所有文件夹；移出分组：仅已在分组内时显示
    {
      label: '移动到',
      icon: <Icon name="folder" size={15} />,
      submenu: groups.map((g) => ({
        label: g.name,
        icon: <Icon name="folder" size={14} />,
        action: () => onMoveDoc(doc.id, g.id),
      })),
    },
    ...(doc.group
      ? [{ label: '移出分组', icon: <Icon name="doc" size={15} />, action: () => onMoveDoc(doc.id, '') }]
      : []),
    { sep: true },
    { label: '删除', icon: <Icon name="trash" size={15} />, danger: true, action: () => onDelete(doc) },
  ]

  const renderDocItem = (doc) => (
    <div key={doc.id} className="doc-item-wrap">
      <div
        className={`doc-item${doc.id === activeId ? ' active' : ''}${doc.pinned ? ' pinned' : ''}`}
        onClick={() => { if (editingDocId === doc.id) return; onSelect(doc.id) }}
        onDoubleClick={() => { setDocEditName(doc.title || ''); setEditingDocId(doc.id) }}
        draggable
        onDragStart={(e) => {
          // 自定义拖拽跟手卡片，替换默认拖影
          const ghost = document.createElement('div')
          ghost.className = 'drag-ghost'
          const icon = document.createElement('span')
          icon.className = 'drag-ghost-icon'
          icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5M9 12h7M9 16h7"/></svg>'
          const label = document.createElement('span')
          label.className = 'drag-ghost-label'
          label.textContent = doc.title || '无标题文档'
          ghost.appendChild(icon)
          ghost.appendChild(label)
          document.body.appendChild(ghost)
          e.dataTransfer.setDragImage(ghost, 20, 20)
          e.dataTransfer.setData('text/tdocs-doc', doc.id)
          e.dataTransfer.effectAllowed = 'copyMove'
          setTimeout(() => ghost.remove(), 0)
        }}
        onDragEnd={(e) => {
          // 未落到有效目标（如拖出窗口）→ 导出该文档
          if (e.dataTransfer.dropEffect === 'none') {
            onDragExport?.(doc)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, items: docMenuItems(doc) })
        }}
      >
        {editingDocId === doc.id ? (
          <input
            className="doc-title-input doc-rename-input"
            autoFocus
            value={docEditName}
            onChange={(e) => setDocEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onRenameDoc?.(doc, docEditName); setEditingDocId(null) }
              if (e.key === 'Escape') setEditingDocId(null)
            }}
            onBlur={() => { if (editingDocId === doc.id) { onRenameDoc?.(doc, docEditName); setEditingDocId(null) } }}
          />
        ) : (
          <div className="doc-item-title">{doc.pinned && <Icon name="pin" size={12} />}<span>{doc.title || (doc.kind === 'word' ? '无标题 Word' : '无标题文档')}</span></div>
        )}
        <div className="doc-item-meta">
          <span className={`doc-kind-badge ${doc.kind === 'word' ? 'word' : 'document'}`}>{doc.kind === 'word' ? `Word · ${(doc.paper || 'a4').toUpperCase()}` : '文档'}</span>
          {formatTime(doc.updatedAt)}
        </div>
        <div className="doc-item-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn doc-more-btn"
            data-tip="更多操作"
            aria-label="更多操作"
            onClick={(e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              const width = 156
              const x = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))
              setCtxMenu({ x, y: r.bottom + 4, items: docMenuItems(doc) })
            }}
          >
            <Icon name="dots" size={15} />
          </button>
        </div>
      </div>
      {/* 当前文档的标题树（类 Google Docs 文档大纲，再次点击文档可收起） */}
      {doc.id === activeId && treeOpen && headings.length > 0 && (
        <div className="doc-heading-tree">
          {headings.map((h, i) => (
            <div
              key={`${i}-${h.text}`}
              className={`doc-heading lv-${h.level}${headingSel.has(i) ? ' selected' : ''}`}
              title={h.text}
              onClick={(e) => {
                e.stopPropagation()
                if (e.metaKey || e.ctrlKey) {
                  setHeadingSel((prev) => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                } else {
                  onJumpHeading?.(i)
                }
              }}
            >
              {h.text}
            </div>
          ))}
          {headingSel.size > 0 && (
            <div className="doc-heading-actions">
              <span className="doc-heading-count">已选 {headingSel.size}</span>
              <button className="icon-btn" data-tip="标题 1" onClick={(e) => { e.stopPropagation(); onSetHeadingLevel?.([...headingSel], 1); setHeadingSel(new Set()) }}>H1</button>
              <button className="icon-btn" data-tip="标题 2" onClick={(e) => { e.stopPropagation(); onSetHeadingLevel?.([...headingSel], 2); setHeadingSel(new Set()) }}>H2</button>
              <button className="icon-btn" data-tip="标题 3" onClick={(e) => { e.stopPropagation(); onSetHeadingLevel?.([...headingSel], 3); setHeadingSel(new Set()) }}>H3</button>
              <button className="icon-btn" data-tip="转正文" onClick={(e) => { e.stopPropagation(); onSetHeadingLevel?.([...headingSel], null); setHeadingSel(new Set()) }}>T</button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderGroupSection = (group) => {
    const groupDocs = filtered.filter((d) => d.group === group.id && !d.pinned)
    const isCollapsed = collapsedGroups.has(group.id)
    const isEditing = editingGroupId === group.id
    const dragOver = dragOverGroupId === group.id
    return (
      <div key={group.id} className="group-section">
        <div
          className={`group-header${isCollapsed ? '' : ''}`}
          onClick={() => !isEditing && toggleGroup(group.id)}
          onDoubleClick={() => { setEditName(group.name); onRenameGroup(group) }}
          draggable={!isEditing}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/tdocs-group', group.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const docId = e.dataTransfer.getData('text/tdocs-doc')
            if (docId) { onMoveDoc(docId, group.id); setDragOverGroupId(null); return }
            const gid = e.dataTransfer.getData('text/tdocs-group')
            if (gid && gid !== group.id) onReorderGroups?.(gid, group.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: '重命名文件夹', icon: <Icon name="edit" size={15} />, action: () => { setEditName(group.name); onRenameGroup(group) } },
                { label: '删除文件夹', icon: <Icon name="trash" size={15} />, danger: true, action: () => onDeleteGroup(group) },
              ],
            })
          }}
        >
          <span className={`group-caret${isCollapsed ? ' collapsed' : ''}`}>
            <Icon name="chevronDown" size={12} />
          </span>
          <Icon name="folder" size={13} />
          {isEditing ? (
            <input
              className="group-name-input"
              autoFocus
              ref={(el) => { if (el) setTimeout(() => { el.focus() }, 0) }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitGroupName(group.id, editName)
                if (e.key === 'Escape') onCommitGroupName(group.id, null)
              }}
              onBlur={() => onCommitGroupName(group.id, editName)}
            />
          ) : (
            <span className="group-name">{group.name}</span>
          )}
          <span className="group-count">{groupDocs.length}</span>
        </div>
        {!isCollapsed && (
          <div
            className={`group-docs${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverGroupId(group.id) }}
            onDragLeave={() => setDragOverGroupId(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverGroupId(null)
              const docId = e.dataTransfer.getData('text/tdocs-doc')
              if (docId) onMoveDoc(docId, group.id)
            }}
          >
            {groupDocs.length === 0 && <div className="group-empty">空分组</div>}
            {groupDocs.map(renderDocItem)}
          </div>
        )}
      </div>
    )
  }

  const pinnedDocs = filtered.filter((d) => d.pinned)
  const ungroupedDocs = filtered.filter((d) => !d.group && !d.pinned)

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="new-doc-split">
          <button className="btn btn-primary new-doc-btn" onClick={() => { onCreate('document'); setCreateMenuOpen(false) }}>
            <Icon name="plus" size={15} />新建文档
          </button>
          <button className="btn btn-primary new-doc-arrow" aria-label="选择文件类型" onClick={() => setCreateMenuOpen((value) => !value)}>
            <Icon name="chevronDown" size={12} />
          </button>
          {createMenuOpen && (
            <div className="menu new-doc-menu">
              <button className="menu-item" onClick={() => { onCreate('document'); setCreateMenuOpen(false) }}><Icon name="doc" size={15} /><span><strong>文档</strong><small>连续画布</small></span></button>
              <button className="menu-item" onClick={() => { onCreate('word'); setCreateMenuOpen(false) }}><Icon name="page" size={15} /><span><strong>Word</strong><small>A4 / B5 固定纸张</small></span></button>
            </div>
          )}
        </div>
        <div className="sidebar-search-row">
          <div className="search-box">
            <span className="search-icon"><Icon name="search" size={15} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文档…"
            />
          </div>
          <button className="icon-btn" data-tip="新建文件夹" onClick={onAddGroup}>
            <Icon name="folder" size={16} />
          </button>
          <button className="icon-btn" data-tip="打开本地文件" onClick={onOpenFiles}>
            <Icon name="folderOpen" size={16} />
          </button>
        </div>
      </div>

      <div className="doc-list">
        {filtered.length === 0 && (
          <div className="doc-list-empty">{searching ? '没有匹配的文档' : '暂无文档'}</div>
        )}
        {searching ? (
          filtered.map(renderDocItem)
        ) : (
          <>
            {pinnedDocs.length > 0 && (
              <div className="group-section pinned-section">
                <div className="pinned-section-label"><Icon name="pin" size={12} />置顶</div>
                {pinnedDocs.map(renderDocItem)}
              </div>
            )}
            {groups.map(renderGroupSection)}
            {ungroupedDocs.length > 0 && (
              /* 未分组文档直接平铺，不再用“未分组”组头包裹 */
              <div
                className="group-section ungrouped-section"
                onDragOver={(e) => { e.preventDefault(); setDragOverGroupId('__ungrouped') }}
                onDragLeave={() => setDragOverGroupId(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverGroupId(null)
                  const docId = e.dataTransfer.getData('text/tdocs-doc')
                  if (docId) onMoveDoc(docId, '')
                }}
              >
                {ungroupedDocs.map(renderDocItem)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <span>{docs.length} 篇文档 · {groups.length} 个文件夹</span>
        <span>本地存储</span>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </aside>
  )
}
