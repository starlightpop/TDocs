import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './theme.css'
import './app.css'
import './design-system.css'

// 错误边界：任何未捕获错误不再白屏，提供一键恢复
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2>页面出错了</h2>
          <p style={{ color: '#888' }}>{String(this.state.error)}</p>
          <button onClick={() => this.setState({ error: null })}>重试</button>
          <button style={{ marginLeft: 8 }} onClick={() => location.reload()}>刷新页面</button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// 悬停提示上下自适应：靠近顶部时改为在下方显示，避免被遮挡
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-tip]')
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.top < 48) el.classList.add('tip-bottom')
  else el.classList.remove('tip-bottom')
})
