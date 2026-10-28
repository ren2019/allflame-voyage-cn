import { describe, expect, it } from 'vitest'
import type { ChartAreaType, ChartData } from '../types'
import { emptyBorders } from '../types'
import { solve } from './solver'

function chart(uid: string, name: string, areaType: ChartAreaType): ChartData {
  return {
    uid,
    name,
    level: 83,
    edges: [false, false, false, false],
    areaType,
    modIds: [],
  }
}

describe('strategy destination rules', () => {
  it('places a canonical Sea Pillars chart without relying on its localized name', () => {
    const seaPillars = chart('sea-pillars', '해병 고역 산호 암초 해도', 'sea-pillars')
    const nameImpostor = chart('impostor', 'Pelagic Pillar Chart', 'undersea-groves')

    const [best] = solve([seaPillars, nameImpostor], emptyBorders(), {}, {
      mode: 'any',
      allowRotation: false,
      adjacencyMode: 'physical',
      adjacentAffectsSelf: false,
      topK: 1,
      strategyRules: [{ cells: [4], areaTypes: ['sea-pillars'], bonus: 100 }],
    })

    expect(best.board[4]?.chartUid).toBe('sea-pillars')
  })
})


describe('exact destination constraint (#45)', () => {
  const options = { mode: 'any' as const, allowRotation: false, topK: 2,
    adjacencyMode: 'physical' as const, adjacentAffectsSelf: false,
    destinationCounts: [{ areaType: 'anchorfield' as const, count: 1 }] }
  const ordinary = Array.from({ length: 8 }, (_, i) => chart(`plain-${i}`, '普通', 'abyssal-plain'))
  it('finds legal candidates containing the required actual instance', () => {
    const results = solve([...ordinary, chart('anchor', '锚地', 'anchorfield')], emptyBorders(), {}, options)
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.valid).toBe(true)
      expect(result.board.filter((p) => p?.chartUid === 'anchor')).toHaveLength(1)
    }
  })
  it('rejects missing material and conflicting locked instances', () => {
    expect(solve(ordinary, emptyBorders(), {}, options)).toEqual([])
    const anchors = [chart('a', '同名', 'anchorfield'), chart('b', '同名', 'anchorfield')]
    expect(solve([...ordinary, ...anchors], emptyBorders(), {}, { ...options,
      locked: [{ chartUid: 'a', rotation: 0 }, { chartUid: 'b', rotation: 0 }, ...Array(7).fill(null)] })).toEqual([])
  })
})
