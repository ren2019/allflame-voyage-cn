import type { ImportHit } from '../logic/importDedupe'
import { CalibrationLink } from './CalibrationLink'
import { useEffect, useRef, useMemo, useState } from 'react'
import { chartShapeLabel, destinationLabel, voyageModShort, voyageModText } from '../data/localization'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import type { StrategyReservationPreferences } from '../data/strategies'
import { selectPieceBank, type PieceType } from '../logic/pieceKeeps'
import { voyageRewardKey } from '../logic/rewards'
import { newUid } from '../logic/parser'
import type { Board, ChartData, Edges, Weights } from '../types'
import { STAT_LABELS, STAT_SHORT } from '../types'
import { EdgeGlyph } from './icons'
import { tooltipProps } from './Tooltip'

interface Props {
  importFeedback?: { hits: ImportHit[] } | null
  onCloseFeedback?: () => void
  pool: ChartData[]
  board: Board
  weights: Weights
  disabledMods: Set<string>
  /** keeper protections - decide which charts show the 🔒 "saved for" badge */
  reservations: StrategyReservationPreferences
  /** per-piece-type keep counts (missing entries use the recommended default) */
  pieceKeeps: Record<string, number>
  selected: string | null
  onSelect: (uid: string) => void
  onAdd: (charts: ChartData[]) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
  onClearCharts: () => void
  onClearPending: () => void
  /** open the guided "save charts for strategies" wizard */
  onOpenSaveWizard?: () => void
}

/** which strategy this chart is banked for, per the keep counts */
function fuelLock(chart: ChartData, bank: Map<string, PieceType>): string | null {
  const piece = bank.get(chart.uid)
  return piece ? `为 ${piece.strategyName} 保留 · ${piece.label}` : null
}

const SCOPE_REACH = { self: 1, adjacent: 3, global: 9 } as const

/** heuristic worth of a chart under the current weights, for sorting */
function chartValue(chart: ChartData, weights: Weights, disabled: Set<string>): number {
  let v = 0
  for (const id of chart.modIds) {
    if (disabled.has(id)) continue
    const mod = voyageModById.get(id)
    if (!mod) continue
    const w = weights[voyageRewardKey(mod)] ?? 0
    for (const e of mod.effects) v += w * e.percent * SCOPE_REACH[mod.scope]
  }
  // header reward sub-stats are shown but not scored; a chart's worth is its implicit
  return v
}

type SortMode = 'value' | 'level' | 'name'
type ViewMode = 'grid' | 'list'

/** compact display value: weighted worth scaled to a friendly 0–99ish number */
export function displayValue(chart: ChartData, weights: Weights, disabled: Set<string>): number {
  return Math.round(chartValue(chart, weights, disabled) / 100)
}

const EDGE_LABELS = ['北', '东', '南', '西'] as const

