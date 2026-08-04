import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import ContextMenu from './ContextMenu.jsx'
import { formatTime, stripHtml } from '../lib/storage.js'

export default function Sidebar({
  docs, groups, activeId, collapsed, headings = [],
  onSelect, onCreate, onRename, onDelete,
  onMoveDoc, onAddGroup, onRenameGroup, onDeleteGroup,
  onJumpHeading, treeOpen = true, editingGroupId, onCommitGroupName,
}) {
  const [query, setQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [dotsOpenId, setDotsOpenId] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const [editName, setEditName] = useState('')

  // 点击外部关闭三点菜单
  useEffect(() => {
    if (!dotsOpenId) return
    const close = () => setDotsOpenId(null)
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [dotsOpenId])

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
  })

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
    { label: '重命名', icon: <Icon name="edit" size={15} />, action: () => onRename(doc) },
    { sep: true },
    ...moveItems(doc),
    { sep: true },
    { label: '删除', icon: <Icon name="trash" size={15} />, danger: true, action: () => onDelete(doc) },
  ]

  const moveItems = (doc) => {
    const items = []
    if (doc.group) {
      items.push({ label: '移到：未分组', icon: <Icon name="doc" size={15} />, action: () => onMoveDoc(doc.id, '') })
    }
    for (const g of groups) {
      if (g.id !== doc.group) {
        items.push({ label: `移到：${g.name}`, icon: <Icon name="folder" size={15} />, action: () => onMoveDoc(doc.id, g.id) })
      }
    }
    if (!doc.group && groups.length === 0) {
      items.push({ label: '新建分组…', icon: <Icon name="folder" size={15} />, action: onAddGroup })
    }
    return items
  }

  const renderDocItem = (doc) => (
    <div key={doc.id} className="doc-item-wrap">
      <div
        className={`doc-item${doc.id === activeId ? ' active' : ''}`}
        onClick={() => onSelect(doc.id)}
        onDoubleClick={() => onRename(doc)}
        title="双击重命名"
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, items: docMenuItems(doc) })
        }}
      >
        <div className="doc-item-title">{doc.title || '无标题文档'}</div>
        <div className="doc-item-meta">
          {formatTime(doc.updatedAt)}
        </div>
        <div className="doc-item-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn"
            data-tip="更多操作"
            aria-label="更多操作"
            onClick={(e) => { e.stopPropagation(); setDotsOpenId(dotsOpenId === doc.id ? null : doc.id) }}
          >
            <Icon name="dots" size={15} />
          </button>
          {dotsOpenId === doc.id && (
            <div className="menu doc-dots-menu" onClick={(e) => e.stopPropagation()}>
              {docMenuItems(doc).map((it, i) =>
                it.sep ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    className={`menu-item${it.danger ? ' danger' : ''}`}
                    onClick={() => { setDotsOpenId(null); it.action() }}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      {/* 当前文档的标题树（类 Google Docs 文档大纲，再次点击文档可收起） */}
      {doc.id === activeId && treeOpen && headings.length > 0 && (
        <div className="doc-heading-tree">
          {headings.map((h, i) => (
            <div
              key={`${i}-${h.text}`}
              className={`doc-heading lv-${h.level}`}
              title={h.text}
              onClick={(e) => {
                e.stopPropagation()
                onJumpHeading?.(i)
              }}
            >
              {h.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderGroupSection = (group) => {
    const groupDocs = filtered.filter((d) => d.group === group.id)
    const isCollapsed = collapsedGroups.has(group.id)
    const isEditing = editingGroupId === group.id
    return (
      <div key={group.id} className="group-section">
        <div
          className="group-header"
          onClick={() => !isEditing && toggleGroup(group.id)}
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
              ref={(el) => { if (el) setTimeout(() => { el.focus(); el.select() }, 0) }}
              value={editName}
              onFocus={(e) => e.target.select()}
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
          <div className="group-docs">
            {groupDocs.length === 0 && <div className="group-empty">空分组</div>}
            {groupDocs.map(renderDocItem)}
          </div>
        )}
      </div>
    )
  }

  const ungroupedDocs = filtered.filter((d) => !d.group)

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="btn btn-primary new-doc-btn" onClick={() => onCreate()}>
          <Icon name="plus" size={15} /> 新建文档
        </button>
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
            {groups.map(renderGroupSection)}
            {ungroupedDocs.length > 0 && (
              <div className="group-section">
                {groups.length > 0 && (
                  <div className="group-header muted" onClick={() => toggleGroup('__ungrouped')}>
                    <span className={`group-caret${collapsedGroups.has('__ungrouped') ? ' collapsed' : ''}`}>
                      <Icon name="chevronDown" size={12} />
                    </span>
                    <Icon name="doc" size={13} />
                    <span className="group-name">未分组</span>
                    <span className="group-count">{ungroupedDocs.length}</span>
                  </div>
                )}
                {(groups.length === 0 || !collapsedGroups.has('__ungrouped')) && ungroupedDocs.map(renderDocItem)}
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
