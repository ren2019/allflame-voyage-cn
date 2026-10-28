import { describe, expect, it } from 'vitest'
import { matchChineseChartImplicit } from './textLibrary'

describe('offline mainland text library', () => {
  it.each([
    ['相邻区域包含一个额外罪魂牢笼', 'adj-spirit-1'],
    ['相邻区域包含一个额外罪魂牢笼 — 数值不可调整', 'adj-spirit-1'],
    ['相邻区域包含 1 个额外罪魂牢笼 — 数值不可调整', 'adj-spirit-1'],
  ])('maps the reported cage wording %s', (text, id) => {
    expect(matchChineseChartImplicit(text)).toBe(id)
  })
  it('keeps cage tiers distinct and refuses unknown mechanics', () => {
    expect(matchChineseChartImplicit('相邻区域包含 2 个额外罪魂牢笼')).toBe('adj-spirit-2')
    expect(matchChineseChartImplicit('相邻区域包含一个额外未知牢笼')).toBeNull()
  })
  // Derived equivalents, not additional captured client wording.
  it.each([
    ['相邻区域包含一个额外保险箱', 'adj-box-1'],
    ['相邻区域包含一个额外的保险箱', 'adj-box-1'],
    ['相邻区域包含五个额外的保险箱', 'adj-box-3'],
    ['相邻区域包含一个额外漂流瓶', 'adj-msg-1'],
    ['相邻区域包含两个额外的漂流瓶', 'adj-msg-2'],
    ['相邻区域包含一个额外瓶中信', 'adj-msg-1'],
    ['相邻区域包含两个额外的瓶中信', 'adj-msg-2'],
    ['相邻区域包含二个额外瓶中信', 'adj-msg-2'],
    ['相邻区域包含两个额外的罪魂牢笼', 'adj-spirit-2'],
    ['相邻区域包含三个额外的神圣的秘宝', 'adj-divbox-2'],
    ['相邻区域包含四个额外黄金灯笼', 'adj-lantern'],
    ['相邻区域包含 ８（８－１０）个额外螃蟹群 — 数值不可调整', 'adj-crab-1'],
  ])('maps semantically equivalent count and particle wording %s', (text, id) => {
    expect(matchChineseChartImplicit(text)).toBe(id)
  })
  it.each([
    '相邻区域包含六个额外保险箱',
    '相邻区域包含一个额外的罪魂牢笼，每个牢笼增加奖励',
    '所有航行区域包含一个额外的罪魂牢笼',
    '本区域包含一个额外的罪魂牢笼',
    '相邻区域不包含一个额外的罪魂牢笼',
    '相邻区域包含一个额外保险桶',
    '相邻区域包含一个额外被囚禁的怪物',
    '相邻区域包含二十一个额外瓶中信',
    '相邻区域包含 99(8-10) 个额外螃蟹群',
  ])('refuses changes in quantity, scope or mechanism despite similar wording: %s', (text) => {
    expect(matchChineseChartImplicit(text)).toBeNull()
  })
  it('maps the real advanced crab roll to its existing adjacent effect', () => {
    expect(matchChineseChartImplicit('相邻区域包含 8(8-10) 个额外的螃蟹群 — 数值不可调整')).toBe('adj-crab-1')
  })
})

// This reviewed corpus is a source-selection record independent of the generated
// library, so wrong internal-ID linkage or scope/tier collapse remains observable.
import reviewed from '../../samples/text-library/mappings.reviewed.json'
import { TEXT_LIBRARY } from './textLibrary'

describe('acquired candidate corpus', () => {
  it.each(reviewed.filter((record) => !record.internalId.startsWith('b-') && /个额外/.test(record.cnText)))(
    'keeps the reviewed $internalId when the count clause adds or omits 的', (record) => {
      expect(matchChineseChartImplicit(record.cnText.replace(/个额外的?/g, '个额外的'))).toBe(record.internalId)
      expect(matchChineseChartImplicit(record.cnText.replace(/个额外的?/g, '个额外'))).toBe(record.internalId)
    },
  )
  it.each(reviewed.filter((record) => record.internalId.startsWith('adj-') || record.internalId.startsWith('voy-')))(
    'maps reviewed $internalId without changing scope or tier', (record) => {
      expect(matchChineseChartImplicit(record.cnText)).toBe(record.internalId)
      const actual = TEXT_LIBRARY.records.find((entry) => entry.internalId === record.internalId)
      expect(actual?.scope).toBe(record.repoScope)
      expect(actual?.tier).toEqual({ requiredLevel: record.requiredLevel })
    },
  )
  it.each(reviewed.filter((record) => record.internalId.startsWith('b-')))(
    'exposes the independently reviewed border $internalId', (record) => {
      const actual = TEXT_LIBRARY.records.find((entry) => entry.internalId === record.internalId)
      expect(actual?.cnText).toBe(record.cnText)
      expect(actual?.enText).toBe(record.enText)
      expect(actual?.scope).toBe('border')
    },
  )
  it('accepts derived fullwidth punctuation, spaced ranges and Windows whitespace without inventing aliases', () => {
    expect(matchChineseChartImplicit('\r\n相邻区域包含 ８ （ ８ － １０ ） 个额外的螃蟹群　—　数值不可调整\r\n')).toBe('adj-crab-1')
    expect(matchChineseChartImplicit('所有航行区域的怪物群规模提高 ５％\r\n')).toBe('voy-pack-1')
  })
  it('rejects impossible advanced rolls even when their displayed tier is known', () => {
    expect(matchChineseChartImplicit('相邻区域包含 99(8-10) 个额外的螃蟹群')).toBeNull()
  })
  it('rejects range-free rolls for ranged source templates instead of guessing a tier', () => {
    expect(matchChineseChartImplicit('相邻区域包含 8 个额外的螃蟹群')).toBeNull()
    expect(matchChineseChartImplicit('相邻区域包含 2 个额外被囚禁的怪物')).toBeNull()
  })
  it('keeps adjacent and voyage pack-size effects distinct', () => {
    expect(matchChineseChartImplicit('所有航行区域的怪物群规模提高 7%')).toBe('voy-pack-2')
    expect(matchChineseChartImplicit('相邻区域的魔法怪物数量提高 60%')).toBe('adj-magic-2')
    expect(matchChineseChartImplicit('相邻区域包含 12(11-14) 个额外的螃蟹群 — 数值不可调整')).toBe('adj-crab-2')
    expect(matchChineseChartImplicit('相邻区域包含 5 个额外保险箱')).toBe('adj-box-3')
  })
  it('does not guess unknown mechanics, reward conflicts or unsupported shapes', () => {
    expect(matchChineseChartImplicit('相邻区域包含 99 个额外螃蟹群')).toBeNull()
    expect(matchChineseChartImplicit('相邻区域中找到的物品数量提高 55%')).toBeNull()
    expect(matchChineseChartImplicit('海图形状：十字')).toBeNull()
    expect(TEXT_LIBRARY.records.filter((record) => record.kind === 'shape' && record.status === 'missing')).toEqual([])
    expect(TEXT_LIBRARY.records.filter((record) => record.kind === 'shape' && record.status === 'confirmed').map((record) => [record.internalId, record.cnText])).toEqual([
      ['End', '端点'], ['Straight', '直线'], ['Corner', '角落'], ['Junction', '节点'], ['Crossing', '交叉'],
    ])
  })

})
