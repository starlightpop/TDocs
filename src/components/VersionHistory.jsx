import { useEffect, useState } from 'react'
import { Icon } from './Icons.jsx'
import { formatTime } from '../lib/storage.js'
import { loadVersions, removeVersion, saveVersionSnapshot } from '../lib/versionHistory.js'

function previewHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) || '空白文档'
}

export default function VersionHistory({ doc, onRestore, onClose }) {
  const [versions, setVersions] = useState([])

  const refresh = () => setVersions(loadVersions(doc?.id))

  useEffect(() => {
    refresh()
  }, [doc?.id])

  const saveCurrent = () => {
    setVersions(saveVersionSnapshot(doc, { label: '手动保存', force: true }))
  }

  const remove = (versionId) => {
    setVersions(removeVersion(doc.id, versionId))
  }

  return (
    <aside className="version-history" aria-label="版本历史">
      <div className="panel-head">
        <div>
          <strong>版本历史</strong>
          <span>保留最近 20 个本地版本</span>
        </div>
        <button className="icon-btn" data-tip="关闭" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="version-actions">
        <button className="btn btn-primary" onClick={saveCurrent}>保存当前版本</button>
      </div>
      <div className="version-list">
        {versions.length === 0 && (
          <div className="panel-empty">尚无历史版本。编辑过程中会定期生成自动版本。</div>
        )}
        {versions.map((version) => (
          <article className="version-item" key={version.id}>
            <div className="version-meta">
              <strong>{version.label}</strong>
              <time>{formatTime(version.createdAt)}</time>
            </div>
            <div className="version-title">{version.title}</div>
            <p>{previewHtml(version.content)}</p>
            <div className="version-item-actions">
              <button className="btn" onClick={() => onRestore(version)}>恢复此版本</button>
              <button className="btn version-delete" onClick={() => remove(version.id)}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}
