// Curated strategies. Each one overrides the user's reward weights and adds
// position rules that shape what the solver suggests while it is active.
//
// First set is from Milkybk_'s "Curse of the Allflame Buffs and My Strategy"
// (https://www.youtube.com/watch?v=gVKQhYxeavk) - transcribed and encoded
// 2026-07-28. His approach is deliberately all-or-nothing: run the speedrun
// board with spare charts until you've collected the pieces for a juiced one.

import type { ChartAreaType, Edges, Stat, Weights } from '../types'

export const STRATEGY_RESERVATION_OPTIONS = [
  { id: 'divine', label: "神圣石策略" },
  { id: 'meatfish', label: "稀有怪传说装" },
  { id: 'ethereal', label: "魔法怪流" },
] as const

export type StrategyReservationId = (typeof STRATEGY_RESERVATION_OPTIONS)[number]['id']
export type StrategyReservationPreferences = Record<StrategyReservationId, boolean>

export const defaultStrategyReservations = (): StrategyReservationPreferences => ({
  divine: true,
  meatfish: true,
  ethereal: true,
})

export interface StrategyReservationGroup {
  id: StrategyReservationId
  label: string
  modIds?: string[]
  areaTypes?: ChartAreaType[]
}

export interface PositionRule {
  /** board cells this rule targets (row-major, 4 = centre) */
  cells?: number[]
  /** or resolve cells dynamically: tiles touched by border segments rolled
   *  with this border mod id (e.g. put a chart ON the Divine-border tile) */
  nearBorderId?: string
  /** with nearBorderId: target the NEIGHBOURS of the border tile instead */
  adjacentToBorder?: boolean
  /** chart implicit mod ids that satisfy the rule */
  modIds?: string[]
  /** or match one of these canonical Chart destination/area types */
  areaTypes?: ChartAreaType[]
  /** or a header reward stat, scored as percent/100 × per */
  rewardStat?: { stat: Stat; per: number }
  /** objective bonus per matching placement */
  bonus: number
}

export interface StrategyDef {
  id: string
  name: string
  /** highlight chip on the strategy card (e.g. 'NEW') */
  badge?: string
  tagline: string
  source: { label: string; url: string }
  /** the video's guidance, shown on the expanded card */
  guide: string[]
  /** reward-weight override while active (unlisted rewards count as 0) */
  weights: Weights
  rules: PositionRule[]
  /** exact connector layout to build (effective edges [N,E,S,W] per cell after
   *  rotation) - the solver treats any deviation as a heavy penalty */
  layout?: Edges[]
  /** per-cell cost of deviating from the layout. Default is strict (300);
   *  a small value makes the lines a soft preference that yields to the
   *  position rules (piece locations matter more than exact lines) */
  layoutPenalty?: number
  /** selectable layout shapes (first = default); shown as a picker on the
   *  strategy card, the choice persists per strategy */
  layouts?: { id: string; label: string; hint: string; layout: Edges[] }[]
  /** Optional keeper groups excluded while this strategy is active. Users can
   *  enable each group independently in the solver controls. */
  reservationGroups?: StrategyReservationGroup[]
  /** pieces the strategy needs before it's worth running; if the library
   *  can't supply them the UI says to avoid this voyage and wait */
  requirements?: {
    modIds?: string[]
    areaTypes?: ChartAreaType[]
    count: number
    label: string
  }[]
  /** explicit 🔖 keep-wizard chart types; when present they replace the
   *  requirement-derived ones, so banking can be more granular than
   *  readiness (issue #21: split Starfish from boxes, box types from each
   *  other, voyage rares from adjacent rares). keep = default bank count. */
  bankTypes?: {
    label: string
    modIds?: string[]
    areaTypes?: ChartAreaType[]
    keep: number
  }[]
  /** a border roll the strategy hinges on (readiness warns if not entered) */
  requiresBorderId?: { id: string; label: string }
  /** selectable centre-piece family (first = default "best available");
   *  shown as a picker on the card, the choice persists per strategy and
   *  reshapes the centre rules + readiness (issue #49) */
  centerOptions?: { id: string; label: string; modIds: string[] }[]
  /** hard caps on the solve pool: only the best `max` matching charts are
   *  offered to the solver (e.g. Anchorfield Fishing boards exactly ONE
   *  Anchorfield however many the library holds - issue #49) */
  destinationCounts?: { areaType: ChartAreaType; count: number }[]
  limits?: { modIds?: string[]; areaTypes?: ChartAreaType[]; max: number }[]
  /** what to do instead while pieces are missing */
  waitHint?: string
  /** this strategy is allowed to place rare-implicit charts (Divine strats) */
  allowRareImplicits?: boolean
  /** this strategy is allowed to place Rare Fracture charts (Meatfish) */
  allowFractureCharts?: boolean
  /** Milky's in-game search string highlighting this strategy's keeper charts */
  searchRegex?: string
  /** extra links shown on the card (trade searches, guides) */
  extraLinks?: { label: string; url: string }[]
}

