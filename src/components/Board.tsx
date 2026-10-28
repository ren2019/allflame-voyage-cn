import { BorderSelect } from './BorderSelect'
import { BorderAffinity } from './BorderAffinity'
import { RegionTargets, RegionTargetDetails } from './RegionTargets'
import { regionalTargetView, regionTargets, type RegionalCell, type RegionTargetMode } from '../logic/regionTargets'
import { regionActionOrder, type RegionAction, type RegionCondition } from '../logic/regionActionOrder'
import { evaluateBorderAffinity } from '../logic/borderAffinity'
import type { ScoreOptions } from '../logic/scoring'
import { useId, useState, type ReactNode } from 'react'
import { voyageModById } from '../data/mods'
import { rotateEdges } from '../logic/connectivity'
import { buildSingleChartSearch } from '../logic/regex'
import type { Board, Borders, ChartData, Placement } from '../types'
import { START_CELL, STAT_LABELS, STAT_SHORT } from '../types'
import { tooltipProps } from './Tooltip'
import { destinationLabel, chartShapeLabel, voyageModText, voyageModShort, SCOPE_LABELS } from '../data/localization'

interface Props {
  refilledCells?: number[]
  board: Board
  borders: Borders
  charts: Map<string, ChartData>
  perTile: number[]
  strategyId?: string | null
  scoreOptions?: ScoreOptions
  selectedCell: number | null
  highlightUid: string | null
  /** only flag connector mismatches as errors under the strict rule */
  strictMode: boolean
  placingChart: ChartData | null
  onCellClick: (i: number) => void
  onRemove: (i: number) => void
  onToggleDeletion: (uid: string) => void
  onMissing: (i: number) => void
  onRotate: (i: number) => void
  onBorderChange: (segment: number, id: string | null) => void
  onTogglePreserve: (uid: string) => void
  onFinishVoyage: () => void
  onCopySequence: () => void
  copyComplete?: boolean
  voyageMsg: string
  /** a copy/preserve step-through is active - hide the action buttons to avoid confusion */
  sequenceActive?: boolean
  /** the solve control, rendered front-and-centre above "Copy into game" */
  solveSlot?: ReactNode
}

type EdgeStatus = 'none' | 'connected' | 'open' | 'mismatch'

