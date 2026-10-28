import type { Borders, ChartData, Weights } from '../types'
import { borderTouches } from '../types'
import { solve, type SolverOptions, type SolverResult } from './solver'

/** Separate searches preserve hard legality while ordering opportunities by tier. */
export function solveBossCandidates(pool: ChartData[], borders: Borders, weights: Weights, options: SolverOptions) {
  const search = (cells?: number[]) => solve(pool, borders, weights, { ...options, bossCells: cells })
  const legal = (results: SolverResult[]) => results.filter((r) => r.valid && r.board.every(Boolean))
  const keepCells = (id: string) => [...new Set(borders.flatMap((border, i) => border === id ? [borderTouches(i)] : []))]
  const fiftyCells = keepCells('b-keep-2'), thirtyCells = keepCells('b-keep-1')
  const fifty = fiftyCells.length ? legal(search(fiftyCells)) : []
  const thirty = thirtyCells.length ? legal(search(thirtyCells)) : []
  const start = legal(search([6]))
  const preferred = fifty.length ? fifty : thirty.length ? thirty : start
  const fallback = preferred.length ? [] : search()
  const ordered = [...preferred, ...fifty.slice(0, 1), ...thirty.slice(0, 1), ...start.slice(0, 1), ...fallback]
  const seen = new Set<string>()
  const results = ordered.filter((r) => {
    const key = r.board.map((p) => p ? `${p.chartUid}:${p.rotation}` : '_').join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const notes: string[] = []
  if (fifty.length) notes.push('本次优先采用实际接触50%保图边界的合法方案；概率按各边界来源分别显示。')
  else if (thirty.length) notes.push(`${fiftyCells.length ? '本次搜索未找到合法50%保图方案，已回退' : '本次优先采用'}30%保图方案。`)
  else if (fiftyCells.length || thirtyCells.length) notes.push('本次搜索未找到满足连接、锁定及转金币限制的保图方案，已回退速刷搜索；未解除锁定。')
  if (!fifty.length && !thirty.length && !start.length && legal(fallback).length) notes.push('本次搜索未找到合法左下摆法，Boss 已改用其他合法位置。')
  return { results, notes }
}
