import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icons.jsx'
import { getCodeLanguageLabel } from '../lib/codeLanguage.js'

const WIDTH = 480
const HEIGHT = 240
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export default function CodeTerminal({ run, onClose }) {
  const [position, setPosition] = useState({ top: 120, left: 120 })
  const dragRef = useRef(null)

  useEffect(() => {
    if (!run) return
    const anchor = run.anchor || { left: 160, right: 640, top: 120, bottom: 220 }
    const preferredTop = anchor.bottom + 10
    const top = preferredTop + HEIGHT <= window.innerHeight - 12
      ? preferredTop
      : Math.max(64, anchor.top - HEIGHT - 10) // 避开自绘标题栏（56px），否则落在拖动区域无法关闭/拖动
    const left = clamp(anchor.left, 12, Math.max(12, window.innerWidth - WIDTH - 12))
    setPosition({ top, left })
  }, [run?.id])

  useEffect(() => {
    if (!run) return undefined
    const onResize = () => setPosition((current) => ({
      top: clamp(current.top, 64, Math.max(64, window.innerHeight - 100)),
      left: clamp(current.left, 8, Math.max(8, window.innerWidth - WIDTH - 8)),
    }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [run])

  if (!run || typeof document === 'undefined') return null

  const beginDrag = (event) => {
    if (event.target.closest('button')) return
    event.preventDefault()
    dragRef.current = { x: event.clientX, y: event.clientY, ...position }
    const move = (nextEvent) => {
      const start = dragRef.current
      if (!start) return
      setPosition({
        left: clamp(start.left + nextEvent.clientX - start.x, 8, Math.max(8, window.innerWidth - WIDTH - 8)),
        top: clamp(start.top + nextEvent.clientY - start.y, 8, Math.max(8, window.innerHeight - 80)),
      })
    }
    const end = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
  }

  return createPortal(
    <div className="code-terminal code-terminal-portal" style={position}>
      <div className="code-terminal-head code-terminal-drag-handle" onMouseDown={beginDrag}>
        <span className="code-terminal-icon"><Icon name="codeBlock" size={13} /></span>
        <span className="code-terminal-title">{run.running ? '正在运行' : '运行结果'} · {getCodeLanguageLabel(run.language)}</span>
        {!run.running && <span className={`code-terminal-status${run.ok ? ' ok' : ' fail'}`}>{run.ok ? '成功' : run.timedOut ? '超时' : '失败'}</span>}
        <button className="icon-btn" title="关闭" onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      <div className="code-terminal-body">
        {run.running ? <pre className="term-running">正在启动本地运行环境…</pre> : (
          <>
            {run.stdout ? <pre className="term-out">{run.stdout}</pre> : null}
            {run.stderr ? <pre className="term-out err">{run.stderr}</pre> : null}
            {run.install && (
              <div className="runtime-install-help">
                <strong>{run.install.title}</strong>
                <span>{run.install.reason}</span>
                {run.install.command && <code>{run.install.command}</code>}
                <button className="btn" onClick={() => window.tdocs?.openExternal?.(run.install.url)}>打开官方下载页面</button>
              </div>
            )}
            {!run.stdout && !run.stderr && run.ok ? <pre className="term-empty">程序运行完成，没有输出。</pre> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
