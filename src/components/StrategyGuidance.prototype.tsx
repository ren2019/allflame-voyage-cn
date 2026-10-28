// THROWAWAY: sparse numbered actions inside the regional-target overlay.
import { rotateEdges } from '../logic/connectivity'
import type { Board, Borders, ChartData } from '../types'
import { regionTargets } from '../logic/regionTargets'
import { destinationLabel } from '../data/localization'

export const POSITIONS = ['左上', '上中', '右上', '左中', '中心', '右中', '左下', '下中', '右下']
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

export interface PriorityStop { cell: number; number: number; label: string; detail: string; conditional?: boolean }

/** Demo ordering only: known action dependencies, then nearby connected candidates.
 * Neither per-tile score nor unknown random encounter locations are used. */
export function priorityStops(strategy: string, board: Board, borders: Borders, charts: Map<string, ChartData>): PriorityStop[] {
  const guide = makeGuide(strategy, board, borders, charts)
  const targets = regionTargets(board, borders, charts, strategy)
  const occupied = board.flatMap((p, i) => p && charts.has(p.chartUid) ? [i] : [])
  const edges = (i: number) => {
    const p = board[i], c = p && charts.get(p.chartUid)
    return p && c ? rotateEdges(c.edges, p.rotation) : null
  }
  const distance = (from: number, to: number) => {
    const queue = [{ cell: from, distance: 0 }], seen = new Set([from])
    for (const item of queue) {
      if (item.cell === to) return item.distance
      const edge = edges(item.cell)
      if (!edge) continue
      const row = Math.floor(item.cell / 3), col = item.cell % 3
      const neighbors = [row > 0 ? item.cell - 3 : -1, col < 2 ? item.cell + 1 : -1, row < 2 ? item.cell + 3 : -1, col > 0 ? item.cell - 1 : -1]
      neighbors.forEach((next, direction) => {
        if (next < 0 || seen.has(next) || !edge[direction] || !edges(next)?.[(direction + 2) % 4]) return
        seen.add(next); queue.push({ cell: next, distance: item.distance + 1 })
      })
    }
    return Infinity
  }
  let current = 6
  const stops: PriorityStop[] = []
  const addNearby = (candidates: number[], limit: number, label: string, detail: string) => {
    const remaining = [...new Set(candidates)]
    for (let n = 0; n < limit && remaining.length; n++) {
      remaining.sort((a, b) => distance(current, a) - distance(current, b) || a - b)
      const cell = remaining.shift()!
      if (!Number.isFinite(distance(current, cell))) break
      stops.push({ cell, number: stops.length + 1, label, detail }); current = cell
    }
  }
  if (strategy === 'anchorfield-fishing') {
    const anchor = guide.steps[1].cells
    // These are exploration suggestions, never predictions that a blessing exists there.
    addNearby(occupied.filter(i => !anchor.includes(i)), 3, '找赐福', '建议先探索这里，寻找混沌转神圣赐福；赐福随机出现，不保证此格有赐福。')
    if (anchor.length && Number.isFinite(distance(current, anchor[0]))) stops.push({ cell: anchor[0], number: stops.length + 1, label: '锚地', detail: '取得目标赐福后返回，开启沉没宝藏；途经可穿过，暂不开宝藏。', conditional: true })
  } else if (strategy === 'kishara-boss-rush') {
    addNearby(guide.steps[0].cells, 1, '琪莎拉 Boss', '先击败琪莎拉 Boss，再快速完成其他区域。')
  } else if (strategy === 'milky-meatfish' || strategy === 'milky-ethereal') {
    addNearby(guide.steps[0].cells, 2, '收集灯笼', '先取得黄金灯笼增益；同一区域可能还需要稍后处理强化怪物。')
    addNearby(guide.steps[1].cells, 2, strategy === 'milky-meatfish' ? '强化稀有怪' : '魔法怪', '取得增益后处理本区域的策略目标。')
  } else if (strategy === 'milky-speedrun') {
    addNearby(guide.steps[0].cells, 4, '开保险箱', '到实际收到保险箱的区域，先洗练强化，再开启。')
  } else if (strategy === 'divine-border-rares' || strategy === 'cutedog-divine-boxes') {
    addNearby(guide.steps[0].cells, 4, '神圣目标', '处理神圣边界实际生效区域的稀有怪；有保险箱时先洗练。')
  } else if (strategy === 'alc-and-go') {
    addNearby(targets.flatMap((c, i) => c.targets.some(t => t.weight >= 75) ? [i] : []), 4, '沿途目标', '顺路处理已识别的重要目标。')
  }
  return stops
}

export function NumberedTarget({ stop }: { stop: PriorityStop }) {
  return <div className={`proto-numbered-target${stop.conditional ? ' conditional' : ''}`} data-order={stop.number} aria-label={`第 ${stop.number} 个建议：${stop.label}${stop.conditional ? '，赐福后开' : ''}`} title={stop.detail}>
    <span className="proto-order-number">{stop.number}</span>
    <span className="proto-order-copy"><b>{stop.label}</b>{stop.conditional && <small>赐福后开</small>}</span>
  </div>
}