function Tile({
  placement,
  chart,
  score,
  selected,
  highlighted,
  refilled,
  placing,
  isStart,
  edgeStatus,
  onClick,
  onRemove,
  onRotate,
  onTogglePreserve,
  onToggleDeletion,
  onMissing,
  region,
  cellIndex,
  onTargetDetails,
  actions,
  conditions,
}: {
  placement: Placement | null
  chart: ChartData | null
  score: number
  selected: boolean
  highlighted: boolean
  refilled?: boolean
  placing: boolean
  isStart: boolean
  region?: RegionalCell
  actions: RegionAction[]
  conditions: RegionCondition[]
  cellIndex: number
  onTargetDetails: () => void
  edgeStatus: EdgeStatus[]
  onClick: () => void
  onToggleDeletion: () => void
  onMissing: () => void
  onRemove: () => void
  onRotate: () => void
  onTogglePreserve: () => void
}) {
  const [copied, setCopied] = useState(false)
  const startBadge = isStart ? (
    <span className="tile-start" title="航程从此处开始">
      ⚓ 起点
    </span>
  ) : null
  if (!placement || !chart) {
    return (
      <div className={`tile empty ${placing ? 'placing' : ''}`} onClick={onClick}>
        {startBadge}
        {placing ? '放在此处' : ''}
      </div>
    )
  }
  const edges = rotateEdges(chart.edges, placement.rotation)
  const mods = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
  const tt = tooltipProps({
    title: chart.name,
    lines: [
      ...(chart.areaType && !['abyssal-plain', 'seafloor-ridges', 'undersea-groves'].includes(chart.areaType) ? [{ text: `目的地：${destinationLabel(chart.areaType)}`, cls: 'destination-orange' }] : []),
      { text: `区域等级：${chart.level}${chart.shape ? ` · ${chartShapeLabel(chart.shape)}` : ''}`, cls: 'muted' },
      ...(chart.rewards ?? []).map((e) => ({
        text: `+${e.percent}% ${STAT_LABELS[e.stat]}`,
        cls: 'scope-self',
      })),
      ...mods.map((m) => ({
        text: `${voyageModText(m!.id)}（${SCOPE_LABELS[m!.scope]}）`,
        cls: `scope-${m!.scope}`,
      })),
    ],
  })
  // show the implicit (adjacent/voyage) on the tile - it's the strategic mod
  const primary = mods.find((m) => m!.scope !== 'self') ?? mods[0]
  return (
    <div
      className={`tile ${region || actions.length || conditions.length ? 'with-region-targets' : ''} ${actions.length || conditions.length ? 'with-region-actions' : ''} ${actions.length > 1 ? 'with-multiple-region-actions' : ''} ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''} ${chart.preserved ? 'preserved' : ''} ${primary ? `tscope-${primary.scope}` : ''}`}
      onClick={onClick}
      {...tt}
    >
      {(['n', 'e', 's', 'w'] as const).map((d, i) =>
        edges[i] ? <span key={d} className={`path-bar ${d} ${edgeStatus[i]}`} /> : null,
      )}
      {primary &&
        (primary.short ? (
          <div className="tile-duo">
            <span className="tile-duo-col">
              <span className={`tile-duo-pct scope-${primary.scope}`}>{voyageModShort(primary.id)}</span>
              <span className="tile-duo-label">
                {primary.scope === 'self'
                  ? '本区域'
                  : primary.scope === 'adjacent'
                    ? '相邻区域'
                    : '全航程'}
              </span>
            </span>
          </div>
        ) : primary.effects[0] ? (
          <div className="tile-duo">
            <span className="tile-duo-col">
              <span className={`tile-duo-pct scope-${primary.scope}`}>
                +{primary.effects[0].percent}% {STAT_SHORT[primary.effects[0].stat]}
              </span>
              <span className="tile-duo-label">
                {primary.scope === 'self'
                  ? '本区域'
                  : primary.scope === 'adjacent'
                    ? '相邻区域'
                    : '全航程'}
              </span>
            </span>
          </div>
        ) : (
          <div className={`tile-duo-text scope-${primary.scope}`}>{voyageModText(primary.id)}</div>
        ))}
      {!primary && chart.implicitText && (
        <div className="tile-duo-text scope-global">{chart.implicitText}</div>
      )}
      {chart.preserved && (
        <span className="tile-preserved-badge" title="已锁定：完成航程后确认是否保留">
          🔒 保留
        </span>
      )}
      {refilled && <span className="refilled-badge">已补位 · 请核对实物</span>}
      {chart.pendingDeletion && <span className="pending-badge">待删除 · 不可执行</span>}
      <div className="tile-actions">
        <button
          className={chart.preserved ? 'active' : ''}
          title={chart.preserved ? '已锁定：取消后允许消耗' : '锁定海图：完成航程时确认是否保留'}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePreserve()
          }}
        >
          {chart.preserved ? '🔒' : '🔓'}
        </button>
        <button title={chart.pendingDeletion ? '取消待删除' : '标记待删除'} onClick={(e) => { e.stopPropagation(); onToggleDeletion() }}>{chart.pendingDeletion ? '取消标记' : '标记'}</button>
        <button title="找不到：标记待删除并移出摆盘" onClick={(e) => { e.stopPropagation(); onMissing() }}>找不到</button>
        <button
          title="复制游戏定位文本（名称与词缀），查找此海图"
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(buildSingleChartSearch(chart)).catch(() => {})
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? '✓' : '⧉'}
        </button>
        <button
          title="旋转"
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
        >
          ⟳
        </button>
        <button
          title="移除" aria-label="移出摆盘，保留库存"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ✕
        </button>
      </div>
      {(region || actions.length > 0 || conditions.length > 0) && (
        <div className="region-overlay">
          {(actions.length > 0 || conditions.length > 0) && (
            <div className="region-actions" role="group" aria-label={`区域 ${cellIndex + 1} 打法顺序`}>
              {actions.map(action => (
                <div className="region-action" role="note" key={action.order} aria-label={`打法行动 ${action.order}：${action.label}${action.condition ? `，${action.condition}` : ''}`}>
                  <span className="region-action-number" aria-hidden="true">{action.order}</span>
                  <span className="region-action-copy" aria-hidden="true"><b>{action.label}</b>{action.condition && <small>{action.condition}</small>}</span>
                </div>
              ))}
              {conditions.map(condition => (
                <div className="region-action region-action-condition" key={condition.cell}>
                  <span className="region-action-copy"><b>{condition.label}</b><small>{condition.condition}</small></span>
                </div>
              ))}
            </div>
          )}
          {region && <RegionTargets cell={region} index={cellIndex} onDetails={onTargetDetails} />}
        </div>
      )}
      {startBadge}
      <span className="tile-lvl">区域 {chart.level}</span>
      <div className="tile-score"><span className="tile-score-label">评分 </span>{score.toFixed(1)}</div>
    </div>
  )
}