function ChartEditor({ chart, onUpdate }: { chart: ChartData; onUpdate: (c: ChartData) => void }) {
  const toggleEdge = (i: number) => {
    const edges = [...chart.edges] as Edges
    edges[i] = !edges[i]
    onUpdate({ ...chart, edges })
  }
  return (
    <div className="chart-editor" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <input
          value={chart.name}
          onChange={(e) => onUpdate({ ...chart, name: e.target.value })}
          placeholder="海图名称"
        />
        <input
          type="number"
          className="lvl"
          value={chart.level}
          min={1}
          max={100}
          onChange={(e) => onUpdate({ ...chart, level: parseInt(e.target.value || '1', 10) })}
        />
      </div>
      {(() => {
        const isSelf = (id: string) => voyageModById.get(id)?.scope === 'self'
        const selfIds = chart.modIds.filter(isSelf)
        const implicitId = chart.modIds.find((id) => !isSelf(id)) ?? ''
        const commit = (s0: string, s1: string, imp: string) =>
          onUpdate({ ...chart, modIds: [s0, s1, imp].filter(Boolean) })
        const selfPool = VOYAGE_MODS.filter((m) => m.scope === 'self')
        return (
          <>
            {[0, 1].map((slot) => (
              <select
                key={slot}
                value={selfIds[slot] ?? ''}
                onChange={(e) => {
                  const next = [selfIds[0] ?? '', selfIds[1] ?? '']
                  next[slot] = e.target.value
                  commit(next[0], next[1], implicitId)
                }}
              >
                <option value="">本区域词缀 {slot + 1}：无</option>
                {selfPool.map((m) => (
                  <option key={m.id} value={m.id}>
                    {voyageModText(m.id)}
                  </option>
                ))}
              </select>
            ))}
            <select
              value={implicitId}
              onChange={(e) => commit(selfIds[0] ?? '', selfIds[1] ?? '', e.target.value)}
            >
              <option value="">航行词缀：无</option>
              <optgroup label="相邻区域">
                {VOYAGE_MODS.filter((m) => m.scope === 'adjacent').map((m) => (
                  <option key={m.id} value={m.id}>
                    {voyageModText(m.id)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="全航程">
                {VOYAGE_MODS.filter((m) => m.scope === 'global').map((m) => (
                  <option key={m.id} value={m.id}>
                    {voyageModText(m.id)}
                  </option>
                ))}
              </optgroup>
            </select>
          </>
        )
      })()}
      <div className="row edges-row">
        <span className="muted">连接方向：</span>
        {EDGE_LABELS.map((l, i) => (
          <button
            key={l}
            className={`edge-btn ${chart.edges[i] ? 'on' : ''}`}
            onClick={() => toggleEdge(i)}
          >
            {l}
          </button>
        ))}
      </div>
      {chart.rawText && (
        <div className="raw-text" title="导入时保留的显式属性原文">
          {chart.rawText}
        </div>
      )}
    </div>
  )
}

export function Library(props: Props) {
  const [reservationDetail, setReservationDetail] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('value')
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('library-view') as ViewMode) || 'grid',
  )
  const setViewPersist = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem('library-view', v)
    } catch {
      /* ignore */
    }
  }
  const onBoard = new Set(props.board.filter(Boolean).map((p) => p!.chartUid))
  const bank = useMemo(
    () => selectPieceBank(props.pool, props.pieceKeeps, props.reservations),
    [props.pool, props.pieceKeeps, props.reservations],
  )

  const addBlank = () => {
    const chart: ChartData = {
      uid: newUid(),
      name: `海图 ${props.pool.length + 1}`,
      level: 80,
      edges: [true, true, true, true],
      modIds: [],
    }
    props.onAdd([chart])
    setEditing(chart.uid)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = props.pool
    if (q) {
      list = list.filter((c) => {
        if (c.name.toLowerCase().includes(q) || destinationLabel(c.areaType).includes(q) || c.implicitText?.toLowerCase().includes(q)) return true
        return c.modIds.some((id) => voyageModText(id).toLowerCase().includes(q) || voyageModById.get(id)?.text.toLowerCase().includes(q))
      })
    }
    return [...list].sort((a, b) => {
      if (sort === 'level') return b.level - a.level
      if (sort === 'name') return a.name.localeCompare(b.name)
      return (
        chartValue(b, props.weights, props.disabledMods) -
        chartValue(a, props.weights, props.disabledMods)
      )
    })
  }, [props.pool, props.weights, props.disabledMods, query, sort])

  const root = useRef<HTMLDivElement>(null)
  const [navigation, setNavigation] = useState<string | null>(null)
  const visibleHits = [...new Set((props.importFeedback?.hits ?? []).map((h) => h.uid))]
    .filter((uid) => visible.some((c) => c.uid === uid))
  const hiddenHits = new Set((props.importFeedback?.hits ?? []).map((h) => h.uid)).size - visibleHits.length
  const feedbackMap = new Map(props.importFeedback?.hits.map((h) => [h.uid, h.kind]))
  const locate = (uid: string) => {
    const node = [...(root.current?.querySelectorAll<HTMLElement>('[data-chart-uid]') ?? [])].find((el) => el.dataset.chartUid === uid)
    if (!node || !visible.some((c) => c.uid === uid)) return
    const container = node.parentElement!
    const box = node.getBoundingClientRect(), viewport = container.getBoundingClientRect()
    if (box.top < viewport.top || box.bottom > viewport.bottom) container.scrollTop += box.top - viewport.top
    setNavigation(uid)
  }
  useEffect(() => {
    // Synchronous post-render positioning has no stale animation frame to
    // override a later import, filter change or deliberate user scroll.
    setNavigation(null)
    if (visibleHits[0]) locate(visibleHits[0])
    // Auto-location belongs only to the import event, never filter/view edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.importFeedback])

  return (
    <div className="library" ref={root}>
      <div className="panel-title">
        <span className="library-title">海图库存</span>{' '}
        <span className="muted">
          ({query ? `${visible.length}/` : ''}
          {props.pool.length})
        </span>
        <span className="spacer" />
        <button onClick={addBlank}>+ 添加海图</button>
        {props.pool.length > 0 && (
          <button
            className="clear-charts"
            onClick={props.onClearCharts}
            title="移除全部库存海图并清空摆盘，保留边界与权重"
          >
            清空库存
          </button>
        )}
      </div>
      {props.pool.length > 0 && (
        <div className="library-tools">
          <input
            placeholder="按名称或词缀筛选…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="value">优先高价值</option>
            <option value="level">优先高等级</option>
            <option value="name">名称</option>
          </select>
          <button
            title={view === 'grid' ? '列表视图（编辑海图）' : '网格视图'}
            aria-label={view === 'grid' ? '列表视图（编辑海图）' : '网格视图'}
            onClick={() => setViewPersist(view === 'grid' ? 'list' : 'grid')}
          >
            {view === 'grid' ? '☰' : '⊞'}
          </button>
        </div>
      )}
      {props.importFeedback && <div className="import-feedback" role="region" aria-label="本次导入定位">
        本次导入：可见 {visibleHits.length} 张，筛选隐藏 {hiddenHits} 张
        <span> {Math.max(0, visibleHits.indexOf(navigation ?? '') + 1)}/{visibleHits.length}</span>
        <button disabled={!visibleHits.length} onClick={() => locate(visibleHits[(visibleHits.indexOf(navigation ?? '') - 1 + visibleHits.length) % visibleHits.length])}>上一张</button>
        <button disabled={!visibleHits.length} onClick={() => locate(visibleHits[(visibleHits.indexOf(navigation ?? '') + 1) % visibleHits.length])}>下一张</button>
        <button onClick={props.onCloseFeedback}>关闭导入高亮</button>
      </div>}
      {props.pool.some((c) => c.pendingDeletion) && <div className="pending-summary">
        待删除 {props.pool.filter((c) => c.pendingDeletion).length} 张（已排除求解）
        <button onClick={props.onClearPending}>统一删除待删除海图</button>
      </div>}
      {props.pool.length > 0 && props.onOpenSaveWizard && (
        <div className="savefor-bar">
          <button
            onClick={props.onOpenSaveWizard}
            title="为策略保留海图，其他求解及填充不会使用它们"
          >
            🔖 为策略保留海图…
          </button>
        </div>
      )}
      {props.pool.length === 0 && (
        <div className="muted pad">
          库存暂无海图。可手动添加，或在下方粘贴游戏复制文本。
        </div>
      )}
      {view === 'grid' && (
        <div className="chart-grid">
          {visible.map((c) => {
            const mods = c.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
            // lead with the implicit (adjacent/voyage) - it's the strategic mod
            const mod = mods.find((m) => m!.scope !== 'self') ?? mods[0] ?? null
            const val = displayValue(c, props.weights, props.disabledMods)
            const lock = fuelLock(c, bank)
            const lines = [
              { text: `区域等级 ${c.level}${c.shape ? ` · ${chartShapeLabel(c.shape)}` : ''}`, cls: 'muted' },
              ...(c.areaType ? [{ text: `目的地：${destinationLabel(c.areaType)}`, cls: 'muted' }] : []),
              ...(c.rewards ?? []).map((e) => ({
                text: `${STAT_LABELS[e.stat]} +${e.percent}%`,
                cls: 'scope-self',
              })),
              ...mods.map((m) => ({ text: voyageModText(m!.id), cls: `scope-${m!.scope}` })),
              { text: `加权价值：${val}`, cls: 'val' },
              ...(lock
                ? [{ text: `🔒 ${lock} · 其他求解不会使用它`, cls: 'muted' }]
                : []),
              ...(onBoard.has(c.uid) ? [{ text: '已放入当前摆盘', cls: 'muted' }] : []),
            ]
            return (
              <div
                key={c.uid}
                data-chart-uid={c.uid}
                data-import-kind={feedbackMap.get(c.uid)}
                className={`chart-sq ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''} ${mod ? `sscope-${mod.scope}` : ''}`}
                onClick={() => props.onSelect(c.uid)}
                {...tooltipProps({ title: c.name, lines })}
              >
                {feedbackMap.has(c.uid) && <span className="import-hit-label">{feedbackMap.get(c.uid)}</span>}
                <span className="sq-head">
                  <span className="sq-shape"><EdgeGlyph edges={c.edges} size={15} /></span>
                  {lock && <button className="sq-lock" title={lock} aria-label={`查看策略预留：${lock}`}
                    onClick={event => { event.stopPropagation(); setReservationDetail(lock) }}>🔒</button>}
                  <span className="sq-val">{val}</span>
                </span>
                {mod?.short ? (
                  <span className={`sq-reward-text scope-${mod.scope}`}>
                    <span className="sq-shortname">{voyageModShort(mod.id)}</span>
                  </span>
                ) : mod?.effects[0] ? (
                  <span className={`sq-reward-text scope-${mod.scope}`}>
                    <span className="sq-pct">+{mod.effects[0].percent}%</span>
                    <span className="sq-statname">{STAT_SHORT[mod.effects[0].stat]}</span>
                  </span>
                ) : c.implicitText ? (
                  <span className="sq-reward-text scope-global">
                    <span className="sq-shortname sq-rawimplicit">{c.implicitText}</span>
                  </span>
                ) : (
                  <EdgeGlyph edges={c.edges} size={26} />
                )}
                <span className="sq-footer">
                  <button title={c.pendingDeletion ? '取消待删除' : '标记待删除'} onClick={(e) => {
                    e.stopPropagation(); props.onUpdate({ ...c, pendingDeletion: !c.pendingDeletion })
                  }}>{c.pendingDeletion ? '取消待删除' : '待删除'}</button>
                  <span className="sq-lvl" title={`区域等级 ${c.level}`}>{c.level}</span>
                  {mod && <CalibrationLink id={mod.id} />}
                  <button
                    className="sq-del"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onRemove(c.uid)
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {view === 'list' && (
      <div className="chart-list">
        {visible.map((c) => {
          const allMods = c.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
          const mod = allMods.find((m) => m!.scope !== 'self') ?? allMods[0] ?? null
          const lock = fuelLock(c, bank)
          return (
            <div
              key={c.uid}
              data-chart-uid={c.uid}
              data-import-kind={feedbackMap.get(c.uid)}
              className={`chart-card ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''}`}
              onClick={() => props.onSelect(c.uid)}
            >
              {feedbackMap.has(c.uid) && <span className="import-hit-label">{feedbackMap.get(c.uid)}</span>}
              <div className="chart-card-head">
                <EdgeGlyph edges={c.edges} />
                <span className="chart-name">{c.name}</span>
                <span className="chart-level">区域等级 {c.level}</span>
                {lock && (
                  <button className="badge lock" title={`${lock} · 其他求解不会使用它`}
                    aria-label={`查看策略预留：${lock}`}
                    onClick={event => { event.stopPropagation(); setReservationDetail(lock) }}>🔒 预留</button>
                )}
                {onBoard.has(c.uid) && <span className="badge">已摆入</span>}
                <button onClick={(e) => { e.stopPropagation(); props.onUpdate({ ...c, pendingDeletion: !c.pendingDeletion }) }}>
                  {c.pendingDeletion ? '取消待删除' : '标记待删除'}
                </button>
                <span className="spacer" />
                <button
                  title="编辑"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(editing === c.uid ? null : c.uid)
                  }}
                >
                  ✎
                </button>
                <button
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRemove(c.uid)
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="muted chart-location">{[destinationLabel(c.areaType), chartShapeLabel(c.shape)].filter(Boolean).join(' · ')}</div>
              {c.rewards && <div className="chart-rewards scope-self">{c.rewards.map((effect) => `${STAT_LABELS[effect.stat]} +${effect.percent}%`).join(' · ')}</div>}
              {mod && (
                <div
                  className={`chart-mod scope-${mod.scope}`}
                  {...tooltipProps({
                    title: c.name,
                    lines: [
                      { text: `区域等级 ${c.level}`, cls: 'muted' },
                      ...allMods.map((m) => ({ text: voyageModText(m!.id), cls: `scope-${m!.scope}` })),
                    ],
                  })}
                >
                  {allMods.map((m) => (
                    <div key={m!.id} className={`scope-${m!.scope}`}>
                      {voyageModText(m!.id)} <CalibrationLink id={m!.id} />
                    </div>
                  ))}
                </div>
              )}
              {editing === c.uid && <ChartEditor chart={c} onUpdate={props.onUpdate} />}
            </div>
          )
        })}
      </div>
      )}
      {reservationDetail && <div className="onboard-backdrop" onClick={() => setReservationDetail(null)}>
        <div className="onboard reservation-detail" role="dialog" aria-modal="true" aria-label="策略预留详情"
          onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setReservationDetail(null) }}>
          <div className="panel-title">策略预留详情<span className="spacer" /><button autoFocus onClick={() => setReservationDetail(null)}>关闭</button></div>
          <p>{reservationDetail}</p><p className="muted">该实例已为策略预留；无关策略不会将它用作普通海图。此标记不代表游戏内已锁定。</p>
        </div>
      </div>}
    </div>
  )
}
