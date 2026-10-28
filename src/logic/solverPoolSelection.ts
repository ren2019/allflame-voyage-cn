import {
  defaultStrategyReservations,
  type StrategyDef,
  type StrategyReservationPreferences,
} from '../data/strategies'
import { rewardSum, selectPieceBank, strategyWantsChart } from './pieceKeeps'
import type { ChartData } from '../types'

type StrategyReservations = {
  /** strategy id - a banked chart is spendable only by its owning strategy */
  id?: string
} & Pick<StrategyDef, 'allowRareImplicits' | 'allowFractureCharts' | 'reservationGroups' | 'limits' | 'destinationCounts'>

/**
 * The solve pool under the "keep X of each piece type" model: the bank holds
 * the best X charts of every recommended piece type for its strategy (X from
 * the user's keep counts, defaulting to the strategy's requirement counts).
 * A banked chart is spendable only by the strategy it's banked for; everything
 * outside the bank is an ordinary spendable chart, whatever its mods.
 */
export function selectStrategySolvePool(
  pool: ChartData[],
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
  lockedUids: ReadonlySet<string> = new Set(),
  pieceKeeps: Record<string, number> = {},
): { solvePool: ChartData[]; heldBack: number; heldBackFor: string[] } {
  const bank = selectPieceBank(pool, pieceKeeps, preferences)

  const heldFor = new Set<string>()
  let solvePool = pool.filter((chart) => {
    if (chart.pendingDeletion) { heldFor.add('待删除清理'); return false }
    if (chart.areaType === 'kisharas-rest' && strategy?.id !== 'kishara-boss-rush') {
      heldFor.add('琪莎拉 Boss 速刷（全部保护）')
      return false
    }
    // Boss fillers must never consume Anchorfield materials, even surplus,
    // custom keep-count overrides or pinned charts.
    if (strategy?.id === 'kishara-boss-rush' && chart.areaType === 'anchorfield') {
      heldFor.add('锚地赐福（全部锚地保护）')
      return false
    }
    if (strategy?.id === 'kishara-boss-rush' && chart.modIds.includes('voy-noequip')) {
      heldFor.add('Boss装备掉落安全限制')
      return false
    }
    if (lockedUids.has(chart.uid)) return true
    const owner = bank.get(chart.uid)
    if (!owner || owner.strategyId === strategy?.id) return true
    // banked pieces stay usable by any strategy that wants the same type
    // (Divine banking your Starfish must not lock Meatfish out of them)
    if (strategyWantsChart(strategy?.id, chart)) return true
    heldFor.add(owner.strategyName)
    return false
  })

  // hard caps (issue #49): a strategy that needs exactly ONE of something
  // gets exactly one - the best `max` matching charts stay, the rest never
  // reach the solver. Manually locked charts always stay and count toward
  // the cap.
  for (const limit of strategy?.limits ?? []) {
    // Exact output constraints must retain alternative shapes/instances for
    // feasibility; selecting the highest reward instance here can erase a solution.
    if (limit.areaTypes?.some((area) => strategy?.destinationCounts?.some((r) => r.areaType === area))) continue
    const matches = (c: ChartData) =>
      (limit.modIds?.some((id) => c.modIds.includes(id)) ?? false) ||
      (limit.areaTypes && c.areaType ? limit.areaTypes.includes(c.areaType) : false)
    const matching = solvePool.filter(matches)
    if (matching.length <= limit.max) continue
    const lockedCount = matching.filter((c) => lockedUids.has(c.uid)).length
    const keep = new Set(
      matching
        .filter((c) => !lockedUids.has(c.uid))
        .sort((a, b) => rewardSum(b) - rewardSum(a) || b.level - a.level)
        .slice(0, Math.max(0, limit.max - lockedCount))
        .map((c) => c.uid),
    )
    solvePool = solvePool.filter(
      (c) => !matches(c) || lockedUids.has(c.uid) || keep.has(c.uid),
    )
  }

  return {
    solvePool,
    heldBack: pool.length - solvePool.length,
    heldBackFor: [...heldFor],
  }
}
