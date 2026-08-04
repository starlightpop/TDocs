// 通用右键上下文菜单
import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    // 延迟绑定，避免触发本次 contextmenu 事件立即关闭
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

  // 防止菜单超出视口
  const estHeight = items.length * 36 + 12
  const style = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - estHeight),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 600,
  }

  return (
    <div className="menu context-menu" style={style} ref={ref} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className={`menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.action?.()
              onClose()
            }}
          >
            {item.icon ? item.icon : <span className="menu-item-spacer" />}
            <span>{item.label}</span>
            {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}
