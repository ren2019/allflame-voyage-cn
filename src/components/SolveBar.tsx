import { bossPreservation } from '../logic/strategyConstraints'
import { borderModById } from '../data/mods'
import { borderTouches } from '../types'
import { useRef, useState } from 'react'
import { solve, type SolverResult, type SolverOptions } from '../logic/solver'
import type { AppState } from '../logic/storage'
import { applyCenterChoice, type StrategyDef } from '../data/strategies'
import { selectStrategySolvePool } from '../logic/solverPoolSelection'
import { createSolveResultContext, isExecutableResult, type SolveResultContext } from '../logic/executable'

interface Props {
  state: AppState
  /** curated strategy currently overriding weights, or null for manual */
  activeStrategy: StrategyDef | null
  results: SolverResult[]
  resultContext: SolveResultContext | null
  /** which result is currently loaded on the board, or null */
  appliedIdx: number | null
  onResults: (r: SolverResult[], context: SolveResultContext | null) => void
  onApply: (r: SolverResult, idx: number) => void
  /** open the multi-voyage session planner */
  onOpenPlanner: () => void
  /** open the Solver Settings popup */
  onOpenSettings: () => void
}

/** The solve control remains below the board, before copy and completion. */
export function SolveBar({ state, activeStrategy, results, resultContext, appliedIdx, onResults, onApply, onOpenPlanner, onOpenSettings }: Props) {
  const [busy, setBusy] = useState(false)
  const [solveNote, setSolveNote] = useState('')
  const latest = useRef(state)
  latest.current = state
  const weights = activeStrategy ? activeStrategy.weights : state.weights

  const run = (refill = false) => {
    setBusy(true)
    setSolveNote('')
    // let the UI paint the busy state before the (synchronous) solve
    window.setTimeout(() => {
      try {
        if (latest.current !== state) return
        // locked charts sitting on the board are pinned to their exact cell -
        // the solver arranges everything else around them (issue #9)
        const locked = state.board.map((placement) => {
          if (!placement) return null
          const chart = state.pool.find((c) => c.uid === placement.chartUid)
          return refill || chart?.preserved ? { ...placement } : null
        })
        const lockedUids = new Set(locked.filter(Boolean).map((p) => p!.chartUid))
        // the user's centre-piece pick reshapes rules + readiness (issue #49)
        const effectiveStrategy = activeStrategy
          ? applyCenterChoice(activeStrategy, state.centerChoice[activeStrategy.id])
          : null
        const { solvePool, heldBack, heldBackFor } = selectStrategySolvePool(
          state.pool,
          effectiveStrategy,
          state.strategyReservations,
          refill ? new Set<string>() : lockedUids,
          state.pieceKeeps,
        )
        if (locked.some((p) => p && !solvePool.some((c) => c.uid === p.chartUid))) {
          onResults([], null)
          setSolveNote('锁定海图受到策略保护或不可用；请更换策略或手动调整锁定，不会自动移走海图。')
          return
        }
        // a strategy with selectable layouts uses the user's pick (or its first)
        const layoutVariant =
          effectiveStrategy?.layouts?.find(
            (v) => v.id === state.layoutChoice[effectiveStrategy.id],
          ) ?? effectiveStrategy?.layouts?.[0]
        const options: SolverOptions = {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: new Set(state.disabledMods),
          topK: 5,
          bossSafety: effectiveStrategy?.id === 'kishara-boss-rush',
          destinationCounts: effectiveStrategy?.destinationCounts,
          strategyRules: effectiveStrategy?.rules,
          strategyLayout: layoutVariant?.layout ?? effectiveStrategy?.layout,
          strategyLayoutPenalty: effectiveStrategy?.layoutPenalty,
          locked,
        }
        const res = solve(solvePool, state.borders, weights, options)
        if (effectiveStrategy?.id === 'kishara-boss-rush') {
          // Try the preferred start explicitly, so a large reward cannot
          // displace an available legal start placement.
          const start = solve(solvePool, state.borders, weights, { ...options, bossCells: [6] }).filter((r) => r.valid && r.board.every(Boolean))
          if (start.length) res.splice(0, res.length, ...start)
          const keepCells = [...new Set(state.borders.flatMap((id, i) => id && borderModById.get(id)?.effects.some((e) => e.stat === 'preserve' && e.percent > 0) ? [borderTouches(i)] : []))]
          if (keepCells.length && !res.some((r) => r.valid && bossPreservation(r.board, state.borders, new Map(solvePool.map((c) => [c.uid, c]))).length)) {
            const alternatives = solve(solvePool, state.borders, weights, { ...options, bossCells: keepCells }).filter((r) => r.valid && r.board.every(Boolean))
            if (alternatives[0]) res.push(alternatives[0])
          }
        }
        const context = createSolveResultContext(state, solvePool, locked, refill ? 'refill' : 'strategy')
        const candidates = refill ? res.filter((r) => isExecutableResult(r, state, context)) : res
        onResults(candidates, context)
        // loading the best result right away saves the extra click - the
        // alternatives stay one click away in the strip below
        if (candidates.length > 0) onApply(candidates[0], 0)
        const notes: string[] = []
        if (effectiveStrategy?.id === 'kishara-boss-rush') {
          const map = new Map(solvePool.map((c) => [c.uid, c]))
          if (res[0]?.board[6] && map.get(res[0].board[6].chartUid)?.areaType !== 'kisharas-rest') notes.push('本次未找到合法左下摆法，Boss 已改用其他合法位置。')
          if (!res.some((r) => r.valid && bossPreservation(r.board, state.borders, map).length)) notes.push('未提供保图备选：没有可用边界，或本次搜索未找到满足连接、锁定及转金币约束的保图摆盘。')
        }
        const lockedCount = locked.filter(Boolean).length
        if (lockedCount > 0)
          notes.push(`已固定 ${lockedCount} 张锁定海图的位置和朝向。`)
        if (heldBack > 0)
          notes.push(
            `为 ${heldBackFor.join('、')} 保留了 ${heldBack} 张海图。可在库存的 🔖 保留向导中调整数量。`,
          )
        if (solvePool.length < 9)
          notes.push(`仅有 ${solvePool.length} 张可用海图，无法填满九格。`)
        else if (!res.length)
          notes.push('未找到满足必带目的地数量、锁定及连接约束的摆盘；请核对材料与锁定。')
        else if (res.length && !isExecutableResult(res[0], state, context))
          notes.push('这些海图无法组成可执行摆盘，当前显示最佳参考方案。')
        if (refill) notes.push(candidates.length ? `已补齐 ${state.board.filter((p) => !p).length} 个空位，其余格不变；请核对游戏实际摆放。` : '本次未找到合法补位，原盘及空位保持不变；请核对材料和固定格约束。')
        setSolveNote(notes.join(' '))
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <div className="solve-bar">
      <div className="solve-row">
        <button className="solve-big" onClick={() => run()} disabled={busy || state.pool.length === 0}>
          {busy ? (
            '正在求解…'
          ) : (
            <>
              求解
              <span className="solve-big-sub">
                从 {state.pool.length} 张海图中规划最佳摆盘
                {activeStrategy ? ` · ${activeStrategy.name}` : ''}
              </span>
            </>
          )}
        </button>
        <button
          className="solve-settings-btn"
          onClick={onOpenPlanner}
          title="将全部库存安排为连续多次航程"
        >
          📋<span className="solve-settings-label">连续规划</span>
        </button>
        <button
          className="solve-settings-btn"
          onClick={onOpenSettings}
          title="连接规则、奖励权重、海图保护、备用海图航程与优选海图搜索"
        >
          ⚙<span className="solve-settings-label">设置</span>
        </button>
      </div>
      <button className="refill-board" onClick={() => run(true)} disabled={busy || !state.board.some(Boolean) || state.board.every(Boolean)}>
        补齐空位（{state.board.filter((p) => !p).length}）
      </button>
      {!state.board.some(Boolean) && <div className="muted small-note">空盘请使用整盘求解。</div>}
      {solveNote && <div className="muted small-note solve-bar-note">{solveNote}</div>}
      {results.length > 0 && (
        <>
          <div className="solve-results">
            {results.map((r, i) => {
              const executable = isExecutableResult(r, state, resultContext)
              return (
              <button
                key={i}
                className={`solve-result ${appliedIdx === i ? 'applied' : ''} ${executable ? '' : 'invalid'}`}
                onClick={() => { if (isExecutableResult(r, state, resultContext)) onApply(r, i) }}
                title={
                  executable
                    ? '将此可执行方案载入摆盘'
                    : '不可执行：格子、库存或连接条件不满足，仅供参考'
                }
              >
                {activeStrategy?.id === 'kishara-boss-rush' && <span className="boss-candidate">
                  Boss 第 {r.board.findIndex((p) => p && state.pool.find((c) => c.uid === p.chartUid)?.areaType === 'kisharas-rest') + 1} 格 · {bossPreservation(r.board, state.borders, new Map(state.pool.map((c) => [c.uid, c]))).join('；') || '速刷方案（无保图边界）'}
                </span>}
                <span className="sr-rank">#{i + 1}</span>
                <span className="sr-pts">{r.reward.toFixed(1)}</span>
                <span className="sr-pts-label">分</span>
                {appliedIdx === i ? (
                  <span className={`sr-badge on-board ${executable ? 'ok' : 'bad'}`}>已载入 · {executable ? '可执行' : '不可执行'}</span>
                ) : executable ? (
                  <span className="sr-badge ok">✓ 可执行</span>
                ) : (
                  <span className="sr-badge bad">✗ 不可执行</span>
                )}
              </button>
              )
            })}
          </div>
          <div className="muted small-note solve-bar-note">
            按所选权重排序。点击候选载入摆盘，再使用下方“复制到游戏”。
          </div>
        </>
      )}
    </div>
  )
}
