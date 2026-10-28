import { describe, expect, it, vi } from 'vitest'
import { defaultState, decodeShare, encodeShare } from './storage'
import { selectStrategySolvePool } from './solverPoolSelection'
import { selectPieceBank } from './pieceKeeps'
import { strategyById } from '../data/strategies'
import { createSolveResultContext, isExecutableResult } from './executable'
import { bossConversionConflict, bossPreservation } from './strategyConstraints'
import { solve } from './solver'
import { dedupeNewCharts } from './importDedupe'
import type { ChartData } from '../types'

const chart = (uid: string, areaType: ChartData['areaType'] = 'abyssal-plain'): ChartData =>
  ({ uid, name: '同名', level: 83, edges: [true, true, true, true], areaType, modIds: [] })
const state = () => {
  const s = defaultState()
  s.pool = Array.from({ length: 9 }, (_, i) => chart(String(i)))
  s.board = s.pool.map((c) => ({ chartUid: c.uid, rotation: 0 }))
  s.mode = 'any'
  s.strategyId = 'anchorfield-fishing'
  return s
}

describe('inventory, executable and destination contracts #44 #45 #49 #50 #51', () => {
  it('rejects connected missing/multiple anchors and accepts exactly one; expiry is enforced', () => {
    const s = state(), result = { board: s.board, valid: true, reward: 0, score: 0 }
    const context = () => createSolveResultContext(s, s.pool, Array(9).fill(null), 'strategy')
    expect(isExecutableResult(result, s, context())).toBe(false)
    s.pool[0].areaType = 'anchorfield'
    expect(isExecutableResult(result, s, context())).toBe(true)
    const old = context()
    s.pool[1].areaType = 'anchorfield'
    expect(isExecutableResult(result, s, context())).toBe(false)
    expect(isExecutableResult(result, s, old)).toBe(false)
  })
  it('protects every boss, even locked or with zero keep settings; dedicated strategy permits them', () => {
    const s = state()
    s.pool = [...s.pool, chart('boss1', 'kisharas-rest'), chart('boss2', 'kisharas-rest')]
    const pins = new Set(['boss1', 'boss2'])
    for (const strategy of [null, ...[...strategyById.values()].filter((s) => s.id !== 'kishara-boss-rush')]) {
      expect(selectStrategySolvePool(s.pool, strategy, s.strategyReservations, pins).solvePool.some((c) => c.areaType === 'kisharas-rest')).toBe(false)
    }
    expect(selectPieceBank(s.pool, { 'kishara-boss-rush:all': 0 }, s.strategyReservations).has('boss2')).toBe(true)
    expect(selectStrategySolvePool(s.pool, strategyById.get('kishara-boss-rush')!, s.strategyReservations).solvePool.filter((c) => c.areaType === 'kisharas-rest')).toHaveLength(2)
  })
  it('pending deletion persists, excludes locked materials, and duplicate imports preserve identities and state', () => {
    const s = state()
    s.pool[0] = { ...chart('marked', 'anchorfield'), pendingDeletion: true, rawText: 'same' }
    expect(decodeShare(encodeShare(s))?.pool[0].pendingDeletion).toBe(true)
    expect(selectStrategySolvePool(s.pool, strategyById.get(s.strategyId!)!, s.strategyReservations, new Set(['marked'])).solvePool).not.toContain(s.pool[0])
    const incoming = [{ ...chart('new1'), rawText: 'same' }, { ...chart('new2'), rawText: 'same' }]
    expect(dedupeNewCharts(s.pool, incoming).hits).toEqual([{ uid: 'marked', kind: '已存在' }, { uid: 'new2', kind: '新增' }])
    expect(s.pool[0].pendingDeletion).toBe(true)
  })
  it('refills multiple holes without changing any fixed instance or orientation, and expires on pin changes', () => {
    const s = state(); s.strategyId = null
    s.board[3] = null; s.board[7] = null
    s.board[0]!.rotation = 2
    const locked = s.board.map((p) => p && { ...p })
    let seed = 123
    vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32))
    try {
      const res = solve(s.pool, s.borders, s.weights, { mode: 'strict', allowRotation: true, topK: 3, adjacencyMode: 'physical', adjacentAffectsSelf: false, locked })
      expect(res.length).toBeGreaterThan(0)
      const context = createSolveResultContext(s, s.pool, locked, 'refill')
      for (const r of res) {
        expect(isExecutableResult(r, s, context)).toBe(true)
        locked.forEach((p, i) => { if (p) expect(r.board[i]).toEqual(p) })
      }
      s.board[0]!.rotation = 1
      expect(isExecutableResult(res[0], s, context)).toBe(false)
    } finally { vi.restoreAllMocks() }
  })
})

describe('Boss actual effect scope #46', () => {
  it('checks affected boundaries, adjacency modes and self option; ignores plain gold bonuses', () => {
    const s = state(); s.pool[6].areaType = 'kisharas-rest'
    const map = () => new Map(s.pool.map((c) => [c.uid, c]))
    const opts = { adjacencyMode: 'physical' as const, adjacentAffectsSelf: false }
    s.borders[6] = 'b-gold-1'
    expect(bossConversionConflict(s.board, s.borders, map(), opts)).toBe(true)
    s.borders[6] = null; s.borders[0] = 'b-gold-1'
    expect(bossConversionConflict(s.board, s.borders, map(), opts)).toBe(false)
    s.pool[3].modIds = ['adj-gold-2']
    expect(bossConversionConflict(s.board, s.borders, map(), opts)).toBe(true)
    s.pool[3].edges = [false, false, false, false]
    expect(bossConversionConflict(s.board, s.borders, map(), { ...opts, adjacencyMode: 'connected' })).toBe(false)
    s.pool[3].modIds = []; s.pool[6].modIds = ['adj-gold-1']
    expect(bossConversionConflict(s.board, s.borders, map(), opts)).toBe(false)
    expect(bossConversionConflict(s.board, s.borders, map(), { ...opts, adjacentAffectsSelf: true })).toBe(true)
    s.pool[6].modIds = ['cm-gold-70']; s.borders[6] = 'b-keep-2'; s.borders[11] = 'b-keep-1'
    expect(bossConversionConflict(s.board, s.borders, map(), opts)).toBe(false)
    expect(bossPreservation(s.board, s.borders, map())).toEqual(['边界7：50%', '边界12：30%'])
  })
})
