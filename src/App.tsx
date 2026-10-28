import { mainlandDisplayText } from './data/textLibrary'
import type { ImportHit } from './logic/importDedupe'
import { createVoyageRecord } from './logic/voyageHistory'
import { saveTheme } from './logic/theme'
import { CalibrationMode } from './components/CalibrationLink'
import { calibrationUrl } from './logic/calibrationLinks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { VoyageHistoryPanels } from './components/VoyageHistoryPanels'
import { BoardView } from './components/Board'
import { PreserveConfirmation } from './components/PreserveConfirmation'
import { collectPreserveCandidates, FILL_ORDER, type PreserveCandidate } from './logic/voyageCompletion'
import { GitHubIcon } from './components/icons'
import { ModBrowser } from './components/ModBrowser'
import { Onboarding } from './components/Onboarding'
import { TooltipLayer } from './components/Tooltip'
import { generateDemoCharts } from './logic/demo'
import { buildChartSearch, buildSingleChartSearch } from './logic/regex'
import { ImportPanel } from './components/ImportPanel'
import { PlanningBackup } from './components/PlanningBackup'
import { KeeperAssistant } from './components/KeeperAssistant'
import { Library } from './components/Library'
import { SolverPanel } from './components/SolverPanel'
import { SolveBar } from './components/SolveBar'
import { UpdatesLog } from './components/UpdatesLog'
import { LATEST_UPDATE_ID } from './data/updates'
import { SessionPlanner } from './components/SessionPlanner'
import { SaveWizard } from './components/SaveWizard'
import { Tutorial } from './components/Tutorial'
import { chartShapeLabel, voyageModShort, voyageModText } from './data/localization'
import { localizedBorder } from './data/borderLocale'
import { BORDER_MODS, borderModById, voyageModById } from './data/mods'
import { strategyById } from './data/strategies'
import { StrategiesPanel, StrategyGuide, pieceStatus } from './components/StrategiesPanel'
import { scoreBoard } from './logic/scoring'
import { checkConnectivity } from './logic/connectivity'
import type { SolverResult } from './logic/solver'
import type { SolveResultContext } from './logic/executable'
import { decodeShare, defaultState, encodeShare, loadLocalWithStatus, saveLocal, type AppState } from './logic/storage'
import type { ChartData } from './types'
import { ALL_STATS, STAT_LABELS, borderTouches, emptyBoard } from './types'

/** discrete/guaranteed effects (drops, spawns, conversions) rather than plain % scalars */
const isNotable = (text: string) => !/^\d+% (increased|more|reduced) /i.test(text)

/** one-time popup: the Windows bulk importer's retirement (GGG's macro rules
 *  ask for one action per keypress; support couldn't confirm the sweep is
 *  acceptable, and no tool is worth anyone's account) */
const AHK_RETIRED_KEY = 'announce-ahk-retired'
const PROJECT_URL = 'https://github.com/ren2019/allflame-voyage-cn'
/** issues live here - linked from the header and the update popup */
const ISSUES_URL = `${PROJECT_URL}/issues`

/** A pending reconciliation is valid only for the same physical voyage inputs. */
function sameVoyageInputs(snapshot: AppState, current: AppState): boolean {
  return snapshot.board === current.board && snapshot.pool === current.pool && snapshot.borders === current.borders
}

function initialState(): { state: AppState; damagedHistory: boolean } {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.length > 20) {
    const shared = decodeShare(hash)
    if (shared) return { state: shared, damagedHistory: false }
  }
  const restored = loadLocalWithStatus()
  return { state: restored.state ?? defaultState(), damagedHistory: restored.damagedHistory }
}

