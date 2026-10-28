import { describe, expect, it } from 'vitest'
import samples from '../../samples/charted.zh-CN.txt?raw'
import { parseChartText } from './parser'
import { buildBestModRegex, buildSingleChartSearch } from './regex'
import searchOracle from '../../tests/fixtures/acceptance/game-search.expected.json'
import { ALL_GOOD_MODS_REGEX, strategyById } from '../data/strategies'

describe('mainland single-chart game locator', () => {
  it('uses the real implicit verbatim and 区域等级 for both acquired charts', () => {
    const charts = parseChartText(samples).charts
    expect(charts.map(buildSingleChartSearch)).toEqual([
      '航海 冒险 珊瑚暗礁海图 相邻区域包含 8(8-10) 个额外的螃蟹群 — 数值不可调整 区域等级 83',
      '航海 深入 金沙海床海图 所有航行区域的怪物群规模提高 5% 区域等级 83',
    ])
  })
  it('produces Chinese best-mod search text that matches the acquired voyage rare sentence', () => {
    const result = buildBestModRegex({ 'voyage:rare': 1 }, 50, undefined, 'zh-CN')
    expect(result.included.map((mod) => mod.id)).toEqual(['voy-rare'])
    expect(result.regex).toMatch(/\p{Script=Han}/u)
    expect(new RegExp(result.regex).test('所有航行区域的稀有怪物数量提高 25%')).toBe(true)
  })
})

describe('existing strategy game-search recipes use reviewed Chinese source phrases', () => {
  it.each(searchOracle.cases)('$recipe matches acquired/derived $id: $text', (example) => {
    const expression = example.recipe === 'master' ? ALL_GOOD_MODS_REGEX : strategyById.get(example.recipe)!.searchRegex!
    expect(expression).toMatch(/\p{Script=Han}/u)
    const regex = new RegExp(expression.replace(/^"|"$/g, ''))
    // Keep the acquired fixture intact; apply the user's 2026-10-28 terminology decision.
    expect(regex.test(example.text.replace(/瓶中信/g, '漂流瓶'))).toBe('matches' in example ? example.matches : true)
  })
})


it('uses the current mainland bottle name for old imported text without rewriting the inventory', () => {
  const chart = { uid: 'legacy-bottle', name: '合成海图', level: 83, edges: [true, true, true, true] as [boolean, boolean, boolean, boolean], modIds: ['adj-msg-1'], implicitText: '相邻区域包含 1 个额外瓶中信' }
  expect(buildSingleChartSearch(chart)).toContain('漂流瓶')
  expect(buildSingleChartSearch(chart)).not.toContain('瓶中信')
  expect(chart.implicitText).toBe('相邻区域包含 1 个额外瓶中信')
})
