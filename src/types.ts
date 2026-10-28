// Core data model for the Voyage Board solver.
// NOTE: built pre-launch from reveal coverage - field shapes are designed to be
// easy to adjust once real in-game data is available (see RESEARCH.md).

/** Reward dimensions a modifier can affect (from the datamined 3.29 mod pools). */
export type Stat =
  | 'currency'
  | 'gold'
  | 'scarabs'
  | 'divcards'
  | 'essences' // Imprisoned Monsters
  | 'spirits' // Tormented Spirits
  | 'wisps' // Wildwood Wisp empowerment
  | 'rares'
  | 'magicmonsters'
  | 'sulphur'
  | 'packsize'
  | 'quantity'
  | 'rarity'
  | 'uniques' // unique ring/amulet/belt conversion
  | 'treasure' // lootable-object spawns: strongboxes, anchors, lockers, barrels, messages, fish, lanterns, altars
  | 'exp' // experience gain
  | 'preserve' // chance charts aren't consumed

export const ALL_STATS: Stat[] = [
  'currency',
  'gold',
  'scarabs',
  'divcards',
  'essences',
  'spirits',
  'wisps',
  'rares',
  'magicmonsters',
  'sulphur',
  'packsize',
  'quantity',
  'rarity',
  'uniques',
  'treasure',
  'exp',
  'preserve',
]

/** compact labels for tight UI spots (tiles, pills, grid squares) */
export const STAT_SHORT: Record<Stat, string> = {
  currency: '通货',
  gold: '金币',
  scarabs: '圣甲虫',
  divcards: '命运卡',
  essences: '精华',
  spirits: '罪魂',
  wisps: '鬼灵',
  rares: '稀有怪物',
  magicmonsters: '魔法怪物',
  sulphur: '亡者硫磺',
  packsize: '怪物群大小',
  quantity: '物品数量',
  rarity: '物品稀有度',
  uniques: '传奇物品',
  treasure: '宝藏',
  exp: '经验',
  preserve: '海图保留',
}

export const STAT_LABELS: Record<Stat, string> = {
  currency: '通货',
  gold: '金币',
  scarabs: '圣甲虫',
  divcards: '命运卡',
  essences: '被囚禁的怪物',
  spirits: '罪魂',
  wisps: '荒林鬼灵',
  rares: '稀有怪物',
  magicmonsters: '魔法怪物',
  sulphur: '亡者硫磺',
  packsize: '怪物群大小',
  quantity: '物品数量',
  rarity: '物品稀有度',
  uniques: '传奇物品',
  treasure: '宝藏',
  exp: '经验值',
  preserve: '海图保留',
}

/** What each reward axis covers, shown as a hover tooltip on the weight sliders. */
export const STAT_DESC: Record<Stat, string> = {
  currency: '通货：奥术师保险箱及边界通货掉落（神圣石、崇高石、混沌石等）',
  gold: '金币：装备转化为金币等词缀',
  scarabs: '圣甲虫：侦探保险箱及边界圣甲虫效果',
  divcards: '命运卡：神圣的秘宝保险箱及命运卡组边界',
  essences: '被囚禁的怪物：相邻区域额外出现的精华怪物',
  spirits: '罪魂：相邻区域额外的罪魂牢笼',
  wisps: '荒林鬼灵：强化怪物，提高奖励和难度',
  rares: '稀有怪物：增加数量、怪物群及额外掉落',
  magicmonsters: '魔法怪物：增加数量',
  sulphur: '亡者硫磺：赛季制作通货',
  packsize: '怪物群大小：增加区域内怪物（螃蟹、章鱼、海兽、溺亡者）',
  quantity: '物品数量：提高掉落物品的数量',
  rarity: '物品稀有度：提高掉落物品的稀有度',
  uniques: '传奇物品：戒指、护身符、腰带改为传奇的几率',
  treasure: '宝藏：保险箱、宝藏锚、海盗储物箱、木桶、瓶中信、奇特的鱼、黄金灯笼、女神祭坛及宝藏小首领',
  exp: '经验值：边界效果带来的经验加成',
  preserve: '海图保留：开始航程时相邻海图不被消耗的几率',
}