/** rare-monster implicit charts are Divine-strategy fuel: nothing else may
 *  use them (the solver holds them back everywhere except the Divine strats) */
export const RARE_IMPLICITS = ['adj-rare-1', 'adj-rare-2', 'voy-rare'] as const

/** Rare Fracture charts are Meatfish fuel: fracturing multiplies the giga-rare
 *  farm, so only Meatfish may spend them (held back everywhere else) */
export const MEATFISH_FUEL = ['voy-fracture'] as const

/** Milky's master keeper regex - every mod worth saving, across all strats */
export const ALL_GOOD_MODS_REGEX =
  '"至少为魔法|无法掉落|被附身|分裂|瓶中信|神圣的秘宝|奥术师|侦探|巨型海星|众神词缀|腰带|黄金灯笼|4000.*鬼灵|保险箱|所有航行区域的稀有怪物数量|所有航行区域中找到的亡者硫磺"'

const CENTER = [4]
const EDGES = [1, 3, 5, 7]

// Milky's exact Meatfish board (from his planner, screenshotted 2026-07-28):
// corners at 0/2/7... rendered as effective edges [N,E,S,W] per cell.
// 10 connections, all linked to the ⚓ start; cell 6's south arm dangles off-board.
const T = true
const F = false
const MEATFISH_LAYOUT: Edges[] = [
  [F, T, T, F], // 0 corner
  [F, T, T, T], // 1 T-junction
  [F, F, T, T], // 2 corner
  [T, F, T, F], // 3 straight
  [T, T, T, F], // 4 T-junction
  [T, F, T, T], // 5 T-junction
  [T, F, T, F], // 6 straight (start; south dangles off-board)
  [T, T, F, F], // 7 corner
  [T, F, F, T], // 8 corner
]

// Milky's exact Magic Ethereal board: a full cross at centre, 11 connections;
// cells 6 and 7 have south arms dangling off-board.
const ETHEREAL_LAYOUT: Edges[] = [
  [F, T, T, F], // 0 corner
  [F, T, T, T], // 1 T-junction
  [F, F, T, T], // 2 corner
  [T, T, T, F], // 3 T-junction
  [T, T, T, T], // 4 crossing
  [T, F, T, T], // 5 T-junction
  [T, F, T, F], // 6 straight (start)
  [T, T, T, F], // 7 T-junction
  [T, F, F, T], // 8 corner
]

// the ONE chart Speedrun puts in the centre: Diviner's / Operative's boxes or
// Messages in a Bottle (Arcanist's and generic boxes don't qualify)
export const SPEEDRUN_CENTER_MODS = [
  'adj-divbox-1', 'adj-divbox-2',
  'adj-opbox-1', 'adj-opbox-2',
  'adj-msg-1', 'adj-msg-2',
]
const NOT_CENTER = [0, 1, 2, 3, 5, 6, 7, 8]

const MEATFISH_RESERVATION: StrategyReservationGroup = {
  id: 'meatfish',
  label: "稀有怪传说装",
  modIds: [
    'adj-star-1',
    'adj-star-2',
    'adj-pantheon',
    'adj-lantern',
    'voy-possess',
    'voy-fracture',
    'voy-noequip',
    'adj-wisps-1',
    'adj-wisps-2',
  ],
  areaTypes: ['sea-pillars'],
}

const ETHEREAL_RESERVATION: StrategyReservationGroup = {
  id: 'ethereal',
  label: "魔法怪流",
  modIds: [
    'adj-lantern',
    'voy-noequip',
    'adj-wisps-1',
    'adj-wisps-2',
    'adj-magic-1',
    'adj-magic-2',
    'voy-minmagic',
  ],
}

