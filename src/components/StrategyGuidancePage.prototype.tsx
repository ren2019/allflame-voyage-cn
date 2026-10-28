// THROWAWAY: three strategy guidance variants on /?prototype=strategy&variant=A|B|C.
// Question: which small addition makes objectives and conditional order readable at a glance?
// Demo state only. No storage, solver mutations, exports, or game clipboard actions.
import { useEffect, useState } from 'react'
import { Library } from './Library'
import { PrototypeBoardView } from './StrategyBoard.prototype'
import { StrategiesPanel, StrategyGuide } from './StrategiesPanel'
import { TooltipLayer } from './Tooltip'
import { strategyById } from '../data/strategies'
import { scoreBoard } from '../logic/scoring'
import type { Board, Borders, ChartData, Edges } from '../types'
import { annotations, makeGuide, POSITIONS, VariantA, VariantB, VariantC, VARIANTS, type Variant } from './StrategyGuidance.prototype'
import './strategy-guidance.prototype.css'

function sample(strategy: string, anchorPosition: number): { pool: ChartData[]; board: Board; borders: Borders } {
  const pool: ChartData[] = Array.from({ length: 9 }, (_, i) => ({ uid: `prototype-${i}`, name: `演示海图 · ${POSITIONS[i]}`, level: 83, areaType: 'abyssal-plain',
    edges: [i >= 3, i % 3 < 2, i < 6, i % 3 > 0] as Edges,
    modIds: [i % 2 ? 'cm-quant-28' : 'voy-quant-1'], rewards: [{ stat: 'quantity', percent: 110 + i * 8 }] }))
  const borders: Borders = Array(12).fill(null)
  if (strategy === 'anchorfield-fishing') pool[anchorPosition].areaType = 'anchorfield'
  if (strategy === 'kishara-boss-rush') pool[5].areaType = 'kisharas-rest'
  if (strategy === 'milky-speedrun') pool[4].modIds = ['adj-opbox-2']
  if (strategy === 'milky-meatfish' || strategy === 'milky-ethereal') {
    pool[0].modIds = ['adj-lantern']
    pool[8].modIds = ['adj-lantern']
    pool[4].modIds = [strategy === 'milky-meatfish' ? 'adj-star-2' : 'adj-magic-2']
    if (strategy === 'milky-ethereal') pool[2].areaType = 'infested-bathyspheres'
  }
  if (strategy === 'divine-border-rares' || strategy === 'cutedog-divine-boxes') {
    pool[2].areaType = strategy === 'divine-border-rares' ? 'sea-pillars' : 'pelagic-abyss'
    pool[1].modIds = ['adj-box-3']
    pool[5].modIds = ['adj-box-2']
    borders[2] = 'b-divine'
  }
  return { pool, board: pool.map(c => ({ chartUid: c.uid, rotation: 0 })), borders }
}