/** Who a voyage modifier applies to. */
export type Scope = 'self' | 'adjacent' | 'global'

export interface ModEffect {
  stat: Stat
  /** percentage value; treated multiplicatively as (1 + percent/100) */
  percent: number
}

/** A voyage modifier definition (on a chart). */
export interface VoyageModDef {
  id: string
  text: string
  /** localized clipboard lines that map to this canonical modifier id */
  aliases?: readonly string[]
  /** compact label for count-based mods where the scored percent is only a heuristic */
  short?: string
  scope: Scope
  effects: ModEffect[]
  /** some mods scale per connection the chart has (or reward fewer connections) */
  scaling?: 'connections' | 'inverse-connections'
}

/** A border modifier definition (rolled on the 12 board edge segments). */
export interface BorderModDef {
  id: string
  text: string
  /** alternate live or legacy tooltip text accepted by the border OCR matcher */
  aliases?: readonly string[]
  /** compact display label for the border pill */
  short?: string
  effects: ModEffect[]
  /** meta-mod: % increased magnitude of the touched chart's own modifiers */
  magnitude?: number
  /** effects applied per matched connection the touched chart has (can be negative) */
  perConnEffects?: ModEffect[]
}

/** Edge connectors, clockwise from North: [N, E, S, W]. */
export type Edges = [boolean, boolean, boolean, boolean]

/** Canonical destination/area type printed between a Chart name and Area Level. */
export type ChartAreaType =
  | 'anchorfield'
  | 'brine-kings-domain'
  | 'clam-infested-shelf'
  | 'diving-shoals'
  | 'eldritch-depths'
  | 'hazardous-depths'
  | 'infested-bathyspheres'
  | 'lost-ruins'
  | 'abyssal-plain'
  | 'pelagic-abyss'
  | 'seafloor-ridges'
  | 'sea-pillars'
  | 'sunken-totems'
  | 'undersea-groves'
  | 'kisharas-rest'

/** A chart instance owned by the player. */
export interface ChartData {
  uid: string
  name: string
  level: number
  edges: Edges
  /** locale-independent destination/area type used by curated strategies */
  areaType?: ChartAreaType
  /** ids into VOYAGE_MODS; the revealed implicit (adjacent/voyage) mod */
  modIds: string[]
  /** the revealed implicit line verbatim, shown even if it matched no known mod */
  implicitText?: string
  /** the chart's own area reward stats, read from the item header (self-scope) */
  rewards?: ModEffect[]
  /** canonical chart connector shape name (Straight/Corner/Junction/End/Crossing) */
  shape?: string
  /** unparsed mod lines kept from import so nothing is silently lost */
  rawText?: string
  /** marked to survive "Finish Voyage" (won't be consumed) */
  pendingDeletion?: boolean
  preserved?: boolean
}

/** A chart placed on the board. */
export interface Placement {
  chartUid: string
  /** 90° clockwise rotations applied to the chart's edges (0–3) */
  rotation: number
}

/** 9 cells, row-major (index = row * 3 + col). null = empty. */
export type Board = (Placement | null)[]

/**
 * 12 border segments, each touching exactly one tile:
 * indices 0–2 top (cols 0–2), 3–5 right (rows 0–2),
 * 6–8 bottom (cols 0–2), 9–11 left (rows 0–2).
 * Value is a BorderModDef id or null.
 */
export type Borders = (string | null)[]

/** Connectivity rule - the real rule is unconfirmed pre-launch, so it's a setting. */
export type ConnectivityMode = 'any' | 'connected' | 'strict'

/** user reward priorities, keyed by reward-type key (see logic/rewards.ts) */
export type Weights = Record<string, number>

/** the Voyage starts at the bottom-left square (row 2, col 0) */
export const START_CELL = 6

export const emptyBoard = (): Board => Array(9).fill(null)
export const emptyBorders = (): Borders => Array(12).fill(null)

/** Which tile does border segment i touch? Returns board cell index. */
export function borderTouches(i: number): number {
  if (i < 3) return i // top row
  if (i < 6) return (i - 3) * 3 + 2 // right col
  if (i < 9) return 6 + (i - 6) // bottom row
  return (i - 9) * 3 // left col
}
