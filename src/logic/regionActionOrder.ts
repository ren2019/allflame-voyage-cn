import type { Board, ChartData } from '../types'
import { START_CELL } from '../types'
import { rotateEdges } from './connectivity'
import type { RegionalCell } from './regionTargets'

export interface RegionAction {
  cell: number
  order: number
  label: string
  condition?: string
}
export interface RegionCondition {
  cell: number
  label: string
  condition: string
}
export interface RegionActionOrder {
  actions: RegionAction[]
  conditions: RegionCondition[]
  note: string | null
}

/** Actual sailing distances, independent of experimental solver connectivity settings.
 * Missing charts and unmatched connectors never provide a traversable edge. */
function matchedConnectionDistances(
  board: Board,
  charts: Map<string, ChartData>,
  from: number,
): number[] {
  const distances = Array<number>(9).fill(Infinity)
  const edges = board.slice(0, 9).map(placement => {
    const chart = placement && charts.get(placement.chartUid)
    return chart && placement ? rotateEdges(chart.edges, placement.rotation) : null
  })
  if (!edges[from]) return distances
  distances[from] = 0
  const queue = [from]
  for (const i of queue) {
    const row = Math.floor(i / 3), col = i % 3
    for (const direction of [
      { dr: -1, dc: 0, edge: 0, opp: 2 },
      { dr: 0, dc: 1, edge: 1, opp: 3 },
      { dr: 1, dc: 0, edge: 2, opp: 0 },
      { dr: 0, dc: -1, edge: 3, opp: 1 },
    ]) {
      const nr = row + direction.dr, nc = col + direction.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue
      const next = nr * 3 + nc
      if (distances[next] !== Infinity || !edges[i]?.[direction.edge] || !edges[next]?.[direction.opp]) continue
      distances[next] = distances[i] + 1
      queue.push(next)
    }
  }
  return distances
}

/** Read-only advice from existing destinations/targets and actual sailing connections.
 * Action order is independent of scoring, icon filters and copied placement order. */
export function regionActionOrder(
  board: Board,
  charts: Map<string, ChartData>,
  strategyId: string | null,
  targets: RegionalCell[],
): RegionActionOrder {
  const actions: RegionAction[] = []
  const result: RegionActionOrder = { actions, conditions: [], note: null }
  if (strategyId !== 'anchorfield-fishing') return result
  const occupied = board.flatMap((placement, cell) =>
    cell < 9 && placement && charts.has(placement.chartUid) ? [cell] : [],
  )
  const anchors = occupied.filter(cell => targets[cell]?.targets.some(target => target.id === 'anchorfield-loot'))
  result.conditions = anchors.map(cell => ({ cell, label: '锚地', condition: '赐福后开' }))
  if (anchors.length === 0) return result
  result.note = '找赐福仅为探索建议，赐福位置随机；可经过锚地暂不开宝藏，确认获得目标赐福后再开。编号是行动顺序，不是评分或放置顺序。'
  let reference = START_CELL
  const addNearest = (candidates: number[], limit: number, label: string, condition?: string) => {
    const remaining = new Set(candidates)
    while (remaining.size > 0 && actions.length < 4 && limit-- > 0) {
      const distances = matchedConnectionDistances(board, charts, reference)
      const next = [...remaining].filter(cell => Number.isFinite(distances[cell]))
        .sort((a, b) => distances[a] - distances[b] || a - b)[0]
      if (next === undefined) break
      actions.push({ cell: next, order: actions.length + 1, label, ...(condition ? { condition } : {}) })
      reference = next
      remaining.delete(next)
    }
  }
  addNearest(occupied.filter(cell => !anchors.includes(cell)), 3, '找赐福')
  // Exploration is a prerequisite, including when the anchor happens to be the start.
  if (actions.length > 0) addNearest(anchors, 1, '锚地', '赐福后开')
  result.conditions = result.conditions.filter(condition => !actions.some(action => action.cell === condition.cell && action.condition))
  return result
}
