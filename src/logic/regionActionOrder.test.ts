import { describe, expect, it } from 'vitest'
import { regionActionOrder } from './regionActionOrder'
import { regionTargets } from './regionTargets'
import { emptyBorders, type Board, type ChartData } from '../types'

const pool: ChartData[] = Array.from({ length: 9 }, (_, i) => ({
  uid: `action-${i}`, name: `区域 ${i + 1}`, level: 83,
  edges: [true, true, true, true], modIds: [],
  areaType: i === 0 ? 'anchorfield' : 'abyssal-plain',
}))
const board: Board = pool.map(chart => ({ chartUid: chart.uid, rotation: 0 }))
const charts = new Map(pool.map(chart => [chart.uid, chart]))
const derive = (layout = board, inventory = charts) => regionActionOrder(
  layout, inventory, 'anchorfield-fishing',
  regionTargets(layout, emptyBorders(), inventory, 'anchorfield-fishing'),
)

describe('打法顺序的公共只读投影', () => {
  it('按旋转后的转角与单线绕行，不穿越未匹配连接', () => {
    const edges: ChartData['edges'][] = [
      [false, true, true, false], [false, true, false, true], [false, false, false, true],
      [true, true, false, false], [false, true, false, true], [false, false, true, true],
      [false, true, false, false], [true, false, true, false], [true, false, false, true],
    ]
    const inventory = new Map(pool.map((chart, i) => [chart.uid, { ...chart, edges: edges[i] }]))
    const snake = structuredClone(board)
    snake[7]!.rotation = 1
    expect(derive(snake, inventory).actions.map(action => action.cell)).toEqual([6, 7, 8, 0])
    snake[7]!.rotation = 0
    const broken = derive(snake, inventory)
    expect(broken.actions.map(action => action.cell)).toEqual([6])
    expect(broken.conditions).toEqual([{ cell: 0, label: '锚地', condition: '赐福后开' }])
  })
  it('没有探索路径、起点或库存引用时仅保留锚地条件，不制造第一步开箱', () => {
    const anchor = { ...pool[0], edges: [false, false, false, false] as ChartData['edges'] }
    const inventory = new Map([[anchor.uid, anchor]])
    const alone: Board = Array(9).fill(null)
    alone[6] = { chartUid: anchor.uid, rotation: 0 }
    expect(derive(alone, inventory).actions).toEqual([])
    expect(derive(alone, inventory).conditions).toEqual([{ cell: 6, label: '锚地', condition: '赐福后开' }])
    for (const placement of [null, { chartUid: 'lost-reference', rotation: 0 }]) {
      const missing = structuredClone(board)
      missing[6] = placement
      expect(derive(missing).actions).toEqual([])
      expect(derive(missing).conditions).toEqual([{ cell: 0, label: '锚地', condition: '赐福后开' }])
    }
    expect(derive(Array(9).fill(null)).actions).toEqual([])
    expect(regionActionOrder(board, charts, null, regionTargets(board, emptyBorders(), charts, null)).actions).toEqual([])
  })
  it('最近连通候选稳定打破平局，保留锚地名额且不改变输入', () => {
    const before = structuredClone({ board, pool })
    const result = derive()
    expect(result.actions.map(({ cell, order, label, condition }) => ({ cell, order, label, condition }))).toEqual([
      { cell: 6, order: 1, label: '找赐福', condition: undefined },
      { cell: 3, order: 2, label: '找赐福', condition: undefined },
      { cell: 4, order: 3, label: '找赐福', condition: undefined },
      { cell: 0, order: 4, label: '锚地', condition: '赐福后开' },
    ])
    expect(derive()).toEqual(result)
    expect({ board, pool }).toEqual(before)
  })
})