const DIVINE_RESERVATION_MODS = [
  ...RARE_IMPLICITS,
  'adj-star-1',
  'adj-star-2',
  'adj-box-1',
  'adj-box-2',
  'adj-box-3',
]

const divineReservation = (includeSpeedrunCentres: boolean): StrategyReservationGroup => ({
  id: 'divine',
  label: "神圣石策略",
  modIds: includeSpeedrunCentres
    ? [...DIVINE_RESERVATION_MODS, ...SPEEDRUN_CENTER_MODS]
    : DIVINE_RESERVATION_MODS,
  areaTypes: ['sea-pillars', 'pelagic-abyss'],
})

// "点金速刷" highway: three vertical lanes capped at the top,
// joined along the bottom row. 8 connections, all reaching the ⚓ start.
const ALC_GO_LAYOUT: Edges[] = [
  [F, F, T, F], // 0 end (lane cap)
  [F, F, T, F], // 1 end
  [F, F, T, F], // 2 end
  [T, F, T, F], // 3 straight
  [T, F, T, F], // 4 straight
  [T, F, T, F], // 5 straight
  [T, T, F, F], // 6 corner (start)
  [T, T, F, T], // 7 T-junction
  [T, F, F, T], // 8 corner
]

// Alc & Go "S 形路线" (community request from the Reddit thread): one
// continuous serpentine from the ⚓ start - fastest to actually run, at the
// cost of burning corner pieces faster than ends.
// Path: 6 → 7 → 8 → 5 → 4 → 3 → 0 → 1 → 2. 8 connections.
const ALC_GO_SNAKE: Edges[] = [
  [F, T, T, F], // 0 corner (S to 3, E to 1)
  [F, T, F, T], // 1 straight
  [F, F, F, T], // 2 end (tail)
  [T, T, F, F], // 3 corner (N to 0, E to 4)
  [F, T, F, T], // 4 straight
  [F, F, T, T], // 5 corner (S to 8, W to 4)
  [F, T, F, F], // 6 end (start; E to 7)
  [F, T, F, T], // 7 straight
  [T, F, F, T], // 8 corner (N to 5, W to 7)
]

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'alc-and-go',
    name: "点金速刷",
    tagline: "消耗其他策略不需要的备用海图，沿单线快速航行，寻找随机遭遇。",
    source: { label: "Milky 的策略", url: '' },
    guide: [
      "只使用其他策略不需要的海图。默认保留关键材料，可在求解设置中独立调整保护。",
      "优先组成三条在底部相连的单线通道，也可根据现有形状调整。",
      "无需追求每格效果，主要收集零散掉落、硫磺与随机遭遇。",
      "点金后出发，放置所有灯笼、处理沿途互动，然后离开；在完整策略航程之间循环速刷。",
    ],
    weights: {
      'self:quant': 2,
      'self:sulph': 2,
      'voyage:sulph': 2,
      'voyage:quant': 2,
    },
    rules: [],
    layout: ALC_GO_LAYOUT,
    layouts: [
      {
        id: 'highway',
        label: "三线通道",
        hint: "均衡消耗端点与双向转角海图",
        layout: ALC_GO_LAYOUT,
      },
      {
        id: 'snake',
        label: "S 形路线",
        hint: "一条连续路径，便于快速跑完",
        layout: ALC_GO_SNAKE,
      },
    ],
    layoutPenalty: 15, // a preference, not a law - "whatever works"
    reservationGroups: [divineReservation(true), MEATFISH_RESERVATION, ETHEREAL_RESERVATION],
  },
  {
    id: 'kishara-boss-rush', name: '琪莎拉 Boss 速刷', badge: '新增',
    tagline: '恰好带一张琪莎拉，优先左下，避开装备转金币。',
    source: { label: '玩家实测', url: 'https://www.reddit.com/r/pathofexile/comments/1vteizn/i_ran_100_kisharas_rest_voyages_so_you_dont_have/' },
    guide: ['只带一张琪莎拉安息处，默认优先左下起点；位置服从连接和锁定。',
      'Boss 所在区域不得受到装备转金币影响；金币数量提高不受此限制。',
      '有合法保图边界时可主动选择保图备选；逐来源显示概率，不合并推算。',
      '社区实测不代表国服掉落公式；首次任务解锁及游戏内结果请现场核对。'],
    weights: { 'voyage:sulph': 1 },
    rules: [{ cells: [6], areaTypes: ['kisharas-rest'], bonus: 1000 }],
    destinationCounts: [{ areaType: 'kisharas-rest', count: 1 }],
    requirements: [{ areaTypes: ['kisharas-rest'], count: 1, label: '琪莎拉安息处海图' }],
    limits: [{ areaTypes: ['kisharas-rest'], max: 1 }],
    waitHint: '缺少琪莎拉海图或合法位置时，请保留库存等待。',
  },
  {
    id: 'anchorfield-fishing',
    name: "锚地赐福",
    badge: "新增",
    tagline:
      "寻找混沌石转神圣石的赐福，再开启锚地宝藏；追求大奖或继续下一航程。",
    source: { label: "社区策略", url: '' },
    guide: [
      "只带一张锚地海图，任意稀有度均可，先洗练到合适的物品数量；一张即可。",
      "其余位置使用提高物品数量的海图，可用混沌石将备用海图洗到较高数量。",
      "若边界为稀有怪物额外掉落一颗混沌石，可考虑用稀有怪物数量海图替代数量海图；相邻稀有怪海图默认不保留。",
      "正常探索，寻找混沌石变为神圣石的赐福。探索其他区域时只快速穿过锚地，暂不打开其沉没宝藏。",
      "找到赐福后返回锚地，开启所有沉没宝藏。每份宝藏掉落若干混沌石，20% 的转化几率可将其变为神圣石。",
      "尚未找到赐福且灯笼约剩六个时，可开启锚地宝藏收尾，或直接进入下一航程；重点是寻找大奖机会。",
    ],
    weights: {
      'self:quant': 10,
      'voyage:quant': 8,
      'border:chaos': 6,
      'border:quantconn': 5,
      'self:pack': 2,
      'voyage:sulph': 1,
    },
    rules: [
      // the ONE Anchorfield chart can sit anywhere - it just has to be aboard
      { cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], areaTypes: ['anchorfield'], bonus: 40 },
    ],
    requirements: [
      { areaTypes: ['anchorfield'], count: 1, label: "锚地海图" },
    ],
    // "One is all you need": however many Anchorfields the library holds,
    // only the single best one is offered to the solver (issue #49 - the
    // any-cell bonus used to stack every Anchorfield onto the board)
    destinationCounts: [{ areaType: 'anchorfield', count: 1 }],
    limits: [{ areaTypes: ['anchorfield'], max: 1 }],
    waitHint: "先用点金速刷或速刷保险箱，等待锚地海图掉落，任意稀有度均可。",
    searchRegex: '"锚地|物品数量.*(1[2-9].|[2-9]..)%"',
  },
  {
    id: 'milky-speedrun',
    name: "速刷保险箱",
    tagline: "Milky 的过渡刷法：消耗备用海图，开启保险箱，快速完成航程。",
    source: { label: "Milkybk_：航海加强与策略讲解", url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      "中心只放一张侦探保险箱海图；这是首选，原攻略称每航程可获得价值数颗神圣石的圣甲虫。神圣秘宝或瓶中信海图是稳定的替代材料。",
      "先将海图洗到 110% 以上物品数量再测绘；测绘后无法洗练，数量会影响保险箱奖励。",
      "将物品数量最高的海图放在四个中边位置。",
      "其余位置使用其他策略不需要的备用海图，角落主要用于对齐连接。",
      "携带点金石、重铸石和崇高石，开启保险箱前先洗练和强化。",
      "若出现污秽蟹群边界（原攻略称首领约掉落 4000 硫磺），求解器会优先将硫磺奖励最高的海图放在该格。",
      "以速度为主：放灯笼、处理互动、开保险箱后离开。原攻略称备用海图航程也可带来价值一两颗神圣石的零散掉落。",
      "默认保留神圣石、稀有怪传说装和魔法怪流所需材料；可在求解设置中关闭不需要的保护。",
    ],
    weights: {
      'adjacent:opbox': 10,
      'adjacent:divbox': 7,
      'adjacent:msg': 7,
      'self:quant': 8,
      'voyage:quant': 5,
      'voyage:sulph': 3,
      'self:sulph': 3,
      'border:quantconn': 6,
      'border:divine': 4,
      'border:exalt': 3,
      'border:ancient': 3,
    },
    reservationGroups: [divineReservation(false), MEATFISH_RESERVATION, ETHEREAL_RESERVATION],
    rules: [
      // one centre chart, never a second one wasted elsewhere. Operative's
      // outranks the fallbacks (Milky: "won't yield as much, but consistent")
      { cells: CENTER, modIds: ['adj-opbox-1', 'adj-opbox-2'], bonus: 55 },
      { cells: CENTER, modIds: ['adj-divbox-1', 'adj-divbox-2', 'adj-msg-1', 'adj-msg-2'], bonus: 40 },
      { cells: NOT_CENTER, modIds: SPEEDRUN_CENTER_MODS, bonus: -40 },
      // 150%+ quant charts adjacent to the centre (continuous: higher = better)
      { cells: EDGES, rewardStat: { stat: 'quantity', per: 6 }, bonus: 0 },
      // Filthscrabble border: park the highest-sulphur chart on its tile
      { nearBorderId: 'b-octoboss', rewardStat: { stat: 'sulphur', per: 8 }, bonus: 0 },
    ],
    requirements: [
      { modIds: SPEEDRUN_CENTER_MODS, count: 1, label: "神圣秘宝／侦探保险箱／瓶中信海图（中心）" },
    ],
    // which family may take the centre (issue #49: e.g. spend Messages,
    // save Diviner's) - the choice reshapes rules + readiness via
    // applyCenterChoice
    centerOptions: [
      { id: 'any', label: "现有最佳材料", modIds: [...SPEEDRUN_CENTER_MODS] },
      { id: 'opbox', label: "仅侦探保险箱", modIds: ['adj-opbox-1', 'adj-opbox-2'] },
      { id: 'msg', label: "仅瓶中信", modIds: ['adj-msg-1', 'adj-msg-2'] },
      { id: 'divbox', label: "仅神圣秘宝", modIds: ['adj-divbox-1', 'adj-divbox-2'] },
    ],
    waitHint: "先手动规划，等待中心材料掉落。",
    searchRegex: '"瓶中信|神圣的秘宝|侦探的保险箱"',
  },
  {
    id: 'milky-meatfish',
    name: "稀有怪传说装",
    tagline: "Milky 的高投入刷法：利用附身、众神词缀和巨型海星稀有怪，追求传奇物品掉落。",
    source: { label: "Milkybk_：航海加强与策略讲解", url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      "原攻略完整组成：2 张巨型海星、1 张众神词缀、2 张海之柱（角落）、2 张黄金灯笼、1 张稀有怪附身、1 张无法掉落装备海图。",
      "巨型海星优先放上中和下中，众神词缀优先放右中，黄金灯笼优先放中心；海图形状不限。",
      "无法掉落装备海图是关键材料，稀有怪分裂可作替代；众神词缀也可换为 4000 鬼灵海图。",
      "收集航程中所有灯笼，原攻略目标约为 280% 数量、840 稀有度。击杀强化稀有怪，追求法师之血／猎首等奖励。",
      "风险较高，应收齐材料再运行；材料不足时先速刷保险箱。",
    ],
    weights: {
      'adjacent:star': 10,
      'adjacent:pantheon': 10,
      'adjacent:lantern': 10,
      'voyage:possess': 10,
      'voyage:fracture': 8,
      'border:rare': 9,
      'self:quant': 4,
      'self:rarity': 3,
    },
    rules: [
      // Placement rules: Starfish ALWAYS top/bottom-middle, Pantheon
      // ONLY right-middle, Golden Lantern preferably centre - any chart shape.
      // Bonuses outweigh the (soft) layout so location wins over exact lines;
      // negative bonuses keep the locked pieces out of every other square.
      { cells: [1, 7], modIds: ['adj-star-1', 'adj-star-2'], bonus: 80 },
      { cells: [0, 2, 3, 4, 5, 6, 8], modIds: ['adj-star-1', 'adj-star-2'], bonus: -80 },
      { cells: [5], modIds: ['adj-pantheon'], bonus: 80 },
      { cells: [0, 1, 2, 3, 4, 6, 7, 8], modIds: ['adj-pantheon'], bonus: -80 },
      { cells: [4], modIds: ['adj-lantern'], bonus: 40 },
      // Sea-Pillars belong in the corners (their rain juices their own tile)
      { cells: [0, 2, 6, 8], areaTypes: ['sea-pillars'], bonus: 40 },
      { cells: [1, 3, 4, 5, 7], areaTypes: ['sea-pillars'], bonus: -40 },
    ],
    layout: MEATFISH_LAYOUT,
    // soft: a full-board layout deviation (9 cells × 6) must still cost less
    // than any single piece bonus, so lines always yield to piece locations
    layoutPenalty: 6,
    requirements: [
      // Milky's sheet composition (2+1+2+2+1+1 = 9 charts)
      { modIds: ['adj-star-1', 'adj-star-2'], count: 2, label: "巨型海星海图" },
      { modIds: ['adj-pantheon', 'adj-wisps-1', 'adj-wisps-2'], count: 1, label: "众神词缀（或 4000 鬼灵）海图" },
      { areaTypes: ['sea-pillars'], count: 2, label: "海之柱海图（角落）" },
      { modIds: ['adj-lantern'], count: 2, label: "黄金灯笼海图" },
      { modIds: ['voy-possess'], count: 1, label: "稀有怪附身海图" },
      { modIds: ['voy-noequip', 'voy-fracture'], count: 1, label: "无法掉落装备（或分裂）海图" },
    ],
    waitHint: "材料不足时先速刷保险箱。",
    searchRegex: '"无法掉落|被附身|黄金灯笼|众神词缀"',
    allowFractureCharts: true,
  },
  {
    id: 'milky-ethereal',
    name: "魔法怪流",
    tagline: "Milky 的魔法怪变体：搭配鬼灵、灯笼及怪物至少为魔法的效果。",
    source: { label: "Milkybk_：航海加强与策略讲解", url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      "⚠ 原攻略的实测回报一般（Palsteron 约获得价值 5 颗神圣石的奖励），Milky 已转向稀有怪传说装策略；此方案保留作参考。",
      "按原攻略布局优先安排：3 张双向转角、4 张三向连接、1 张四向连接、1 张直线海图，共 11 条连接。",
      "鬼灵海图优先放四个中边位置，黄金灯笼放角落，四向连接海图放中心。",
      "以魔法怪为主，组合怪物至少为魔法与提高魔法怪数量效果。",
      "优先使用感染潜航球区域，利用更多怪物进行转化。",
      "原攻略比稀有怪传说装更重视无法掉落装备效果，将其作为主要放大手段。",
    ],
    weights: {
      'adjacent:wisps': 10,
      'voyage:minmagic': 10,
      'adjacent:magic': 9,
      'voyage:magic': 9,
      'adjacent:lantern': 8,
      'border:minmagic': 8,
      'self:quant': 4,
      'self:pack': 3,
    },
    rules: [
      // icon cells from Milky's planner: wisps on the cross, lanterns on corners
      { cells: EDGES, modIds: ['adj-wisps-1', 'adj-wisps-2'], bonus: 6 },
      { cells: [0, 2, 8], modIds: ['adj-lantern'], bonus: 5 },
      { cells: CENTER, modIds: ['adj-magic-1', 'adj-magic-2', 'adj-wisps-1', 'adj-wisps-2'], bonus: 5 },
    ],
    layout: ETHEREAL_LAYOUT,
    requirements: [
      { modIds: ['adj-wisps-1', 'adj-wisps-2'], count: 4, label: "荒林鬼灵海图" },
      { modIds: ['adj-lantern'], count: 3, label: "黄金灯笼海图" },
    ],
    waitHint: "材料不足时先速刷保险箱。",
  },
  {
    id: 'divine-border-rares',
    name: "稀有怪神圣雨",
    tagline:
      "洗出神圣石边界，在对应格放海之柱，并集中稀有怪，让每只稀有怪额外掉落一颗神圣石。",
    source: { label: "Milky 的策略", url: '' },
    guide: [
      "用亡者硫磺重置边界，寻找稀有怪额外掉落一颗神圣石；这是原攻略中的两类大奖方案之一。",
      "填写当前边界，求解器会优先将海之柱放在神圣石边界对应格，利用柱子在该区域增加稀有怪。",
      "供给海图优先选择相邻区域额外 5 个保险箱。原攻略建议将保险箱洗出额外 4 只与额外 3 只稀有怪效果，共 7 只；每只掉一颗神圣石。按此理想情况，一张海图约 35 颗，三张约 105 颗。",
      "保险箱海图不足时可用巨型海星海图供给。",
      "其余五格放提高稀有怪数量的海图；目标区域每只稀有怪都能额外掉落神圣石。",
    ],
    weights: {
      'adjacent:rare': 10,
      'voyage:rare': 10,
      'border:rare': 10,
      'adjacent:star': 8,
      'adjacent:box': 8,
      'voyage:possess': 6,
      'border:divine': 10,
      'self:pack': 3,
    },
    rules: [
      // the Sea-Pillar chart sits ON whichever tile the Divine border touches
      { nearBorderId: 'b-divine', areaTypes: ['sea-pillars'], bonus: 100 },
      // feeders shoot INTO the Divine tile from beside it. "+5 Strongboxes"
      // (7 rares per box when rolled = 35 divines) outranks lower tiers/starfish
      { nearBorderId: 'b-divine', adjacentToBorder: true, modIds: ['adj-box-3'], bonus: 35 },
      { nearBorderId: 'b-divine', adjacentToBorder: true, modIds: ['adj-box-1', 'adj-box-2'], bonus: 22 },
      { nearBorderId: 'b-divine', adjacentToBorder: true, modIds: ['adj-star-1', 'adj-star-2'], bonus: 15 },
    ],
    requirements: [
      { areaTypes: ['sea-pillars'], count: 1, label: "海之柱海图" },
      {
        modIds: ['adj-star-1', 'adj-star-2', 'adj-box-1', 'adj-box-2', 'adj-box-3'],
        count: 3,
        label: "巨型海星或保险箱海图",
      },
      { modIds: ['adj-rare-1', 'adj-rare-2', 'voy-rare'], count: 5, label: "提高稀有怪数量海图" },
    ],
    // banking is more granular than readiness (issue #21): only the big
    // generic boxes (+2-4/+5) are Divine-mandatory - typed boxes cap at +3
    // and stay free for Speedrun; voyage-wide rares outrank adjacent ones
    bankTypes: [
      { label: "海之柱海图", areaTypes: ['sea-pillars'], keep: 1 },
      { label: "巨型海星海图", modIds: ['adj-star-1', 'adj-star-2'], keep: 3 },
      { label: "保险箱海图（额外 2–4／5 个）", modIds: ['adj-box-2', 'adj-box-3'], keep: 3 },
      { label: "保险箱海图（额外 1 个）", modIds: ['adj-box-1'], keep: 0 },
      { label: "提高稀有怪数量海图（全航程）", modIds: ['voy-rare'], keep: 6 },
      { label: "提高稀有怪数量海图（相邻区域）", modIds: ['adj-rare-1', 'adj-rare-2'], keep: 0 },
    ],
    requiresBorderId: { id: 'b-divine', label: "额外掉落一颗神圣石的边界（请填写边界）" },
    waitHint: "先速刷保险箱，等待材料和神圣石边界齐备。",
    searchRegex: '"所有航行区域的稀有怪物数量|保险箱"',
    allowRareImplicits: true,
  },
  {
    id: 'cutedog-divine-boxes',
    name: "神圣保险箱",
    tagline:
      "cutedog_ 的神圣石边界变体：目标格放远洋深渊，由各类保险箱供给；理想洗练后每箱可产生 7 颗神圣石。",
    source: { label: "cutedog_ 的直播策略", url: 'https://www.twitch.tv/cutedog_' },
    guide: [
      "需要稀有怪额外掉落一颗神圣石的边界，优先在对应格放高怪物群大小的远洋深渊海图。",
      "在神圣石目标格旁安排三张相邻保险箱海图，类型不限；按原攻略的理想词缀，每个保险箱最多产生 7 颗神圣石。",
      "将保险箱洗出额外 3 只和额外 4 只稀有怪效果，分别对应 3 颗和 4 颗神圣石。两者同时出现可达 7 颗，洗练难度较高。",
      "其余位置使用全航程提高稀有怪数量海图。",
      "可参考下方原版交易链接寻找价格合适的海图，原攻略建议密语 fastge；浏览时使用 120% 以上数量搜索。",
    ],
    weights: {
      'voyage:rare': 10,
      'adjacent:rare': 8,
      'border:rare': 10,
      'adjacent:box': 9,
      'adjacent:divbox': 8,
      'adjacent:arcbox': 8,
      'adjacent:opbox': 8,
      'border:divine': 10,
      'self:pack': 6,
    },
    rules: [
      // Pelagic Abyss (high pack size) sits ON the Divine-border tile
      { nearBorderId: 'b-divine', areaTypes: ['pelagic-abyss'], bonus: 80 },
      { nearBorderId: 'b-divine', rewardStat: { stat: 'packsize', per: 8 }, bonus: 0 },
      // any strongbox adjacent charts feed the Divine tile from beside it
      {
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        modIds: [
          'adj-box-1', 'adj-box-2', 'adj-box-3',
          'adj-divbox-1', 'adj-divbox-2',
          'adj-arcbox-1', 'adj-arcbox-2',
          'adj-opbox-1', 'adj-opbox-2',
        ],
        bonus: 25,
      },
    ],
    requirements: [
      {
        areaTypes: ['pelagic-abyss'],
        count: 1,
        label: "远洋深渊海图（高怪物群大小）",
      },
      {
        modIds: [
          'adj-box-1', 'adj-box-2', 'adj-box-3',
          'adj-divbox-1', 'adj-divbox-2',
          'adj-arcbox-1', 'adj-arcbox-2',
          'adj-opbox-1', 'adj-opbox-2',
        ],
        count: 3,
        label: "相邻保险箱海图（任意类型）",
      },
      { modIds: ['voy-rare'], count: 5, label: "提高稀有怪数量海图（全航程）" },
    ],
    bankTypes: [
      { label: "远洋深渊海图（高怪物群大小）", areaTypes: ['pelagic-abyss'], keep: 1 },
      { label: "保险箱海图（额外 2–4／5 个）", modIds: ['adj-box-2', 'adj-box-3'], keep: 3 },
      { label: "神圣秘宝海图", modIds: ['adj-divbox-1', 'adj-divbox-2'], keep: 0 },
      { label: "奥术师保险箱海图", modIds: ['adj-arcbox-1', 'adj-arcbox-2'], keep: 0 },
      { label: "侦探保险箱海图", modIds: ['adj-opbox-1', 'adj-opbox-2'], keep: 0 },
      { label: "提高稀有怪数量海图（全航程）", modIds: ['voy-rare'], keep: 6 },
    ],
    requiresBorderId: { id: 'b-divine', label: "额外掉落一颗神圣石的边界（请填写边界）" },
    waitHint: "先速刷保险箱，等待材料和神圣石边界齐备。",
    searchRegex: '"物品数量.*(1[2-9].|[2-9]..)%"',
    allowRareImplicits: true,
    extraLinks: [
      { label: "原版交易搜索：低价优质海图", url: 'https://www.pathofexile.com/trade/search/Allflame/9zRn7YLRHK' },
    ],
  },
]

