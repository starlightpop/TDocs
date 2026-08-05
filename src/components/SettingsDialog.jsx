import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import AiPanel from './AiPanel.jsx'

const TABS = [
  ['general', '常规', 'doc'],
  ['appearance', '外观', 'highlight'],
  ['word', 'Word', 'page'],
  ['ai', 'AI 模型', 'sparkle'],
]

export default function SettingsDialog({
  onClose, themePref, setThemePref, themes, themeGroups, theme,
  lightKey, darkKey, setLightKey, setDarkKey,
  isWord, breakStyle, setBreakStyle, pageLabelStyle, setPageLabelStyle,
  pagePad, setPagePad,
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
          <div><strong>设置</strong><span>所有应用设置集中在这里</span></div>
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
                <h2>工作区</h2>
                <div className="workspace-settings-card">
                  <div className={`workspace-kind-icon${isWord ? ' word' : ''}`}><Icon name="doc" size={24} /></div>
                  <div><strong>当前文件：{isWord ? 'Word 文件' : '文档文件'}</strong><p>两类文件采用独立排版系统，不能在原文件中互相转换。需要迁移内容时，请复制文字并粘贴到另一类新文件。</p></div>
                </div>
                <div className="settings-note">文档文件使用连续画布；Word 文件使用固定纸张、页边距和分页。</div>
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
            {tab === 'word' && (
              <div className="settings-page">
                <h2>Word 排版</h2>
                {!isWord ? <div className="settings-empty-state">这些设置只作用于 Word 文件。当前打开的是文档文件。</div> : (
                  <>
                    <div className="settings-field-group"><label>分页样式</label><div className="settings-seg settings-seg-wide"><button className={breakStyle === 'dashed' ? 'active' : ''} onClick={() => setBreakStyle('dashed')}>连续页</button><button className={breakStyle === 'split' ? 'active' : ''} onClick={() => setBreakStyle('split')}>分离页</button></div></div>
                    <div className="settings-field-group"><label>页码标签</label><div className="settings-seg settings-seg-wide"><button className={pageLabelStyle === 'total' ? 'active' : ''} onClick={() => setPageLabelStyle('total')}>当前 / 总数</button><button className={pageLabelStyle === 'pair' ? 'active' : ''} onClick={() => setPageLabelStyle('pair')}>相邻页</button></div></div>
                    <div className="settings-field-group"><label>页边距</label><input className="settings-range" type="range" min="24" max="160" value={pagePad} onChange={(event) => setPagePad(Number(event.target.value))} /><span className="settings-range-value">{pagePad}px</span></div>
                  </>
                )}
              </div>
            )}
            {tab === 'ai' && <div className="settings-page"><h2>AI 模型</h2><AiPanel embedded /></div>}
          </div>
        </div>
      </section>
    </div>
  )
}