export default function App() {
  const [startup] = useState(initialState)
  const [state, setState] = useState<AppState>(startup.state)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('onboarding-seen')
    } catch {
      return false
    }
  })
  const closeOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem('onboarding-seen', '1')
    } catch {
      /* ignore */
    }
  }
  const [calibrationMode, setCalibrationMode] = useState(false)
  const [showMods, setShowMods] = useState(false)
  // one-time importer-retired popup - returning visitors only (first-timers
  // never had the script, so mark it seen for them)
  const [showAhkNotice, setShowAhkNotice] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(AHK_RETIRED_KEY)) return false
      if (!localStorage.getItem('onboarding-seen')) {
        localStorage.setItem(AHK_RETIRED_KEY, '1')
        return false
      }
      return true
    } catch {
      return false
    }
  })
  const dismissAhkNotice = () => {
    setShowAhkNotice(false)
    try {
      localStorage.setItem(AHK_RETIRED_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  const [showSolverSettings, setShowSolverSettings] = useState(false)
  const [showPlanner, setShowPlanner] = useState(false)
  const [showSaveWizard, setShowSaveWizard] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [showUpdates, setShowUpdates] = useState(false)
  const [updatesSeen, setUpdatesSeen] = useState<string>(() => {
    try {
      return localStorage.getItem('updates-seen') ?? ''
    } catch {
      return ''
    }
  })
  const openUpdates = () => {
    setShowUpdates(true)
    setUpdatesSeen(LATEST_UPDATE_ID)
    try {
      localStorage.setItem('updates-seen', LATEST_UPDATE_ID)
    } catch {
      /* ignore */
    }
  }
  const [voyageMsg, setVoyageMsg] = useState('')
  const [storageFailed, setStorageFailed] = useState(false)
  const currentState = useRef(state)
  currentState.current = state
  const completion = useRef<{ id: string; committed: boolean; snapshot: AppState; step: number } | null>(null)
  const [preserveConfirm, setPreserveConfirm] = useState<{
    id: string
    candidates: PreserveCandidate[]
    index: number
    kept: string[]
  } | null>(null)
  // guided "copy into game": walk the board in the in-game Ctrl+click fill order
  // (bottom-left, then right, then up a row): board cells 6,7,8, 3,4,5, 0,1,2
  const [importFeedback, setImportFeedback] = useState<{ hits: ImportHit[] } | null>(null)
  const [copySeq, setCopySeq] = useState<{ order: number[]; step: number; identity: string } | null>(null)
  const [copiedBoard, setCopiedBoard] = useState<string | null>(null)
  const copyBusy = useRef(false)
  const copyIdentity = (s: AppState) => JSON.stringify({ board: s.board, pool: s.pool, borders: s.borders })
  const copySession = useRef(copySeq)
  copySession.current = copySeq
  const boardIdentity = copyIdentity(state)
  useEffect(() => {
    if (copySeq && copySeq.identity !== boardIdentity) setCopySeq(null)
    if (copiedBoard && copiedBoard !== boardIdentity) setCopiedBoard(null)
  }, [boardIdentity, copySeq, copiedBoard])
  const copyControls = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!copySeq) return
    // Wait for the step's content to lay out; measuring actions must not rely on
    // the browser scrolling a focused or clicked button into view for us.
    const frame = requestAnimationFrame(() => copyControls.current?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [copySeq])
  useEffect(() => {
    if (!preserveConfirm) return
    const event = completion.current
    if (!event || event.committed) return
    if (!sameVoyageInputs(event.snapshot, state)) {
      completion.current = null
      setPreserveConfirm(null)
      setVoyageMsg('摆盘、边界或库存已更改，已取消核销，请重新开始。')
      return
    }
  }, [preserveConfirm, state.board, state.pool, state.borders])
  const [lightTheme, setLightTheme] = useState(() => document.documentElement.dataset.theme === 'light')
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === 'theme') setLightTheme(document.documentElement.dataset.theme === 'light')
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])
  const toggleTheme = () => {
    const next = !lightTheme
    setLightTheme(next)
    saveTheme(next ? 'light' : 'dark')
  }
  const [selectedChart, setSelectedChart] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [results, setResults] = useState<SolverResult[]>([])
  const [refilledCells, setRefilledCells] = useState<number[]>([])
  const resultBoard = useRef(state.board)
  const [resultContext, setResultContext] = useState<SolveResultContext | null>(null)
  useEffect(() => {
    if (resultBoard.current !== state.board) { setResultContext(null); setRefilledCells([]) }
    resultBoard.current = state.board
  }, [state.board])
  // which solver result is currently loaded on the board (highlights its card)
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null)
  const [shareMsg, setShareMsg] = useState('')
  const saveTimer = useRef<number>()

  // debounced autosave
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => setStorageFailed(!saveLocal(state)), 300)
    return () => window.clearTimeout(saveTimer.current)
  }, [state])

  const chartMap = useMemo(() => new Map(state.pool.map((c) => [c.uid, c])), [state.pool])
  const disabledSet = useMemo(() => new Set(state.disabledMods), [state.disabledMods])
  // active curated strategy: while set, its weights override the manual sliders
  const activeStrategy = state.strategyId ? strategyById.get(state.strategyId) ?? null : null
  const effectiveWeights = activeStrategy ? activeStrategy.weights : state.weights
  const score = useMemo(
    () =>
      scoreBoard(state.board, state.borders, chartMap, effectiveWeights, {
        adjacencyMode: state.adjacencyMode,
        adjacentAffectsSelf: state.adjacentAffectsSelf,
        disabledMods: disabledSet,
      }),
    [
      state.board,
      state.borders,
      chartMap,
      effectiveWeights,
      state.adjacencyMode,
      state.adjacentAffectsSelf,
      disabledSet,
    ],
  )
  const conn = useMemo(
    () => checkConnectivity(state.board, chartMap, state.mode),
    [state.board, chartMap, state.mode],
  )

  // Recommendations reuse the strategy material check. Viewing or choosing one
  // never reserves charts, applies a solver result, or completes a voyage.
  const jackpots = useMemo(() => {
    const out: { piece: string; strategyId: string; missing: string[] }[] = []
    if (state.pool.some((c) => c.modIds.includes('voy-noequip')))
      out.push({
        piece: '库存中有“怪物无法掉落装备”海图',
        strategyId: 'milky-meatfish',
        missing: [],
      })
    if (state.borders.includes('b-divine'))
      out.push({
        piece: '边界有“稀有怪物额外掉落神圣石”',
        strategyId: 'divine-border-rares',
        missing: [],
      })
    const keepTiers = [
      ...(state.borders.includes('b-keep-2') ? ['50%'] : []),
      ...(state.borders.includes('b-keep-1') ? ['30%'] : []),
    ]
    if (keepTiers.length) out.push({
      piece: `边界有${keepTiers.join('、')}海图不消耗机会`,
      strategyId: 'kishara-boss-rush', missing: [],
    })
    for (const j of out) {
      const strat = strategyById.get(j.strategyId)
      if (!strat) continue
      j.missing = pieceStatus(strat, state.pool)
        .filter((r) => r.missing > 0)
        .map((r) => `${r.missing}× ${r.label}`)
      if (strat.requiresBorderId && !state.borders.includes(strat.requiresBorderId.id))
        j.missing.push(strat.requiresBorderId.label)
    }
    return out.filter((j) => j.strategyId !== state.strategyId)
  }, [state.pool, state.borders, state.strategyId])

  // breakdown of the implicit mods currently on the board, by scope
  const modCount = useMemo(() => {
    let self = 0
    let adjacent = 0
    let global = 0
    for (const p of state.board) {
      if (!p) continue
      const chart = chartMap.get(p.chartUid)
      if (!chart) continue
      for (const id of chart.modIds) {
        const mod = voyageModById.get(id)
        if (!mod) continue
        if (mod.scope === 'adjacent') adjacent++
        else if (mod.scope === 'global') global++
        else self++
      }
    }
    return { self, adjacent, global, total: self + adjacent + global }
  }, [state.board, chartMap])

  // guaranteed/notable effects active on this board, with counts
  const notables = useMemo(() => {
    const counts = new Map<string, { label: string; full: string; count: number }>()
    const add = (key: string, label: string, full: string) => {
      const cur = counts.get(key)
      if (cur) cur.count++
      else counts.set(key, { label, full, count: 1 })
    }
    state.borders.forEach((id, seg) => {
      if (!id || !state.board[borderTouches(seg)]) return
      const mod = borderModById.get(id)
      if (mod && isNotable(mod.text)) add(mod.id, localizedBorder(mod.id)?.short ?? '边界效果', localizedBorder(mod.id)?.text ?? '边界效果')
    })
    state.board.forEach((p) => {
      if (!p) return
      const chart = chartMap.get(p.chartUid)
      if (!chart) return
      for (const modId of chart.modIds) {
        const mod = voyageModById.get(modId)
        if (mod && isNotable(mod.text)) add(mod.id, voyageModShort(mod.id), voyageModText(mod.id))
      }
    })
    return [...counts.values()]
  }, [state.borders, state.board, chartMap])

  const loadPlanningState = (next: AppState | ((previous: AppState) => AppState)) => {
    copySession.current = null
    setCopySeq(null)
    setCopiedBoard(null)
    setState(next)
  }
  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }))

  const toggleMod = (id: string, off: boolean) =>
    setState((s) => {
      const set = new Set(s.disabledMods)
      if (off) set.add(id)
      else set.delete(id)
      return { ...s, disabledMods: [...set] }
    })
  const bulkMods = (ids: string[], off: boolean) =>
    setState((s) => {
      const set = new Set(s.disabledMods)
      for (const id of ids) (off ? set.add(id) : set.delete(id))
      return { ...s, disabledMods: [...set] }
    })

  const addCharts = (charts: ChartData[]) =>
    setState((s) => ({ ...s, pool: [...s.pool, ...charts] }))

  const removeChart = (uid: string) => {
    setVoyageMsg('已删除库存海图，请重新求解并核对游戏内已放置海图；不足九张时需补充库存。')
    setState((s) => ({
      ...s,
      pool: s.pool.filter((c) => c.uid !== uid),
      board: s.board.map((p) => (p?.chartUid === uid ? null : p)),
    }))
  }

  const clearCharts = () => {
    if (!window.confirm('移除全部库存海图并清空摆盘？边界和权重会保留。'))
      return
    setState((s) => ({ ...s, pool: [], board: emptyBoard() }))
    setSelectedChart(null)
  }

  const updateChart = (chart: ChartData) =>
    setState((s) => ({ ...s, pool: s.pool.map((c) => (c.uid === chart.uid ? chart : c)) }))

  const togglePreserve = (uid: string) =>
    setState((s) => ({
      ...s,
      pool: s.pool.map((c) => (c.uid === uid ? { ...c, preserved: !c.preserved } : c)),
    }))

  // apply the voyage result: keep charts whose uid is in keptUids, consume the
  // rest of the board; charts not on the board are untouched.
  const commitFinish = (keptUids: Set<string>) => {
    const event = completion.current
    if (!event || event.committed) return
    const snapshot = event.snapshot
    const latest = currentState.current
    if (!sameVoyageInputs(snapshot, latest)) return
    event.committed = true
    // Capture the final confirmed state before inventory consumption. Updaters
    // stay pure: React StrictMode may replay them.
    const record = createVoyageRecord(latest, event.id, new Date().toISOString())
    const onBoard = new Set(snapshot.board.filter(Boolean).map((p) => p!.chartUid))
    const consumed = snapshot.pool.filter((c) => onBoard.has(c.uid) && !keptUids.has(c.uid)).length
    const kept = snapshot.pool.filter((c) => onBoard.has(c.uid) && keptUids.has(c.uid)).length
    setState((s) => !sameVoyageInputs(snapshot, s) ? s : ({
      ...s,
      pool: s.pool.filter((c) => !onBoard.has(c.uid) || keptUids.has(c.uid))
        .map((c) => keptUids.has(c.uid) ? { ...c, preserved: false } : c),
      board: emptyBoard(),
      voyageHistory: record && !s.voyageHistory.some((entry) => entry.completionId === record.completionId)
        ? [...s.voyageHistory, record] : s.voyageHistory,
    }))
    setVoyageMsg(`航程已完成：消耗 ${consumed} 张海图` + (kept ? `，保留 ${kept} 张` : ''))
    window.setTimeout(() => setVoyageMsg(''), 4000)
    setPreserveConfirm(null)
  }

  const finishVoyage = () => {
    // Replayed DOM events can share a stale render before React commits the
    // empty board. Keep that render tied to one completion identity.
    if (preserveConfirm || !state.board.some(Boolean) || completion.current?.snapshot.board === state.board) return
    const id = crypto.randomUUID()
    completion.current = { id, committed: false, snapshot: state, step: 0 }
    const candidates = collectPreserveCandidates(state.board, state.borders, chartMap)
    if (candidates.length === 0) commitFinish(new Set())
    else setPreserveConfirm({ id, candidates, index: 0, kept: [] })
  }

  // Prefer imported wording; apply the user-confirmed mainland item name
  // only at display/copy boundaries, keeping stored evidence intact.
  const chartImplicit = (chart: ChartData): string =>
    (chart.implicitText ? mainlandDisplayText(chart.implicitText) : undefined) ??
    chart.modIds.map((id) => voyageModById.get(id)).filter((m) => m && m.scope !== 'self').map((m) => voyageModText(m!.id))[0] ??
    ''
  const startCopySeq = () => {
    const order = FILL_ORDER.filter((i) => state.board[i])
    if (order.some((i) => chartMap.get(state.board[i]!.chartUid)?.pendingDeletion)) {
      setVoyageMsg('摆盘含待删除海图，请清理或重新求解后复制。')
      return
    }
    setCopiedBoard(null)
    if (order.length) setCopySeq({ order, step: 0, identity: copyIdentity(state) })
  }
  const copyCurrentAndAdvance = async () => {
    const session = copySession.current
    if (!session || copyBusy.current) return
    const snapshot = currentState.current
    if (session.identity !== copyIdentity(snapshot)) { setCopySeq(null); return }
    const placement = snapshot.board[session.order[session.step]]
    const chart = snapshot.pool.find((c) => c.uid === placement?.chartUid)
    if (!chart || chart.pendingDeletion) { setCopySeq(null); return }
    copyBusy.current = true
    try {
      await navigator.clipboard.writeText(buildSingleChartSearch(chart))
      if (copySession.current !== session || copyIdentity(currentState.current) !== session.identity) return
      if (session.step + 1 >= session.order.length) {
        setCopySeq(null)
        if (session.order.length === 9) setCopiedBoard(session.identity)
      } else setCopySeq({ ...session, step: session.step + 1 })
    } catch {
      setVoyageMsg('复制失败，请允许剪贴板访问后重试；当前步骤尚未推进。')
    } finally { copyBusy.current = false }
  }

  // while stepping, Ctrl+C copies the current square and advances; Esc cancels
  useEffect(() => {
    if (!copySeq) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        copyCurrentAndAdvance()
      } else if (e.key === 'Escape') {
        setCopySeq(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copySeq])

  // step through each preserved chart, one at a time, its board tile highlighted
  const decidePreserve = (survived: boolean) => {
    if (!preserveConfirm) return
    const { id, candidates, index, kept } = preserveConfirm
    const event = completion.current
    if (!event || event.id !== id || event.committed || event.step !== index) return
    const latest = currentState.current
    if (!sameVoyageInputs(event.snapshot, latest)) return
    event.step++
    const nextKept = survived ? [...kept, candidates[index].chart.uid] : kept
    if (index + 1 >= candidates.length) commitFinish(new Set(nextKept))
    else setPreserveConfirm({ id, candidates, index: index + 1, kept: nextKept })
  }

  const onCellClick = (i: number) => {
    if (selectedChart) {
      // place the selected library chart (removing it from any other cell)
      setState((s) => {
        const board = s.board.map((p) => (p?.chartUid === selectedChart ? null : p))
        board[i] = { chartUid: selectedChart, rotation: 0 }
        return { ...s, board }
      })
      setSelectedChart(null)
      setSelectedCell(null)
      return
    }
    if (selectedCell === null) {
      if (state.board[i]) setSelectedCell(i)
      return
    }
    if (selectedCell === i) {
      setSelectedCell(null)
      return
    }
    // swap cells
    setState((s) => {
      const board = [...s.board]
      const t = board[selectedCell]
      board[selectedCell] = board[i]
      board[i] = t
      return { ...s, board }
    })
    setSelectedCell(null)
  }

  const [searchMsg, setSearchMsg] = useState('')
  const copySearch = async () => {
    const placed = state.board.filter(Boolean).map((p) => chartMap.get(p!.chartUid)?.name ?? '')
    const others = state.pool
      .filter((c) => !state.board.some((p) => p?.chartUid === c.uid))
      .map((c) => c.name)
    const str = buildChartSearch(placed.filter(Boolean), others)
    try {
      await navigator.clipboard.writeText(str)
      setSearchMsg('已复制！')
    } catch {
      setSearchMsg(str)
    }
    window.setTimeout(() => setSearchMsg(''), 2500)
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodeShare(state)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg('链接已复制！')
    } catch {
      window.location.hash = encodeShare(state)
      setShareMsg('链接已写入地址栏')
    }
    window.setTimeout(() => setShareMsg(''), 2500)
  }

  return (
    <CalibrationMode.Provider value={calibrationMode}>
    <div className="app">
      <TooltipLayer />
      {showOnboarding && (
        <Onboarding
          onClose={closeOnboarding}
          onDemo={() => addCharts(generateDemoCharts(25))}
        />
      )}
      {showMods && (
        <ModBrowser
          disabled={disabledSet}
          onToggle={toggleMod}
          onBulk={bulkMods}
          onClose={() => setShowMods(false)}
        />
      )}
      {showUpdates && <UpdatesLog onClose={() => setShowUpdates(false)} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      {showAhkNotice && !showOnboarding && (
        <div className="onboard-backdrop" onClick={dismissAhkNotice}>
          <div className="onboard ahk-notice" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">
              📥 原版 Windows 批量导入脚本已停用
              <span className="spacer" />
              <button onClick={dismissAhkNotice}>✕</button>
            </div>
            <p className="tut-body">
              原版批量导入脚本已移除并保持停用。原作者因游戏宏规则和适用范围未明确而停止提供该脚本。
            </p>
            <p className="tut-body">
              国服流程使用手动复制：<strong>在国服游戏中 Ctrl+Alt+C 高级复制海图，再在本页 Ctrl+V 导入</strong>。
              已导入的重复扫描会按原版规则跳过。边界则逐个点击摆盘外圈槽位，搜索并选择对应词缀。
            </p>
            <p className="tut-body">
              导入面板仍保留原版英文海图与边界采集器参考。它不向游戏发送输入，
              但未做国服采集或 OCR 适配；本版国服使用手动复制和边界选择。
            </p>
            <div className="sw-actions">
              <span className="spacer" />
              <button onClick={dismissAhkNotice}>知道了</button>
            </div>
            <div className="muted small-note">
              问题？{' '}
              <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
                GitHub 问题反馈
              </a>{' '}
              欢迎提交反馈。
            </div>
          </div>
        </div>
      )}
      {showSaveWizard && (
        <SaveWizard
          pool={state.pool}
          keeps={state.pieceKeeps}
          onApply={(keeps) => patch({ pieceKeeps: keeps })}
          onClose={() => setShowSaveWizard(false)}
        />
      )}
      {showPlanner && (
        <SessionPlanner
          pool={state.pool}
          borders={state.borders}
          reservations={state.strategyReservations}
          pieceKeeps={state.pieceKeeps}
          centerChoice={state.centerChoice}
          onUseStrategy={(id) => patch({ strategyId: id })}
          onClose={() => setShowPlanner(false)}
        />
      )}
      {showSolverSettings && (
        <div className="onboard-backdrop" onClick={() => setShowSolverSettings(false)}>
          <div className="onboard solver-popup" onClick={(e) => e.stopPropagation()}>
            <SolverPanel
              state={state}
              activeStrategy={activeStrategy}
              onPatch={patch}
              onResults={(r, context) => {
                setResults(r)
                setResultContext(context)
                setAppliedIdx(null)
              }}
              onClose={() => setShowSolverSettings(false)}
            />
          </div>
        </div>
      )}
      <header>
        <div className="header-main">
          <div className="site-identity">
            <div className="site-title-row">
              <h1>
                永火 <span className="accent">航程规划</span>
              </h1>
              <div className="site-version-links">
                <span className="tag">国服简体版 · 3.29</span>
                <a className="project-github" href={PROJECT_URL} target="_blank" rel="noopener noreferrer"
                  aria-label="国服适配：ren2019 · GitHub 项目" title="国服适配：ren2019 · 查看 GitHub 项目">
                  <GitHubIcon />
                </a>
              </div>
            </div>
          </div>
          <div className="tutorial-tools" role="group" aria-label="教程与示例">
            <button className="tutorial-btn" onClick={() => setShowTutorial(true)}>🧭 使用教程</button>
            <button title="生成随机示例海图体验工具" onClick={() => addCharts(generateDemoCharts(25))}>🎲 示例 ×25</button>
            <button title="模拟重置边界词缀" onClick={() => patch({ borders: Array.from({ length: 12 }, () => BORDER_MODS[Math.floor(Math.random() * BORDER_MODS.length)].id) })}>🎲 随机边界</button>
          </div>
        </div>
        <div className="header-right">
          <div className="header-links" role="group" aria-label="站点信息">
            <button
              className={updatesSeen !== LATEST_UPDATE_ID ? 'updates-btn unseen' : 'updates-btn'}
              title="查看站点更新记录"
              onClick={openUpdates}
            >
              更新记录
            </button>
            <a
              className="feedback-link"
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="在 GitHub 提交问题或建议"
            >
              🐛 反馈
            </a>
            <button title="首次使用说明" onClick={() => setShowOnboarding(true)}>
              首次说明
            </button>
          </div>
          <div className="header-tools" role="group" aria-label="工具与显示">
            <button title="浏览全部词缀并停用不需要的效果" onClick={() => setShowMods(true)}>
              词缀{state.disabledMods.length > 0 ? `（已停用 ${state.disabledMods.length} 项）` : ''}
            </button>
            <a className="feedback-link" href={calibrationUrl()} target="_blank" rel="noopener noreferrer">中文校准 ↗</a>
            <button className="calibration-mode-toggle" aria-label="单条中文校准模式"
              aria-pressed={calibrationMode} title={calibrationMode ? '关闭单条校准入口' : '显示单条校准入口'}
              onClick={() => setCalibrationMode(enabled => !enabled)}>✎</button>
            <button
              className="theme-link"
              title={lightTheme ? '切换到深色主题' : '切换到浅色主题'}
              aria-label={lightTheme ? '切换到深色主题' : '切换到浅色主题'}
              onClick={toggleTheme}
            >
              {lightTheme ? '☾' : '☀'}
            </button>
          </div>
          <div className="planning-transfer">
            <button onClick={share}>{shareMsg || '分享摆盘'}</button>
            <PlanningBackup state={state} onLoadState={loadPlanningState} />
          </div>
        </div>
      </header>

      <main>
        <section className="col library-col">
          <Library
            pool={state.pool}
            board={state.board}
            weights={effectiveWeights}
            disabledMods={disabledSet}
            reservations={state.strategyReservations}
            pieceKeeps={state.pieceKeeps}
            selected={selectedChart}
            onSelect={(uid) => {
              setSelectedChart((cur) => (cur === uid ? null : uid))
              setSelectedCell(null)
            }}
            onAdd={addCharts}
            importFeedback={importFeedback}
            onCloseFeedback={() => setImportFeedback(null)}
            onClearPending={() => {
              setState((s) => { const marked = new Set(s.pool.filter((c) => c.pendingDeletion).map((c) => c.uid));
                return { ...s, pool: s.pool.filter((c) => !marked.has(c.uid)), board: s.board.map((p) => p && marked.has(p.chartUid) ? null : p) } })
              setVoyageMsg('已清理待删除海图，请重新求解；不足九张时需补充库存，并核对游戏内已放置的海图。')
            }}
            onRemove={removeChart}
            onUpdate={updateChart}
            onClearCharts={clearCharts}
            onOpenSaveWizard={() => setShowSaveWizard(true)}
          />
          <ImportPanel onFeedback={(hits) => setImportFeedback({ hits })} onImport={addCharts} state={state} onLoadState={loadPlanningState} />
          <KeeperAssistant />
        </section>

        <section className="col board-col">
          <BoardView
            refilledCells={refilledCells}
            board={state.board}
            borders={state.borders}
            charts={chartMap}
            perTile={score.perTile}
            strategyId={state.strategyId}
            scoreOptions={{ adjacencyMode: state.adjacencyMode, adjacentAffectsSelf: state.adjacentAffectsSelf, disabledMods: disabledSet }}
            selectedCell={selectedCell}
            highlightUid={
              copySeq
                ? (state.board[copySeq.order[copySeq.step]]?.chartUid ?? null)
                : preserveConfirm
                  ? preserveConfirm.candidates[preserveConfirm.index].chart.uid
                  : selectedChart && state.board.some((p) => p?.chartUid === selectedChart)
                    ? selectedChart
                    : null
            }
            strictMode={state.mode !== 'any'}
            placingChart={selectedChart ? chartMap.get(selectedChart) ?? null : null}
            onCellClick={onCellClick}
            onRemove={(i) =>
              setState((s) => {
                const board = [...s.board]
                board[i] = null
                return { ...s, board }
              })
            }
            onToggleDeletion={(uid) => setState((s) => ({ ...s, pool: s.pool.map((c) => c.uid === uid ? { ...c, pendingDeletion: !c.pendingDeletion } : c) }))}
            onMissing={(i) => setState((s) => {
              const uid = s.board[i]?.chartUid
              return { ...s, pool: s.pool.map((c) => c.uid === uid ? { ...c, pendingDeletion: true } : c), board: s.board.map((p, cell) => cell === i ? null : p) }
            })}
            onRotate={(i) =>
              setState((s) => {
                const board = [...s.board]
                const p = board[i]
                if (p) board[i] = { ...p, rotation: (p.rotation + 1) % 4 }
                return { ...s, board }
              })
            }
            onBorderChange={(seg, id) =>
              setState((s) => {
                const borders = [...s.borders]
                borders[seg] = id
                return { ...s, borders }
              })
            }
            onTogglePreserve={togglePreserve}
            onFinishVoyage={finishVoyage}
            onCopySequence={startCopySeq}
            copyComplete={copiedBoard === boardIdentity}
            voyageMsg={voyageMsg}
            sequenceActive={!!copySeq || !!preserveConfirm}
            solveSlot={
              <SolveBar
                state={state}
                activeStrategy={activeStrategy}
                results={results}
                resultContext={resultContext}
                appliedIdx={appliedIdx}
                onResults={(r, context) => {
                  setRefilledCells(context?.origin === 'refill' && r.length ? context.locked.flatMap((p, i) => p ? [] : [i]) : [])
                  setResults(r)
                  setResultContext(context)
                  setAppliedIdx(null)
                }}
                onApply={(r, idx) => {
                  const board = r.board.map((p) => (p ? { ...p } : null))
                  resultBoard.current = board
                  patch({ board })
                  setAppliedIdx(idx)
                  setSelectedCell(null)
                  setSelectedChart(null)
                }}
                onOpenPlanner={() => setShowPlanner(true)}
                onOpenSettings={() => setShowSolverSettings(true)}
              />
            }
          />

          {copySeq && (
            <div className="preserve-confirm copyseq" ref={copyControls}>
              <div className="pc-head">
                按高亮格的顺序在游戏中放置海图：复制搜索文本，在游戏中找到海图并 Ctrl+左键放入。
                从左下角开始。第 {copySeq.step + 1}/{copySeq.order.length} 步。
              </div>
              {(() => {
                const c = chartMap.get(state.board[copySeq.order[copySeq.step]]?.chartUid ?? '')
                if (!c) return null
                return (
                  <>
                    <div className="pc-name">{c.name}</div>
                    <div className="pc-sub">
                      {chartImplicit(c)}
                      {c.shape ? ` · 形状：${chartShapeLabel(c.shape)}` : ''}
                    </div>
                  </>
                )
              })()}
              <div className="copyseq-actions">
                <button className="copyseq-go" onClick={copyCurrentAndAdvance}>
                  {copySeq.step + 1 >= copySeq.order.length
                    ? '📋 复制最后一张并结束'
                    : '📋 复制并下一步'}
                  <span className="copyseq-hint">或按 Ctrl+C</span>
                </button>
                <button className="pc-lost" onClick={() => setCopySeq(null)}>
                  取消
                </button>
              </div>
            </div>
          )}

          {preserveConfirm && (
            <div>
              <PreserveConfirmation key={`${preserveConfirm.id}:${preserveConfirm.index}`}
                candidate={preserveConfirm.candidates[preserveConfirm.index]}
                step={preserveConfirm.index + 1} total={preserveConfirm.candidates.length}
                onDecide={decidePreserve}
                onCancel={() => { completion.current = null; setPreserveConfirm(null) }} />
            </div>
          )}

          <div className={`conn-status ${conn.valid ? 'ok' : 'bad'}`}>
            {state.mode === 'any'
              ? '已忽略连接规则'
              : conn.valid
                ? '✓ 连接布局有效'
                : [
                    conn.mismatches > 0
                      ? `✗ ${conn.mismatches} 处连接不匹配`
                      : null,
                    conn.disconnected > 0
                      ? `${conn.disconnected} 张海图未连通到 ⚓ 起点`
                      : null,
                    conn.unfilled > 0
                      ? `${conn.unfilled} 格为空（需要填满九格）`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
          </div>

          {modCount.total > 0 && (
            <div className="modcount">
              <span className="modcount-title">航行词缀统计</span>
              <span className="modcount-item scope-self">本区域 {modCount.self}</span>
              <span className="modcount-item scope-adjacent">相邻区域 {modCount.adjacent}</span>
              <span className="modcount-item scope-global">全航程 {modCount.global}</span>
              <span className="modcount-item modcount-conn">🔗 {conn.connections} 条连接</span>
            </div>
          )}

          <div className="score-panel">
            <div className="score-total">
              航程奖励 <strong>{score.total.toFixed(1)}</strong>
              <span className="spacer" />
              <button
                onClick={copySearch}
                disabled={state.board.every((p) => !p)}
                title="复制游戏内搜索文本，定位当前摆盘使用的海图"
              >
                {searchMsg || '⌕ 复制游戏内搜索'}
              </button>
            </div>
            <div className="muted small-note" style={{ marginTop: 0 }}>
              按奖励权重和词缀估值比较摆盘的相对评分，不代表实际掉落价值。下方列出当前效果。
            </div>
            <div className="reward-grid">
              {ALL_STATS.filter((s) => score.perStat[s] > 0)
                .sort((a, b) => score.perStat[b] - score.perStat[a])
                .map((s, i) => (
                  <div key={s} className={`reward-card ${i === 0 ? 'best' : ''}`}>
                    <div className="reward-value">+{Math.round(score.perStat[s] * 100)}%</div>
                    <div className="reward-label">{STAT_LABELS[s]}</div>
                  </div>
                ))}
              {ALL_STATS.every((s) => score.perStat[s] === 0) && (
                <div className="muted">放入海图后查看加成</div>
              )}
            </div>
            {ALL_STATS.some((s) => score.perStat[s] > 0) && (
              <div className="muted small-note">全航程各区域的平均加成。</div>
            )}
            {notables.length > 0 && (
              <>
                <div className="panel-title small">固定与特殊效果</div>
                <div className="notable-list">
                  {notables.map((n) => (
                    <span key={n.label} className="notable-item" title={n.full}>
                      {n.label}
                      {n.count > 1 ? ` ×${n.count}` : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="col solver-col">
          <StrategiesPanel
            activeId={state.strategyId}
            pool={state.pool}
            borders={state.borders}
            onSelect={(id) => patch({ strategyId: id })}
            layoutChoice={state.layoutChoice}
            onLayoutChoice={(sid, lid) =>
              patch({ layoutChoice: { ...state.layoutChoice, [sid]: lid } })
            }
            centerChoice={state.centerChoice}
            onCenterChoice={(sid, cid) =>
              patch({ centerChoice: { ...state.centerChoice, [sid]: cid } })
            }
          />
          {jackpots.length > 0 && <section className="strategy-recommendations" aria-label="策略推荐">
            <div className="panel-title small">其他策略推荐</div>
            {jackpots.map((j) => {
              const strategy = strategyById.get(j.strategyId)!
              return <article key={j.strategyId} className="strategy-recommendation" aria-label={`推荐${strategy.name}`}>
                <p>发现：{j.piece}</p>
                <p>可用于：<strong>{strategy.name}</strong></p>
                {j.strategyId === 'kishara-boss-rush' && <p className="muted">边界机会提示；是否能保图仍需检查实际接触、连接、锁定和装备转金币限制。</p>}
                {j.missing.length > 0 ? <>
                  <p className="recommendation-missing">尚缺：{j.missing.join('、')}。</p>
                  <p>可先切换查看玩法，建议补齐后运行。</p>
                </> : <>
                  <p>材料齐备（按策略材料与必要边界检查）。</p>
                  <p className="muted">仍需检查九格摆盘与连接，不保证收益。</p>
                </>}
                <button onClick={() => patch({ strategyId: j.strategyId })}>切换到{strategy.name}</button>
              </article>
            })}
            <p className="muted small-note">切换只更改当前策略，不会自动求解或预留海图。</p>
          </section>}
          <StrategyGuide strategy={activeStrategy} />

          <VoyageHistoryPanels state={state} damagedHistory={startup.damagedHistory} storageFailed={storageFailed} />

        </section>
      </main>
      <footer className="site-footer">
        基于 <a href="https://github.com/one-more-map/one-more-map.github.io" target="_blank" rel="noopener noreferrer"
          title="原版作者：one-more-map · 查看 GitHub 项目">one-more-map 的 Allflame Voyage Solver</a>
      </footer>
    </div>
    </CalibrationMode.Provider>
  )
}
