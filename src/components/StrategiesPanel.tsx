import { applyCenterChoice, STRATEGIES, type StrategyDef } from '../data/strategies'
import type { Borders, ChartData } from '../types'
import { CompactCopyText } from './CompactCopyText'

interface Props {
  activeId: string | null
  pool: ChartData[]
  borders: Borders
  onSelect: (id: string | null) => void
  /** chosen layout variant per strategy id (missing = default) */
  layoutChoice?: Record<string, string>
  onLayoutChoice?: (strategyId: string, layoutId: string) => void
  /** chosen centre-piece family per strategy id (missing = best available) */
  centerChoice?: Record<string, string>
  onCenterChoice?: (strategyId: string, choiceId: string) => void
}

/** per-requirement tally of what the library can supply (shared with the
 *  jackpot banners so they can never contradict the strategy card) */
export function pieceStatus(s: StrategyDef, pool: ChartData[]) {
  return (s.requirements ?? []).map((req) => {
    const have = pool.filter((c) => !c.pendingDeletion && (c.areaType !== 'kisharas-rest' || s.id === 'kishara-boss-rush')).filter(
      (c) =>
        (req.modIds && c.modIds.some((id) => req.modIds!.includes(id))) ||
        (req.areaTypes && c.areaType && req.areaTypes.includes(c.areaType)),
    ).length
    return { ...req, have, missing: Math.max(0, req.count - have) }
  })
}

function Readiness({
  strategy,
  pool,
  borders,
}: {
  strategy: StrategyDef
  pool: ChartData[]
  borders: Borders
}) {
  const reqs = pieceStatus(strategy, pool)
  const borderMissing =
    strategy.requiresBorderId && !borders.includes(strategy.requiresBorderId.id)
  if (reqs.length === 0 && !strategy.requiresBorderId) return null
  const missing = reqs.filter((r) => r.missing > 0)
  if (missing.length > 0 || borderMissing) {
    const parts = [
      ...missing.map((m) => `${m.missing}× ${m.label}`),
      ...(borderMissing ? [strategy.requiresBorderId!.label] : []),
    ]
    return (
      <div className="strat-notready">
        ⚠ 材料不足，建议等待。缺少：{parts.join('、')}。
        {strategy.waitHint ? ` ${strategy.waitHint}` : ''}
      </div>
    )
  }
  return (
    <div className="strat-ready">
      ✓ 材料齐备：{' '}
      {reqs
        .map(
          (r) =>
            `${Math.min(r.have, r.count)}/${r.count}× ${r.label}${
              r.have > r.count ? `（另有 ${r.have - r.count} 张备用）` : ''
            }`,
        )
        .join(', ')}
      <p className="muted small-note">仍需检查九格摆盘与连接，不保证收益。</p>
    </div>
  )
}

/** Concentrated sidebar choices; only the selected strategy exposes its guidance. */
export function StrategiesPanel({
  activeId, pool, borders, onSelect, layoutChoice, onLayoutChoice, centerChoice, onCenterChoice,
}: Props) {
  const strategy = STRATEGIES.find((s) => s.id === activeId)
  const chosenLayout = strategy?.layouts?.find((v) => v.id === layoutChoice?.[strategy.id]) ?? strategy?.layouts?.[0]
  const chosenCenter = strategy?.centerOptions?.find((o) => o.id === centerChoice?.[strategy.id]) ?? strategy?.centerOptions?.[0]
  return <section className="strategies" aria-label="规划策略">
    <div className="strategy-options" role="group" aria-label="当前策略">
      {STRATEGIES.map((s) => <button key={s.id} aria-pressed={s.id === activeId} onClick={() => onSelect(s.id)}>{s.name}</button>)}
      <button aria-pressed={!strategy} onClick={() => onSelect(null)}>无策略（手动）</button>
    </div>
    {strategy ? <>
      <p className="strategy-summary"><strong>{strategy.name}：</strong>{strategy.tagline}</p>
      <div className="strategy-controls">
        {chosenLayout && <label>布局
          <select aria-label="策略布局" value={chosenLayout.id} onChange={(e) => onLayoutChoice?.(strategy.id, e.target.value)}>
            {strategy.layouts!.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>}
        {chosenCenter && <label>中心海图
          <select aria-label="中心海图" value={chosenCenter.id} onChange={(e) => onCenterChoice?.(strategy.id, e.target.value)}>
            {strategy.centerOptions!.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>}
      </div>
      {chosenLayout && <p className="strategy-layout-hint">{chosenLayout.hint}</p>}
      {chosenCenter && chosenCenter.id !== strategy.centerOptions![0].id && <p className="strategy-layout-hint">中心优先使用{chosenCenter.label.replace('仅', '')}海图，其他中心材料留在库存中</p>}
      <Readiness strategy={applyCenterChoice(strategy, centerChoice?.[strategy.id])} pool={pool} borders={borders} />
    </> : <p className="strategy-manual-note">自行选择奖励权重，并手动调整位置；求解设置位于摆盘下方。</p>}
  </section>
}

export function StrategyGuide({ strategy }: { strategy: StrategyDef | null }) {
  return <aside className="strategy-guide" aria-label="策略玩法说明">
    <div className="panel-title">{strategy ? `${strategy.name} · 玩法` : '手动规划'}</div>
    {strategy ? <>
      <ul className="strat-guide">{strategy.guide.map((line, i) => <li key={i}>{line}</li>)}</ul>
      {strategy.source.url ? <a className="strat-source" href={strategy.source.url} target="_blank" rel="noopener noreferrer">{strategy.source.label}</a> : <span className="strat-source">{strategy.source.label}</span>}
      {strategy.extraLinks?.map((link) => <a key={link.url} className="strat-source strat-extra-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
      {strategy.searchRegex && <CompactCopyText label={`${strategy.name}保留材料搜索`} text={strategy.searchRegex} />}
    </> : <p className="muted">先填写边界、设置奖励权重，再求解。点击库存海图与格子可手动放置；点击两个已有格子可交换。</p>}
  </aside>
}