export const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]))

/**
 * Apply the user's centre-piece pick (issue #49): the chosen family gets the
 * centre bonus, the excluded families are pushed out of the centre, and
 * readiness asks for the chosen family specifically. The default (first)
 * option returns the strategy untouched.
 */
export function applyCenterChoice(strategy: StrategyDef, choiceId?: string): StrategyDef {
  const options = strategy.centerOptions
  if (!options || options.length === 0) return strategy
  const choice = options.find((o) => o.id === choiceId) ?? options[0]
  if (choice === options[0]) return strategy

  const allCenterMods = new Set(options[0].modIds)
  const excluded = options[0].modIds.filter((id) => !choice.modIds.includes(id))

  // strip every rule that touches a centre-family mod, then rebuild them
  // around the chosen family; rules without modIds (quant edges,
  // Filthscrabble) pass through untouched
  const rules = [
    { cells: CENTER, modIds: choice.modIds, bonus: 55 },
    { cells: CENTER, modIds: excluded, bonus: -40 },
    { cells: NOT_CENTER, modIds: options[0].modIds, bonus: -40 },
    ...strategy.rules.filter(
      (r) => !r.modIds || !r.modIds.some((id) => allCenterMods.has(id)),
    ),
  ]
  const requirements = (strategy.requirements ?? []).map((req) =>
    req.modIds?.some((id) => allCenterMods.has(id))
      ? { ...req, modIds: choice.modIds, label: `${choice.label.replace('仅', '')}海图（中心）` }
      : req,
  )
  return { ...strategy, rules, requirements }
}