const DIRS = [
  { dr: -1, dc: 0, opp: 2 }, // N
  { dr: 0, dc: 1, opp: 3 }, // E
  { dr: 1, dc: 0, opp: 0 }, // S
  { dr: 0, dc: -1, opp: 1 }, // W
]

export function BoardView(props: Props) {
  const { board, borders, charts } = props
  const [showActionOrder, setShowActionOrder] = useState(true)
  const [targetMode, setTargetMode] = useState<RegionTargetMode>('off')
  const targetModeName = useId()
  const [detailCell, setDetailCell] = useState<number | null>(null)
  const targets = regionTargets(board, borders, charts, props.strategyId ?? null, props.scoreOptions)
  const actionOrder = regionActionOrder(board, charts, props.strategyId ?? null, targets)
  const targetViews = targets.map(cell => regionalTargetView(cell, targetMode === 'valuable' ? 'valuable' : 'all'))
  const affinity = evaluateBorderAffinity(props.strategyId ?? null, borders)

  const edgesAt = (i: number) => {
    const p = board[i]
    if (!p) return null
    const c = charts.get(p.chartUid)
    return c ? rotateEdges(c.edges, p.rotation) : null
  }

  const edgeStatusFor = (i: number): EdgeStatus[] => {
    const e = edgesAt(i)
    if (!e) return ['none', 'none', 'none', 'none']
    const r = Math.floor(i / 3)
    const c = i % 3
    return DIRS.map((d, k) => {
      if (!e[k]) return 'none' as EdgeStatus
      const nr = r + d.dr
      const nc = c + d.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return 'open' as EdgeStatus
      const ne = edgesAt(nr * 3 + nc)
      if (!ne) return 'open' as EdgeStatus
      if (ne[d.opp]) return 'connected' as EdgeStatus
      return (props.strictMode ? 'mismatch' : 'open') as EdgeStatus
    })
  }

  const tile = (i: number) => {
    const p = board[i]
    return (
      <Tile
        key={i}
        cellIndex={i}
        region={targetMode === 'off' || (targetMode === 'valuable' && targetViews[i].groups.length === 0) ? undefined : targetViews[i]}
        actions={showActionOrder ? actionOrder.actions.filter(action => action.cell === i) : []}
        conditions={showActionOrder ? actionOrder.conditions.filter(condition => condition.cell === i) : []}
        onTargetDetails={() => setDetailCell(i)}
        placement={p}
        chart={p ? charts.get(p.chartUid) ?? null : null}
        score={props.perTile[i]}
        selected={props.selectedCell === i}
        refilled={props.refilledCells?.includes(i)}
        highlighted={!!p && p.chartUid === props.highlightUid}
        placing={!!props.placingChart && !p}
        isStart={i === START_CELL}
        edgeStatus={edgeStatusFor(i)}
        onClick={() => props.onCellClick(i)}
        onToggleDeletion={() => p && props.onToggleDeletion(p.chartUid)}
        onMissing={() => props.onMissing(i)}
        onRemove={() => props.onRemove(i)}
        onRotate={() => props.onRotate(i)}
        onTogglePreserve={() => p && props.onTogglePreserve(p.chartUid)}
      />
    )
  }
  const border = (seg: number, vertical?: boolean) => (
    <BorderSelect
      key={`b${seg}`}
      value={borders[seg]}
      seg={seg}
      vertical={vertical}
      affinityWeight={affinity.contributions[seg].weight}
      onChange={(id) => props.onBorderChange(seg, id)}
    />
  )

  const clearBorders = () => {
    for (let seg = 0; seg < 12; seg++) props.onBorderChange(seg, null)
  }

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <span className="board-title">航程摆盘</span>
        <span className="spacer" />
        <label className="region-action-toggle">
          <input type="checkbox" checked={showActionOrder} onChange={event => setShowActionOrder(event.target.checked)} />
          打法顺序
        </label>
        <div className="region-target-control" role="radiogroup" aria-label="区域目标">
          <span className="region-target-control-label" aria-hidden="true">区域目标</span>
          {([['off', '关闭'], ['valuable', '高价值'], ['all', '全部']] as const).map(([mode, label]) => (
            <label key={mode} className={`region-target-choice${targetMode === mode ? ' active' : ''}`}>
              <input type="radio" name={targetModeName} value={mode} checked={targetMode === mode} onChange={() => setTargetMode(mode)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      {showActionOrder && actionOrder.note && <p className="region-action-note">{actionOrder.note}</p>}
      <BorderAffinity strategyId={props.strategyId ?? null} borders={borders}>
        <button onClick={clearBorders}>清空边界</button>
      </BorderAffinity>
      {detailCell !== null && <RegionTargetDetails cell={targets[detailCell]} index={detailCell} onClose={() => setDetailCell(null)} />}
      <div className="board-grid">
        <div className="corner" />
        {border(0)}
        {border(1)}
        {border(2)}
        <div className="corner" />

        {border(9, true)}
        {tile(0)}
        {tile(1)}
        {tile(2)}
        {border(3, true)}

        {border(10, true)}
        {tile(3)}
        {tile(4)}
        {tile(5)}
        {border(4, true)}

        {border(11, true)}
        {tile(6)}
        {tile(7)}
        {tile(8)}
        {border(5, true)}

        <div className="corner" />
        {border(6)}
        {border(7)}
        {border(8)}
        <div className="corner" />
      </div>
      <div className="board-hint">
        先点击库存海图再点击格子放置；点击两个已放置格子可交换。
      </div>
      <div className="legend">
        <span className="legend-item scope-self">■ 本区域</span>
        <span className="legend-item scope-adjacent">■ 相邻区域</span>
        <span className="legend-item scope-global">■ 全航程</span>
      </div>
      {!props.sequenceActive && props.solveSlot}
      {!props.sequenceActive && (
        <div className="voyage-finish">
          {props.copyComplete && <p className="copy-complete-note">全部复制成功。实际航程结束后点击「完成航程」核销。</p>}
          <button
            className="copy-into-game"
            disabled={board.every((p) => !p)}
            onClick={props.onCopySequence}
            title="按游戏放置顺序从左下开始逐格复制定位文本，再按对应顺序 Ctrl+左键点击海图。"
          >
            📋 复制到游戏
          </button>
          <button
            className={`finish-voyage ${props.copyComplete ? 'copy-complete-primary' : ''}`}
            disabled={board.every((p) => !p)}
            onClick={props.onFinishVoyage}
            title="核销本盘实际消耗的海图，并逐张确认锁定海图（🔒）是否存活；随后清空摆盘，开始下一航程。"
          >
            🌊 完成航程
          </button>
          {props.voyageMsg && <span className="voyage-msg">{props.voyageMsg}</span>}
        </div>
      )}
    </div>
  )
}
