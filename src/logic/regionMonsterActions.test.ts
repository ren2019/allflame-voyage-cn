import { describe, expect, it } from 'vitest'
import { regionActionOrder } from './regionActionOrder'
import { regionTargets } from './regionTargets'
import { emptyBorders, type Board, type ChartData } from '../types'

const pool: ChartData[] = Array.from({ length: 9 }, (_, i) => ({
  uid: `monster-${i}`, name: `区域 ${i + 1}`, level: 83,
  edges: [true, true, true, true],
  modIds: i === 4 ? ['adj-lantern', 'adj-star-1', 'adj-rare-1', 'adj-magic-1'] : [],
  areaType: i === 1 ? 'infested-bathyspheres' : 'abyssal-plain',
}))
const board: Board = pool.map(chart => ({ chartUid: chart.uid, rotation: 0 }))
const derive = (strategy: string, inventory = pool, layout = board) => {
  const charts = new Map(inventory.map(chart => [chart.uid, chart]))
  return regionActionOrder(layout, charts, strategy,
    regionTargets(layout, emptyBorders(), charts, strategy))
}

describe('灯笼优先的两阶段行动公共投影', () => {
  it('先取两个实际灯笼再选两个怪物，允许同格前后行动且四项截断不改输入', () => {
    const before = structuredClone({ pool, board })
    expect(derive('milky-meatfish').actions).toEqual([
      { cell: 3, order: 1, label: '收黄金灯笼' },
      { cell: 1, order: 2, label: '收黄金灯笼' },
      { cell: 1, order: 3, label: '处理巨型海星' },
      { cell: 3, order: 4, label: '处理巨型海星' },
    ])
    expect({ pool, board }).toEqual(before)
  })
})
