// THROWAWAY: sparse numbered regional overlays on /?prototype=strategy&variant=numbered.
// Question: which small addition makes objectives and conditional order readable at a glance?
// Demo state only. No storage, solver mutations, exports, or game clipboard actions.
import { useState } from 'react'
import { Library } from './Library'
import { PrototypeBoardView } from './StrategyBoard.prototype'
import { StrategiesPanel, StrategyGuide } from './StrategiesPanel'
import { TooltipLayer } from './Tooltip'
import { strategyById } from '../data/strategies'
import { scoreBoard } from '../logic/scoring'
import type { Board, Borders, ChartData, Edges } from '../types'
import { NumberedTarget, priorityStops, POSITIONS } from './StrategyGuidance.prototype'
import './strategy-guidance.prototype.css'

function sample(strategy: string, anchorPosition: number): { pool: ChartData[]; board: Board; borders: Borders } {
  const pool: ChartData[] = Array.from({ length: 9 }, (_, i) => ({ uid: `prototype-${i}`, name: `演示海图 · ${POSITIONS[i]}`, level: 83, areaType: 'abyssal-plain',
    edges: [true, true, true, true] as Edges,
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
  const [strategy, setStrategy] = useState('anchorfield-fishing')
  const [demo, setDemo] = useState(() => sample('anchorfield-fishing', 2))
  const [selected, setSelected] = useState<number | null>(null)
  const [showOrder, setShowOrder] = useState(true)
  const [light, setLight] = useState(document.documentElement.dataset.theme === 'light')
  const charts = new Map(demo.pool.map(c => [c.uid, c]))
  const stops = priorityStops(strategy, demo.board, demo.borders, charts)
  const definition = strategyById.get(strategy)!
  const score = scoreBoard(demo.board, demo.borders, charts, definition?.weights ?? {})
  const changeStrategy = (id: string | null) => {
    const next = id ?? 'manual'
    setStrategy(next); setDemo(sample(next, 2)); setSelected(null)
  }
  return <div className="app proto-app">
    <TooltipLayer />
    <header><div className="site-identity"><h1>航海摆盘 <span className="proto-stamp">策略提示原型</span></h1><span className="muted">演示海图 · 操作仅在本页临时生效</span></div>
      <button onClick={() => { document.documentElement.dataset.theme = light ? 'dark' : 'light'; setLight(!light) }}>{light ? '深色主题' : '浅色主题'}</button>
    </header>
    <section className="proto-intro"><strong>区域目标里直接标 1、2、3、4</strong>
      <p>仅标少数优先行动，不铺满九格。右侧切换策略；点击两格交换位置，查看编号随摆盘调整。</p>
      <div className="proto-demo-tools">{strategy === 'anchorfield-fishing' && <button onClick={() => { const at = demo.board.findIndex(p => p && charts.get(p.chartUid)?.areaType === 'anchorfield'); const board = [...demo.board]; const next = at === 6 ? 2 : 6; [board[at], board[next]] = [board[next], board[at]]; setDemo({ ...demo, board }); setSelected(null) }}>将锚地移到{demo.board[6] && charts.get(demo.board[6]!.chartUid)?.areaType === 'anchorfield' ? '右上' : '起点'}</button>}
        <button onClick={() => { setDemo(sample(strategy, 2)); setSelected(null) }}>重置演示</button>
        <label><input type="checkbox" checked={showOrder} onChange={e => setShowOrder(e.target.checked)} /> 打法顺序</label>
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
        prototypeCells={showOrder ? demo.board.map((_, i) => {
          const here = stops.filter(s => s.cell === i)
          return here.length ? <div className="proto-order-stack">{here.map(s => <NumberedTarget key={s.number} stop={s} />)}</div> : null
        }) : undefined} />
        <div className="proto-order-legend"><span><i>1</i> → <i>2</i> → <i>3</i> → <i>4</i> 建议行动顺序 · 最多四项</span>
          {strategy === 'anchorfield-fishing' ? <span>先探索找赐福 → 取得后回锚地；赐福位置随机。</span> : <span>未编号区域顺路处理；按连接前往目标。</span>}
        </div>
        <details className="proto-state"><summary>查看当前演示状态</summary><p>{definition?.name ?? '手动规划'} · 顺序提示{showOrder ? '开启' : '关闭'} · {stops.length} 个行动</p>
          {stops.map(s => <p key={s.number}><b>{s.number} · {POSITIONS[s.cell]} · {s.label}{s.conditional ? '（赐福后开）' : ''}</b>：{s.detail}</p>)}
          {!stops.length && <p>没有已识别的专项优先目标，不凑满编号。</p>}
          <p className="muted">选中格：{selected === null ? '无' : POSITIONS[selected]} · 演示顺序按动作依赖与连通距离生成，不使用区域评分。真实赐福位置与获得状态均未知。数据仅在内存中。</p>
        </details>
      </section>
      <section className="col solver-col"><StrategiesPanel activeId={strategy === 'manual' ? null : strategy} pool={demo.pool} borders={demo.borders} onSelect={changeStrategy} /><StrategyGuide strategy={definition ?? null} /></section>
    </main>
  </div>
}
