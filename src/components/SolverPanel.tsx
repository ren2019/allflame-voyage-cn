import { useMemo, useState } from 'react'
import { buildBestModRegex } from '../logic/regex'
import { solve, type SolverResult } from '../logic/solver'
import type { AppState } from '../logic/storage'
import type { AdjacencyMode } from '../logic/scoring'
import type { ConnectivityMode } from '../types'
import { STRATEGY_RESERVATION_OPTIONS } from '../data/strategies'
import { selectPieceBank } from '../logic/pieceKeeps'
import type { StrategyDef } from '../data/strategies'
import { GROUP_LABEL, GROUP_ORDER, REWARD_TYPES } from '../logic/rewards'
import { displayValue } from './Library'
import { createSolveResultContext, isExecutableResult, type SolveResultContext } from '../logic/executable'

/** how many of your best charts to hold back from a filler voyage (one full board) */
const KEEP_BEST = 9

interface Props {
  state: AppState
  /** curated strategy currently overriding weights, or null for manual */
  activeStrategy: StrategyDef | null
  onPatch: (p: Partial<AppState>) => void
  onResults: (r: SolverResult[], context: SolveResultContext | null) => void
  /** rendered inside the settings popup - shows a Done button that calls this */
  onClose?: () => void
}

export function SolverPanel({ state, activeStrategy, onPatch, onResults, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [regexCap, setRegexCap] = useState(50)
  const [copied, setCopied] = useState(false)
  const [solveNote, setSolveNote] = useState('')
  // while a strategy is active it overrides the manual weights everywhere here
  const weights = activeStrategy ? activeStrategy.weights : state.weights
  // the keep-count bank applies in every mode; each toggle switches its
  // strategies' banks off wholesale (the wizard's counts stay saved)
  const availableReservations = STRATEGY_RESERVATION_OPTIONS
  const bestRegex = useMemo(
    () => buildBestModRegex(weights, regexCap, new Set(state.disabledMods), 'zh-CN'),
    [weights, regexCap, state.disabledMods],
  )

  const copyRegex = async () => {
    try {
      await navigator.clipboard.writeText(bestRegex.regex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* user can select the text manually */
    }
  }

  // build a throwaway "filler" voyage from your lowest-value spare charts, holding
  // back your best KEEP_BEST charts and anything you've locked (🔒) so they survive
  const runFiller = () => {
    setBusy(true)
    setSolveNote('')
    window.setTimeout(() => {
      try {
        const disabled = new Set(state.disabledMods)
        const keep = new Set<string>()
        state.pool.forEach((c) => c.preserved && keep.add(c.uid))
        // banked keeper charts (per the keep counts) are never filler
        const bank = selectPieceBank(state.pool, state.pieceKeeps, state.strategyReservations)
        state.pool.forEach((c) => bank.has(c.uid) && keep.add(c.uid))
        ;[...state.pool]
          .sort((a, b) => displayValue(b, weights, disabled) - displayValue(a, weights, disabled))
          .slice(0, KEEP_BEST)
          .forEach((c) => keep.add(c.uid))
        // locked board charts stay pinned even in a filler board (issue #9) -
        // they're preserved, so running the voyage doesn't consume them
        const locked = state.board.map((placement) => {
          if (!placement) return null
          const chart = state.pool.find((c) => c.uid === placement.chartUid)
          return chart?.preserved ? { ...placement } : null
        })
        const lockedUids = new Set(locked.filter(Boolean).map((p) => p!.chartUid))
        const fillerPool = state.pool.filter((c) => !c.pendingDeletion && c.areaType !== 'kisharas-rest' && (lockedUids.has(c.uid) || !keep.has(c.uid)))
        if (locked.some((p) => p && !fillerPool.some((c) => c.uid === p.chartUid))) {
          onResults([], null)
          setSolveNote('锁定的琪莎拉海图受保护，不能用于备用航程；请手动调整锁定。')
          return
        }
        if (fillerPool.length < 9) {
          onResults([], null)
          setSolveNote(
            `仅有 ${fillerPool.length} 张备用海图；需要在最佳 ${KEEP_BEST} 张和锁定海图之外另有九张，才能组成备用航程。`,
          )
          return
        }
        const res = solve(fillerPool, state.borders, weights, {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: disabled,
          topK: 5,
          minimizeReward: true,
          locked,
        })
        const context = createSolveResultContext(state, fillerPool, locked, 'filler')
        onResults(res, context)
        setSolveNote(
          res[0] && isExecutableResult(res[0], state, context)
            ? '已用低价值备用海图组成可执行航程，保留优质和锁定海图。结果显示在摆盘下方。'
            : '现有备用海图无法组成可执行航程。',
        )
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <div className="solver">
      <div className="panel-title">
        求解设置
        {onClose && (
          <>
            <span className="spacer" />
            <button onClick={onClose}>完成</button>
          </>
        )}
      </div>

      <div className="field">
        <label>连接规则</label>
        <select
          value={state.mode}
          onChange={(e) => onPatch({ mode: e.target.value as ConnectivityMode })}
        >
          <option value="strict">连接必须对齐（实际规则）</option>
          <option value="any">忽略连接（实验）</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.allowRotation}
          onChange={(e) => onPatch({ allowRotation: e.target.checked })}
        />
        允许旋转海图
      </label>

      <div className="field">
        <label>相邻词缀作用范围</label>
        <select
          value={state.adjacencyMode}
          onChange={(e) => onPatch({ adjacencyMode: e.target.value as AdjacencyMode })}
        >
          <option value="physical">所有相邻区域</option>
          <option value="connected">仅连接的相邻区域</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.adjacentAffectsSelf}
          onChange={(e) => onPatch({ adjacentAffectsSelf: e.target.checked })}
        />
        相邻词缀也作用于自身区域
      </label>

      {activeStrategy && (
        <div className="strat-override-note">
          ⚑ <strong>{activeStrategy.name}</strong> 正在控制求解，启用期间不使用下方手动权重。
        </div>
      )}

      {availableReservations.length > 0 && (
        <fieldset className="strategy-reservations">
          <legend>为其他策略保护海图</legend>
          {availableReservations.map((option) => (
            <label className="check" key={option.id}>
              <input
                type="checkbox"
                name="strategy-reservation"
                value={option.id}
                checked={state.strategyReservations[option.id]}
                onChange={(event) =>
                  onPatch({
                    strategyReservations: {
                      ...state.strategyReservations,
                      [option.id]: event.target.checked,
                    },
                  })
                }
              />
              {option.label}
            </label>
          ))}
          <div className="muted small-note">
            开启后，相应策略已保留的海图不进入其他策略的求解库存；数量可在库存的 🔖 向导中设置。策略仍可使用自身所需的保留材料。
          </div>
        </fieldset>
      )}

      {/* keyed remount: weights open themselves in manual mode (they ARE the
          mode), stay collapsed while a strategy overrides them */}
      <details
        key={activeStrategy ? 'overridden' : 'manual'}
        className="weights-panel"
        open={!activeStrategy}
      >
        <summary className="panel-title small weights-summary">
          奖励权重{activeStrategy ? '（由策略覆盖）' : ''}
        </summary>
        <div className="muted small-note" style={{ marginTop: 0 }}>
          按个人偏好调整，每种奖励独立计权。
        </div>
        <div className={`weights ${activeStrategy ? 'weights-overridden' : ''}`}>
          {GROUP_ORDER.map((group) => {
          const rows = REWARD_TYPES.filter((r) => r.group === group)
          if (rows.length === 0) return null
          return (
            <div key={group} className="weight-group">
              <div className="weight-group-title">{GROUP_LABEL[group]}</div>
              {rows.map((r) => (
                <div key={r.key} className="weight-row">
                  <span className="weight-label">{r.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    disabled={!!activeStrategy}
                    value={state.weights[r.key] ?? r.default}
                    onChange={(e) =>
                      onPatch({ weights: { ...state.weights, [r.key]: parseInt(e.target.value, 10) } })
                    }
                  />
                  <span className="weight-val">{state.weights[r.key] ?? r.default}</span>
                </div>
              ))}
            </div>
          )
        })}
        </div>
      </details>

      <button
        className="filler-btn"
        onClick={runFiller}
        disabled={busy || state.pool.length < 10}
        title="用价值较低的备用海图组成航程，保留优质海图与锁定海图"
      >
        {busy ? '正在求解…' : '🗑 备用海图航程'}
      </button>
      {solveNote && <div className="muted small-note">{solveNote}</div>}

      <div className="panel-title small">优选海图搜索</div>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        按当前权重生成优选海图搜索表达式，无需先导入。粘贴到游戏海图搜索框使用；中文词句来自离线词库，游戏内语法和匹配效果仍需现场验证。
      </div>
      <div className="regex-row">
        <input readOnly value={bestRegex.regex} onFocus={(e) => e.target.select()} />
        <button onClick={copyRegex}>{copied ? '✓' : '复制'}</button>
      </div>
      <div className="regex-meta">
        <span className="muted">
          {bestRegex.included.length} 条词缀 · {bestRegex.regex.length} 字符
        </span>
        <span className="spacer" />
        <label className="muted">
          长度上限{' '}
          <select value={regexCap} onChange={(e) => setRegexCap(parseInt(e.target.value, 10))}>
            <option value={50}>50</option>
            <option value={250}>250</option>
          </select>
        </label>
      </div>
    </div>
  )
}
