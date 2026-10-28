import { borderModById, voyageModById } from '../data/mods'
import { borderTouches, type Board, type Borders, type ChartData } from '../types'
import { boardEffectScope } from './effectScope'
import type { ScoreOptions } from './scoring'

export const BOSS_STRATEGY = 'kishara-boss-rush'
const conversionMods = new Set(['adj-gold-1', 'adj-gold-2'])
const conversionBorders = new Set(['b-gold-1', 'b-gold-2'])

/** Safety uses actual effects even when their scoring weights are disabled. */
export function bossConversionConflict(board: Board, borders: Borders, charts: Map<string, ChartData>, opts: ScoreOptions): boolean {
  const boss = board.findIndex((p) => p && charts.get(p.chartUid)?.areaType === 'kisharas-rest')
  if (boss < 0) return false
  if (borders.some((id, segment) => id && conversionBorders.has(id) && borderTouches(segment) === boss)) return true
  const scope = boardEffectScope(board, charts, opts)
  return board.some((p, i) => p && charts.get(p.chartUid)?.modIds.some((id) => {
    const mod = voyageModById.get(id)
    return conversionMods.has(id) && mod && scope.targets(i, mod.scope).includes(boss)
  }))
}

export function bossPreservation(board: Board, borders: Borders, charts: Map<string, ChartData>): string[] {
  const boss = board.findIndex((p) => p && charts.get(p.chartUid)?.areaType === 'kisharas-rest')
  if (boss < 0) return []
  return borders.flatMap((id, segment) => id && borderTouches(segment) === boss
    ? (borderModById.get(id)?.effects ?? []).filter((e) => e.stat === 'preserve' && e.percent > 0).map((e) => `边界${segment + 1}：${e.percent}%`) : [])
}
