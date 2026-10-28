import { describe, expect, it } from 'vitest'
import samples from '../../samples/charted.zh-CN.txt?raw'
import reviewed from '../../samples/text-library/mappings.reviewed.json'
import { TEXT_LIBRARY } from '../data/textLibrary'
import { voyageModById } from '../data/mods'
import { parseChartText } from './parser'
import { dedupeNewCharts } from './importDedupe'
import { scoreBoard } from './scoring'
import { DEFAULT_WEIGHTS } from './rewards'
import type { Board, Borders } from '../types'

const first = samples.trim().split(/\n\s*(?=物品类别: 海图)/)[0]
const withImplicit = (text: string) => first.replace(/(\{ 基底属性 \}\n)[^\n]+/, `$1${text}`)
const english = (text: string) => `Item Class: Chart\nRarity: Rare\nVoyage\nCoral Reef Chart\n--------\nClam-infested Shelf\nArea Level: 83\nItem Quantity: +110%\nDead Man's Sulphur: +75%\n--------\n{ Implicit Modifier }\n${text}\n--------\nChart Shape: End\n--------\nMonsters deal 35% increased Damage`

// Constructed charts using acquired source templates: these are not additional
// real client samples. Every tier and scope is exercised through the public parser.
describe('offline acquired corpus at the parser boundary', () => {
  it.each(reviewed.filter((record) => !record.internalId.startsWith('b-')))(
    'imports reviewed $internalId with its original effects and equal English score', (record) => {
      const cnResult = parseChartText(withImplicit(record.cnText))
      expect(cnResult.rejected).toEqual([])
      expect(cnResult.charts).toHaveLength(1)
      const cn = cnResult.charts[0]
      expect(cn.modIds).toEqual([record.internalId])
      expect(cn.implicitText).toBe(record.cnText)
      expect(voyageModById.get(cn.modIds[0])?.scope).toBe(record.repoScope)
      const en = parseChartText(english(record.repoEnText)).charts[0]
      expect(en.modIds).toEqual([record.internalId])
      const cnCharts = Array.from({ length: 9 }, (_, index) => ({ ...cn, uid: `cn-${index}` }))
      const enCharts = Array.from({ length: 9 }, (_, index) => ({ ...en, uid: `en-${index}` }))
      const cnBoard = cnCharts.map((chart) => ({ chartUid: chart.uid, rotation: 0 })) as Board
      const enBoard = enCharts.map((chart) => ({ chartUid: chart.uid, rotation: 0 })) as Board
      const borders = Array(12).fill(null) as Borders
      expect(scoreBoard(cnBoard, borders, new Map(cnCharts.map((chart) => [chart.uid, chart])), DEFAULT_WEIGHTS)).toEqual(scoreBoard(enBoard, borders, new Map(enCharts.map((chart) => [chart.uid, chart])), DEFAULT_WEIGHTS))
    },
  )
  it.each(TEXT_LIBRARY.records.filter((record) => record.kind === 'destination'))(
    'imports acquired destination $internalId without a positional bilingual join', (record) => {
      expect(parseChartText(first.replace('蛤蜊海架', record.cnText!)).charts[0]?.areaType).toBe(record.internalId)
    },
  )
  it.each(TEXT_LIBRARY.records.filter((record) => record.kind === 'reward' && record.cnText))(
    'refuses conflicting reward $internalId when substituted for the crucial implicit', (record) => {
      expect(parseChartText(withImplicit(record.cnText!)).charts).toEqual([])
    },
  )
  it('refuses impossible rolls even though the visible range is a known tier', () => {
    expect(parseChartText(withImplicit('相邻区域包含 99(8-10) 个额外的螃蟹群')).charts).toEqual([])
  })
  it('preserves original advanced text while matching spaced/fullwidth derived variants', () => {
    const text = '相邻区域包含 ８ （ ８ － １０ ） 个额外的螃蟹群 — 数值不可调整'
    expect(parseChartText(withImplicit(text).replace(/\n/g, '\r\n')).charts[0]).toMatchObject({ modIds: ['adj-crab-1'], implicitText: text })
  })
  it('rejects an unsupported destination rather than assigning no destination', () => {
    const result = parseChartText(first.replace('蛤蜊海架', '明确未知目的地'))
    expect(result.charts).toEqual([])
    expect(result.rejected[0]?.reason).toBe('unknown destination: 明确未知目的地')
  })
  it('rejects a missing mainland area level instead of borrowing an item level', () => {
    const result = parseChartText(first.replace('区域等级: 83\n', ''))
    expect(result.charts).toEqual([])
    expect(result.rejected[0]?.reason).toBe('missing 区域等级')
  })
  it.each(['转角', '岔口', '十字'])(
    'does not invent the unacquired shape alias %s', (shape) => {
      expect(parseChartText(first.replace('海图形状：端点', `海图形状：${shape}`)).charts).toEqual([])
    },
  )
  it('retains the original same-batch instance and whole-rescan rules', () => {
    const batch = parseChartText(`${first}\n${first}`).charts
    expect(new Set(batch.map((chart) => chart.uid)).size).toBe(2)
    const initial = dedupeNewCharts([], batch)
    expect(initial.fresh).toHaveLength(2)
    expect(dedupeNewCharts(initial.fresh, parseChartText(`${first}\n${first}`).charts)).toMatchObject({ fresh: [], skipped: 2 })
    const noRawText = batch.map(({ rawText: _raw, ...chart }) => chart)
    expect(dedupeNewCharts([noRawText[0]], noRawText).fresh).toHaveLength(2)
  })
})
