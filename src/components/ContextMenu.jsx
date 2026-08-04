// 通用右键/上下文菜单（支持 hover 展开子菜单）
import { useEffect, useRef, useState } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [subIdx, setSubIdx] = useState(-1)
  const closeTimer = useRef(null)

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('blur', close)
      window.addEventListener('keydown', onKey)
      window.addEventListener('scroll', close, true)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose])

  // 防抖：离开主菜单进入子菜单不关闭
  const openSub = (i) => {
    clearTimeout(closeTimer.current)
    setSubIdx(i)
  }
  const scheduleClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setSubIdx(-1), 160)
  }

  // 防止菜单超出视口
  const estHeight = items.length * 36 + 12
  const style = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - estHeight),
    left: Math.min(x, window.innerWidth - 210),
    zIndex: 600,
  }

  return (
    <div className="menu context-menu" style={style} ref={ref} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={`ctx-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            onMouseEnter={() => (item.submenu ? openSub(i) : setSubIdx(-1))}
            onMouseLeave={scheduleClose}
          >
            <button
              className="menu-item"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled || item.submenu) return
                item.action?.()
                onClose()
              }}
            >
              {item.icon ? item.icon : <span className="menu-item-spacer" />}
              <span>{item.label}</span>
              {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
              {item.submenu && <span className="menu-item-arrow"><IconChevron /></span>}
            </button>
            {item.submenu && subIdx === i && (
              <div className="menu ctx-submenu" onMouseEnter={() => openSub(i)} onMouseLeave={scheduleClose}>
                {item.submenu.length === 0 ? (
                  <div className="ctx-submenu-empty">暂无文件夹</div>
                ) : (
                  item.submenu.map((s, j) =>
                    s.sep ? (
                      <div key={j} className="menu-sep" />
                    ) : (
                      <button
                        key={j}
                        className={`menu-item${s.danger ? ' danger' : ''}`}
                        onClick={() => { s.action?.(); onClose() }}
                      >
                        {s.icon ? s.icon : <span className="menu-item-spacer" />}
                        <span>{s.label}</span>
                      </button>
                    ),
                  )
                )}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  )
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
