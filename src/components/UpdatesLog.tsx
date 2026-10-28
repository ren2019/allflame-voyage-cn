import { mainlandDisplayText } from '../data/textLibrary'
import { useId, useState } from 'react'
import { UPDATES, UPSTREAM_UPDATES } from '../data/updates'

interface Props {
  onClose: () => void
}

/** Default to this edition's releases, with the upstream history available separately. */
export function UpdatesLog({ onClose }: Props) {
  const [source, setSource] = useState<'local' | 'upstream'>('local')
  const titleId = useId()
  const updates = source === 'local' ? UPDATES : UPSTREAM_UPDATES
  return (
    <div className="onboard-backdrop" onClick={onClose}>
      <div className="onboard updates-log" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
        <div className="panel-title">
          <span id={titleId}>更新记录</span>
          <span className="spacer" />
          <button onClick={onClose} autoFocus>完成</button>
        </div>
        <div className="updates-sources" role="group" aria-label="更新来源">
          <button aria-pressed={source === 'local'} onClick={() => setSource('local')}>国服版更新</button>
          <button aria-pressed={source === 'upstream'} onClick={() => setSource('upstream')}>原版历史</button>
        </div>
        <p className="updates-intro">
          {source === 'local'
            ? '国服版新增与调整。2026-10-16 为首批功能汇总日期。'
            : '原版功能新增与调整的历史记录；早期脚本相关记录不代表国服适配。'}
        </p>
        <div className="updates-list" key={source}>
          {updates.map((u) => (
            <div key={`${u.date}-${u.title}`} className="update-row">
              <div className="update-head">
                <span className={`update-tag tag-${u.tag}`}>
                  {u.tag === 'new' ? '新增' : '调整'}
                </span>
                <span className="update-title">{u.title}</span>
                <span className="spacer" />
                <span className="update-date muted">{u.date}</span>
              </div>
              <div className="update-detail muted">{mainlandDisplayText(u.detail)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
