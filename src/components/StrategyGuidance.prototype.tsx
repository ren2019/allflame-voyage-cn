// THROWAWAY: three ways to show actions, not three different voyage algorithms.
import type { ReactNode } from 'react'
import type { Board, Borders, ChartData } from '../types'
import { regionTargets } from '../logic/regionTargets'
import { destinationLabel } from '../data/localization'

export const POSITIONS = ['左上', '上中', '右上', '左中', '中心', '右中', '左下', '下中', '右下']
export type Variant = 'A' | 'B' | 'C'
export const VARIANTS: Record<Variant, string> = { A: '卡片动作签', B: '打法清单', C: '阶段聚焦' }
export interface Step { title: string; detail: string; cells: number[]; action: string }
export interface Guide { title: string; note: string; steps: Step[]; names: string[] }

export function makeGuide(strategy: string | null, board: Board, borders: Borders, charts: Map<string, ChartData>): Guide {
  const cells = regionTargets(board, borders, charts, strategy)
  const withTarget = (...ids: string[]) => cells.flatMap((c, i) => c.targets.some(t => ids.includes(t.id)) ? [i] : [])
  const all = board.flatMap((p, i) => p ? [i] : [])
  const names = board.map(p => {
    const c = p && charts.get(p.chartUid)
    return c?.areaType && !['abyssal-plain', 'seafloor-ridges', 'undersea-groves'].includes(c.areaType) ? destinationLabel(c.areaType) : '普通区域'
  })
  const step = (title: string, detail: string, cells: number[], action: string): Step => ({ title, detail, cells, action })
  if (strategy === 'anchorfield-fishing') {
    const anchor = withTarget('anchorfield-loot')
    return { title: '先找赐福，再回锚地开宝藏', note: '赐福位置未知；探索时可以穿过锚地，暂不开沉没宝藏。未找到且灯笼约剩六个时，可开宝藏收尾或换航程。', names,
      steps: [step('先探索，找目标赐福', '探索其余区域，寻找混沌石转神圣石赐福；同组区域无固定先后。', all.filter(i => !anchor.includes(i)), '先探索'),
        step('获得赐福后，返回锚地', '回到锚地开启沉没宝藏。', anchor, '赐福后开宝藏')] }
  }
  if (strategy === 'kishara-boss-rush') {
    const boss = withTarget('kishara-boss')
    return { title: '先击败琪莎拉，再快速完成其余区域', note: '标记的是策略目标；仍需沿实际连接前往。', names,
      steps: [step('先击败 Boss', '前往琪莎拉安息处，击败 Boss。', boss, '先击败 Boss'), step('之后快速完成', '快速完成其他区域。', all.filter(i => !boss.includes(i)), '之后速刷')] }
  }
  if (strategy === 'milky-meatfish' || strategy === 'milky-ethereal') {
    const lanterns = withTarget('golden-lantern')
    const targets = strategy === 'milky-meatfish' ? withTarget('giant-starfish') : withTarget('magic-monster', 'bathyspheres')
    return { title: strategy === 'milky-meatfish' ? '先收集灯笼，再处理强化稀有怪' : '收集灯笼，重点处理魔法怪与潜航球', note: '标记落在实际获得目标的区域；增益供给图本身不一定有可交互目标。同一格可包含两种动作。', names,
      steps: [step('收集黄金灯笼', '先关注实际出现灯笼的区域，取得增益。', lanterns, '收集灯笼'), step('处理策略目标', strategy === 'milky-meatfish' ? '关注巨型海星及强化稀有怪。' : '重点处理魔法怪与感染潜航球。', targets, strategy === 'milky-meatfish' ? '处理强化稀有怪' : '处理魔法怪')] }
  }
  if (strategy === 'divine-border-rares' || strategy === 'cutedog-divine-boxes') {
    const divine = withTarget('rare-divine')
    return { title: '重点处理神圣边界生效区域', note: '重点不等于强制先打；其他区域沿连接顺路处理。', names,
      steps: [step('核心奖励区域', '在神圣边界实际生效格处理稀有怪；有保险箱时，开箱前洗出额外稀有怪。', divine, '神圣边界目标'), step('其余区域顺路处理', '保持航程效率，处理沿途互动。', all.filter(i => !divine.includes(i)), '顺路处理')] }
  }
  if (strategy === 'milky-speedrun') {
    const boxes = withTarget('operative-box', 'diviner-box', 'message-bottle', 'arcanist-box', 'strongbox')
    return { title: '到实际目标区域开箱，开箱前先洗练', note: '中心海图向相邻区域供给目标；中心不是必然的开箱地点，也没有固定九格顺序。', names,
      steps: [step('关注实际开箱区域', '有价值的保险箱先洗练和强化，再开启；漂流瓶按对应互动处理。', boxes, '开箱前洗练'), step('其余区域快速通过', '放灯笼，顺路处理互动后离开。', all.filter(i => !boxes.includes(i)), '快速通过')] }
  }
  return { title: '沿连接探索，处理沿途互动', note: '此策略没有固定九格先后顺序；无须按评分从高到低跑图。', names,
    steps: [step('沿途探索', '放置灯笼，收集零散掉落与硫磺，处理沿途互动。', all, '顺路探索')] }
}

export function VariantA({ guide }: { guide: Guide }) {
  return <div className="proto-inline-guide"><strong>{guide.title}</strong><p>{guide.note}</p></div>
}

export function VariantB({ guide, selected, onSelect }: { guide: Guide; selected: number | null; onSelect: (n: number | null) => void }) {
  return <aside className="proto-action-rail" aria-label="打法清单">
    <strong>这盘怎么打</strong>
    {guide.steps.map((s, n) => <button key={n} className={selected === n ? 'active' : ''} aria-pressed={selected === n} onClick={() => onSelect(selected === n ? null : n)}>
      <small>动作组 {n + 1}</small><b>{s.title}</b><span>{s.detail}</span>
      <em>{s.cells.map(i => POSITIONS[i]).join(' · ') || '当前摆盘没有此目标'}</em>
    </button>)}
    <p>{guide.note}</p><small>点击动作组，在图上定位；再次点击取消高亮。</small>
  </aside>
}

export function VariantC({ guide, stage, onStage }: { guide: Guide; stage: number; onStage: (n: number) => void }) {
  return <div className="proto-stage-guide">
    <div className="proto-stage-tabs" role="group" aria-label="查看打法阶段">{guide.steps.map((s, n) => <button key={n} aria-pressed={stage === n} onClick={() => onStage(n)}>{s.title}</button>)}</div>
    <strong>{guide.steps[stage].detail}</strong>
    <p>{guide.note}</p><small>仅切换提示视图；不代表游戏内进度已完成。</small>
  </div>
}

export function annotations(guide: Guide, variant: Variant, stage: number): ReactNode[] {
  return guide.names.map((name, i) => {
    const steps = guide.steps.filter(s => s.cells.includes(i))
    const actions = variant === 'C' ? steps.filter(s => s === guide.steps[stage]) : steps
    const key = name !== '普通区域'
    return <div className={`proto-cell-note ${key ? 'proto-key-cell' : ''}`}>
      <strong>{key ? name : POSITIONS[i]}</strong>
      {variant !== 'B' && actions.map(s => <span key={s.title} className={guide.steps.indexOf(s) === 0 ? 'proto-action-first' : 'proto-action-after'}>{s.action}</span>)}
    </div>
  })
}
