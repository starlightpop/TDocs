import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import AiPanel from './AiPanel.jsx'

const TABS = [
  ['general', '常规', 'doc'],
  ['appearance', '外观', 'highlight'],
  ['ai', 'AI 模型', 'sparkle'],
]

export default function SettingsDialog({
  onClose, themePref, setThemePref, themes, themeGroups, theme,
  lightKey, darkKey, setLightKey, setDarkKey,
}) {
  const [tab, setTab] = useState('general')
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="settings-dialog-mask" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-dialog-head">
          <div><strong>设置</strong><span>应用、外观和 AI 配置</span></div>
          <span className="settings-version" title="当前版本">v{__APP_VERSION__}</span>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15} /></button>
        </header>
        <div className="settings-dialog-body">
          <nav className="settings-nav">
            {TABS.map(([id, label, icon]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon name={icon} size={15} /><span>{label}</span></button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === 'general' && (
              <div className="settings-page">
                <h2>文档工作区</h2>
                <div className="workspace-settings-card">
                  <div className="workspace-kind-icon"><Icon name="doc" size={24} /></div>
                  <div><strong>本地优先的连续文档</strong><p>所有文件使用统一的连续画布。内容自动保存在本机，并支持大纲、查找替换、版本历史、代码块和多格式导出。</p></div>
                </div>
                <div className="settings-note">0.2.0-preview 已移除未达到发布标准的 Word/A4/B5 试验功能。</div>
              </div>
            )}
            {tab === 'appearance' && (
              <div className="settings-page">
                <h2>外观</h2>
                <div className="settings-field-group">
                  <label>明暗模式</label>
                  <div className="settings-seg settings-seg-wide">
                    <button className={themePref === 'light' ? 'active' : ''} onClick={() => setThemePref('light')}>浅色</button>
                    <button className={themePref === 'dark' ? 'active' : ''} onClick={() => setThemePref('dark')}>深色</button>
                    <button className={themePref === 'system' ? 'active' : ''} onClick={() => setThemePref('system')}>跟随系统</button>
                  </div>
                </div>
                {themeGroups.map(([groupName, keys]) => (
                  <div className="settings-field-group" key={groupName}>
                    <label>{groupName}</label>
                    <div className="settings-theme-grid">
                      {keys.map((key) => {
                        const item = themes[key]
                        const current = theme === 'dark' ? darkKey : lightKey
                        return (
                          <button key={key} className={`settings-theme-card${current === key ? ' active' : ''}`} onClick={() => {
                            if (item.mode === 'dark') { setDarkKey(key); setThemePref('dark') }
                            else { setLightKey(key); setThemePref('light') }
                          }}>
                            <span className="settings-theme-preview" style={{ background: item.colors['surface-2'], borderColor: item.accent }}><i style={{ background: item.accent }} /></span>
                            <span>{item.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'ai' && <div className="settings-page"><h2>AI 模型</h2><AiPanel embedded /></div>}
          </div>
        </div>
      </section>
    </div>
  )
}
