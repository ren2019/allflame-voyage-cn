import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import upstream from './fixtures/acceptance/strategy-rules.upstream.json'
import { STRATEGIES, applyCenterChoice, strategyById } from '../src/data/strategies'
import { borderModById, voyageModById } from '../src/data/mods'
import { checkConnectivity } from '../src/logic/connectivity'
import { selectStrategySolvePool } from '../src/logic/solverPoolSelection'
import { solve } from '../src/logic/solver'
import { DEFAULT_WEIGHTS } from '../src/logic/rewards'
import type { AppState } from '../src/logic/storage'

const names = ['strategy-alc', 'strategy-anchor', 'strategy-speedrun', 'strategy-meatfish', 'strategy-ethereal', 'strategy-divine-rares', 'strategy-divine-boxes']
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/acceptance/${name}.json`, import.meta.url), 'utf8'))
const displayFields = new Set(['name', 'badge', 'tagline', 'source', 'guide', 'label', 'hint', 'waitHint', 'searchRegex', 'extraLinks'])
function mechanicFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mechanicFields)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !displayFields.has(key)).map(([key, entry]) => [key, mechanicFields(entry)]))
  return value
}

describe('seven fixed strategy inventories and independent feasible witnesses', () => {
  it('keeps every original strategy ID, weight, rule, layout, cap and material count', () => {
    // Preserve the upstream snapshot while testing the authorized local
    // hard constraint separately from unchanged original mechanics.
    const original = STRATEGIES.filter((s) => s.id !== 'kishara-boss-rush')
    expect(original.map(({ destinationCounts: _localConstraint, ...s }) => mechanicFields(s))).toEqual(upstream.strategies)
    expect(strategyById.get('anchorfield-fishing')?.destinationCounts).toEqual([{ areaType: 'anchorfield', count: 1 }])
    expect(strategyById.get('kishara-boss-rush')?.destinationCounts).toEqual([{ areaType: 'kisharas-rest', count: 1 }])
    expect(DEFAULT_WEIGHTS).toEqual(fixture('strategy-alc').weights)
  })

  for (const name of names) {
    const state: AppState = fixture(name)
    const expected = fixture(`${name}.expected`)
    const strategy = applyCenterChoice(strategyById.get(state.strategyId!)!, state.centerChoice[state.strategyId!])
    const locked = state.board.map((p) => p && state.pool.find((c) => c.uid === p.chartUid)?.preserved ? p : null)
    const { solvePool } = selectStrategySolvePool(state.pool, strategy, state.strategyReservations,
      new Set(locked.filter(Boolean).map((p) => p!.chartUid)), state.pieceKeeps)
    const charts = new Map(solvePool.map((chart) => [chart.uid, chart]))
    it(`${name} has nine eligible instances and an independently verified strict witness`, () => {
      expect(state.pool.map((c) => c.uid)).toEqual(expected.initialUids)
      expect(new Set(expected.witness.map((p: { chartUid: string }) => p.chartUid)).size).toBe(9)
      expect(solvePool).toHaveLength(9)
      expect(expected.witness.every((p: { chartUid: string }) => charts.has(p.chartUid))).toBe(true)
      expect(checkConnectivity(expected.witness, charts, 'strict')).toEqual({ valid: true, violations: 0, mismatches: 0, unfilled: 0, disconnected: 0, connections: expected.connections })
      for (const chart of state.pool) for (const id of chart.modIds) expect(voyageModById.has(id)).toBe(true)
      for (const id of state.borders.filter(Boolean)) expect(borderModById.has(id!)).toBe(true)
      for (const requirement of expected.requirements) {
        const have = state.pool.filter((chart) => requirement.modIds?.some((id: string) => chart.modIds.includes(id)) || requirement.areaTypes?.includes(chart.areaType)).length
        expect(have).toBeGreaterThanOrEqual(requirement.count)
      }
      if (expected.requiresBorder) expect(state.borders).toContain(expected.requiresBorder)
      for (const pin of expected.locked) expect(expected.witness[pin.cell]).toEqual(pin.placement)
    })

    it(`${name} solves without requiring a unique optimum and preserves the actual pinned instance and rotation`, () => {
      const layout = strategy.layouts?.find((layout) => layout.id === state.layoutChoice[strategy.id]) ?? strategy.layouts?.[0]
      const results = solve(solvePool, state.borders, strategy.weights, {
        mode: state.mode, allowRotation: state.allowRotation, adjacencyMode: state.adjacencyMode,
        adjacentAffectsSelf: state.adjacentAffectsSelf, disabledMods: new Set(state.disabledMods), topK: 5,
        strategyRules: strategy.rules, strategyLayout: layout?.layout ?? strategy.layout,
        strategyLayoutPenalty: strategy.layoutPenalty, locked,
      })
      const executable = results.filter((result) => result.valid)
      expect(executable.length).toBeGreaterThan(0)
      for (const result of executable) {
        expect(result.board.filter(Boolean)).toHaveLength(9)
        expect(new Set(result.board.map((p) => p!.chartUid)).size).toBe(9)
        expect(result.board.every((p) => charts.has(p!.chartUid))).toBe(true)
        expect(checkConnectivity(result.board, charts, state.mode).valid).toBe(true)
        for (const pin of expected.locked) expect(result.board[pin.cell]).toEqual(pin.placement)
      }
    }, 30000)
  }
})