const noop = () => {}
export function StrategyGuidancePrototype() {
  const [variant, setVariant] = useState<Variant>(() => {
    const v = new URLSearchParams(location.search).get('variant')
    return v === 'B' || v === 'C' ? v : 'A'
  })
  const [strategy, setStrategy] = useState('anchorfield-fishing')
  const [demo, setDemo] = useState(() => sample('anchorfield-fishing', 2))
  const [selected, setSelected] = useState<number | null>(null)
  const [stage, setStage] = useState(0)
  const [actionGroup, setActionGroup] = useState<number | null>(null)
  const [light, setLight] = useState(document.documentElement.dataset.theme === 'light')
  const switchVariant = (next: Variant) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', next)
    history.replaceState(null, '', url)
    setVariant(next)
    setActionGroup(null)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const keys: Variant[] = ['A', 'B', 'C']
      switchVariant(keys[(keys.indexOf(variant) + (e.key === 'ArrowRight' ? 1 : 2)) % 3])
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [variant])
  const charts = new Map(demo.pool.map(c => [c.uid, c]))
  const guide = makeGuide(strategy, demo.board, demo.borders, charts)
  const currentStage = Math.min(stage, guide.steps.length - 1)
  const active = variant === 'C' ? guide.steps[currentStage].cells : variant === 'B' && actionGroup !== null ? guide.steps[actionGroup]?.cells : undefined
  const definition = strategyById.get(strategy)!
  const score = scoreBoard(demo.board, demo.borders, charts, definition?.weights ?? {})
  const changeStrategy = (id: string | null) => {
    const next = id ?? 'manual'
    setStrategy(next); setDemo(sample(next, 2)); setStage(0); setActionGroup(null); setSelected(null)
  }
  return <div className="app proto-app">
    <TooltipLayer />
    <header><div className="site-identity"><h1>航海摆盘 <span className="proto-stamp">策略提示原型</span></h1><span className="muted">演示海图 · 操作仅在本页临时生效</span></div>
      <button onClick={() => { document.documentElement.dataset.theme = light ? 'dark' : 'light'; setLight(!light) }}>{light ? '深色主题' : '浅色主题'}</button>
    </header>
    <section className="proto-intro"><strong>第一眼能看懂：目标在哪、先做什么、什么要等？</strong>
      <p>对比三种提示方式。右侧可切换策略；点击两张卡片交换位置，检查目标提示是否跟随。各方案使用相同的演示摆盘。</p>
      <div className="proto-demo-tools">{strategy === 'anchorfield-fishing' && <button onClick={() => { const at = demo.board.findIndex(p => p && charts.get(p.chartUid)?.areaType === 'anchorfield'); const board = [...demo.board]; const next = at === 6 ? 2 : 6; [board[at], board[next]] = [board[next], board[at]]; setDemo({ ...demo, board }); setSelected(null) }}>将锚地移到{demo.board[6] && charts.get(demo.board[6]!.chartUid)?.areaType === 'anchorfield' ? '右上' : '起点'}</button>}
        <button onClick={() => { setDemo(sample(strategy, 2)); setSelected(null); setStage(0); setActionGroup(null) }}>重置演示</button>
        <span className="muted">{VARIANTS[variant]} · 评分保持原口径</span>
      </div>
    </section>
    <main>
      <section className="col library-col"><Library pool={demo.pool} board={demo.board} weights={definition?.weights ?? {}} disabledMods={new Set()} reservations={{ divine: false, meatfish: false, ethereal: false }} pieceKeeps={{}} selected={selected === null ? null : demo.board[selected]?.chartUid ?? null}
        onSelect={uid => setSelected(demo.board.findIndex(p => p?.chartUid === uid))} onAdd={noop} onRemove={noop} onUpdate={noop} onClearCharts={noop} onClearPending={noop} />
        <div className="proto-context"><b>原型说明</b><p>库存只读；本次仅比较打法展示。示例用于看清提示，不代表求解结果或材料齐备。</p></div>
      </section>
      <section className="col board-col"><PrototypeBoardView board={demo.board} borders={demo.borders} charts={charts} perTile={score.perTile} strategyId={strategy} selectedCell={selected} highlightUid={null} strictMode={true} placingChart={null}
        onCellClick={i => { if (selected === null) setSelected(i); else { const board = [...demo.board]; [board[i], board[selected]] = [board[selected], board[i]]; setDemo({ ...demo, board }); setSelected(null) } }}
        onRemove={noop} onToggleDeletion={noop} onMissing={noop} onRotate={i => setDemo({ ...demo, board: demo.board.map((p, n) => n === i && p ? { ...p, rotation: (p.rotation + 1) % 4 } : p) })}
        onBorderChange={(segment, id) => setDemo({ ...demo, borders: demo.borders.map((b, i) => i === segment ? id : b) })} onTogglePreserve={noop} onFinishVoyage={noop} onCopySequence={noop} voyageMsg="" sequenceActive={true}
        prototypeVariant={variant} prototypeCells={annotations(guide, variant, currentStage)} prototypeActive={active}
        prototypeTop={variant === 'A' ? <VariantA guide={guide} /> : variant === 'C' ? <VariantC guide={guide} stage={currentStage} onStage={setStage} /> : undefined}
        prototypeRail={variant === 'B' ? <VariantB guide={guide} selected={actionGroup} onSelect={setActionGroup} /> : undefined} />
        <details className="proto-state" open><summary>当前演示状态</summary><p>方案 {variant} · {definition?.name} · {variant === 'C' ? `查看：${guide.steps[currentStage].title}` : actionGroup !== null && variant === 'B' ? `高亮：${guide.steps[actionGroup].title}` : '查看全部动作'}</p>
          {guide.steps.map(s => <p key={s.title}><b>{s.title}：</b>{s.cells.map(i => POSITIONS[i]).join('、') || '当前没有目标'}</p>)}
          <p className="muted">选中格：{selected === null ? '无' : POSITIONS[selected]} · 已旋转：{demo.board.flatMap((p, i) => p?.rotation ? [`${POSITIONS[i]} ${p.rotation * 90}°`] : []).join('、') || '无'}{strategy === 'anchorfield-fishing' ? ' · 目标赐福：未知位置、未确认获得' : ''} · 数据仅在内存中</p>
        </details>
      </section>
      <section className="col solver-col"><StrategiesPanel activeId={strategy === 'manual' ? null : strategy} pool={demo.pool} borders={demo.borders} onSelect={changeStrategy} /><StrategyGuide strategy={definition ?? null} /></section>
    </main>
    <nav className="proto-switcher" aria-label="原型方案切换"><button aria-label="上一个方案" onClick={() => switchVariant(variant === 'A' ? 'C' : variant === 'B' ? 'A' : 'B')}>←</button>
      <div><small>临时原型 · 方向键切换</small><strong>{variant} · {VARIANTS[variant]}</strong></div>
      <button aria-label="下一个方案" onClick={() => switchVariant(variant === 'A' ? 'B' : variant === 'B' ? 'C' : 'A')}>→</button>
    </nav>
  </div>
}
