import { describe, expect, it } from 'vitest'
import samples from '../../samples/charted.zh-CN.txt?raw'
import tormentedCage from '../../samples/charted-tormented-cage.zh-CN.txt?raw'
import { isChartClipboardText, parseChartText } from './parser'

const originals = samples.trim().split(/\n\s*(?=物品类别: 海图)/)
export const first = originals[0]
export const second = originals[1]

describe('mainland client import through the public parser', () => {
  it.each([
    ['相邻区域包含一个额外的保险箱', 'adj-box-1'],
    ['相邻区域包含两个额外的瓶中信', 'adj-msg-2'],
  ])('imports derived equivalent count wording without changing the stored implicit: %s', (implicit, id) => {
    const text = tormentedCage.replace('相邻区域包含一个额外罪魂牢笼 — 数值不可调整', implicit)
    const result = parseChartText(text)
    expect(result.rejected).toEqual([])
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]).toMatchObject({ modIds: [id], implicitText: implicit })
  })
  it.each(['LF', 'CRLF'])('imports the reported chart with a Chinese-numbered adjacent Tormented Cage (%s)', (newline) => {
    const text = newline === 'CRLF' ? tormentedCage.replace(/\n/g, '\r\n') : tormentedCage
    const result = parseChartText(text)
    expect(result.rejected).toEqual([])
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]).toMatchObject({
      name: '海洋 航行 珊瑚密林海图', level: 83, areaType: 'undersea-groves',
      shape: 'Crossing', edges: [true, true, true, true], modIds: ['adj-spirit-1'],
      implicitText: '相邻区域包含一个额外罪魂牢笼 — 数值不可调整',
      rewards: [{ stat: 'quantity', percent: 142 }, { stat: 'sulphur', percent: 30 }, { stat: 'rarity', percent: 22 }],
      rawText: [
        '怪物无法被嘲讽 — 数值不可调整',
        '怪物的行动速度无法被减速至基础以下',
        '怪物的移动速度无法被减速至基础以下 — 数值不可调整',
        '怪物获得相当于其物理伤害 10(10-14)% 的额外混沌伤害',
        '怪物击中时造成 2 秒的死亡凋零',
        '怪物将生命上限的 60(51-80)% 转化为额外能量护盾上限',
        '怪物有 80% 的几率避免元素异常状态',
        '区域内有感电地面，使受到的伤害提高 10%',
      ].join('\n'),
    })
    expect(isChartClipboardText(text)).toBe(true)
  })
  it('imports the first real client chart with its calibrated adjacent effect', () => {
    const result = parseChartText(first)
    expect(result.rejected).toEqual([])
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]).toMatchObject({
      name: '航海 冒险 珊瑚暗礁海图', level: 83,
      areaType: 'clam-infested-shelf', shape: 'End',
      edges: [true, false, false, false], modIds: ['adj-crab-1'],
      implicitText: '相邻区域包含 8(8-10) 个额外的螃蟹群 — 数值不可调整',
      rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 75 }],
    })
    expect(isChartClipboardText(first)).toBe(true)
  })
  it('keeps second real chart area rewards distinct from its whole-voyage effect', () => {
    const result = parseChartText(second)
    expect(result.rejected).toEqual([])
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]).toMatchObject({
      name: '航海 深入 金沙海床海图', level: 83, areaType: 'abyssal-plain',
      shape: 'Straight', edges: [true, false, true, false], modIds: ['voy-pack-1'],
      implicitText: '所有航行区域的怪物群规模提高 5%',
      rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 60 }, { stat: 'packsize', percent: 5 }],
    })
  })
  it('refuses a mainland chart whose crucial voyage effect has no calibrated mapping', () => {
    const unknown = first.replace('相邻区域包含 8(8-10) 个额外的螃蟹群 — 数值不可调整', '明确未知的测试航行词缀')
    const result = parseChartText(unknown)
    expect(result.charts).toEqual([])
    expect(result.rejected).toEqual([{ name: '航海 冒险 珊瑚暗礁海图', reason: 'unrecognised voyage modifier: 明确未知的测试航行词缀' }])
  })
  it.each([
    first.replace(/\{ 基底属性 \}\n[^\n]+\n/, ''),
    first.replace(/(\{ 基底属性 \})\n[^\n]+/, '$1\n'),
  ])('refuses missing or empty crucial voyage modifiers', (text) => {
    expect(parseChartText(text)).toEqual({ charts: [], rejected: [{ name: '航海 冒险 珊瑚暗礁海图', reason: 'missing voyage modifier (基底属性)' }] })
  })
  it('separates a Windows batch into distinct instances without changing fields', () => {
    const result = parseChartText(samples.replace(/\n/g, '\r\n'))
    expect(result.rejected).toEqual([])
    expect(result.charts.map(({ name, modIds, level, shape }) => ({ name, modIds, level, shape }))).toEqual([
      { name: '航海 冒险 珊瑚暗礁海图', modIds: ['adj-crab-1'], level: 83, shape: 'End' },
      { name: '航海 深入 金沙海床海图', modIds: ['voy-pack-1'], level: 83, shape: 'Straight' },
    ])
    expect(new Set(result.charts.map((chart) => chart.uid)).size).toBe(2)
    const withoutUid = (text: string) => parseChartText(text).charts.map(({ uid: _uid, ...chart }) => chart)
    expect(withoutUid(samples.replace(/\n/g, '\r\n'))).toEqual(withoutUid(samples))
  })
  it('uses area level rather than item or requirement level', () => {
    expect(parseChartText(first.replace('区域等级: 83', '区域等级: 71')).charts[0].level).toBe(71)
  })
  it.each([
    [first.replace('海图形状：端点\n', ''), 'missing 海图形状'],
    [first.replace('海图形状：端点', '海图形状：明确未知形状'), 'unknown 海图形状: 明确未知形状'],
    [first.replace('物品类别: 海图', '物品类别: 戒指'), 'not a Chart item'],
  ])('rejects invalid items with their original name and reason', (text, reason) => {
    expect(parseChartText(text)).toEqual({ charts: [], rejected: [{ name: '航海 冒险 珊瑚暗礁海图', reason }] })
  })
  it('keeps valid items when another item in the batch is rejected', () => {
    const unknown = first.replace(/(\{ 基底属性 \}\n)[^\n]+/, '$1明确未知的测试航行词缀')
    const result = parseChartText(`${second}\n\n${unknown}`)
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0].name).toBe('航海 深入 金沙海床海图')
    expect(result.rejected).toEqual([{ name: '航海 冒险 珊瑚暗礁海图', reason: 'unrecognised voyage modifier: 明确未知的测试航行词缀' }])
  })
  it('preserves only explicit downside text alongside the original implicit', () => {
    const result = parseChartText(samples)
    expect(result.charts[0].rawText).toBe('+33(26-40)% 怪物的混沌抗性\n+32(26-40)% 怪物的元素抗性\n怪物生命总增 60(46-60)%\n怪物伤害提高 35(26-35)%\n怪物的法术击中施加缓速')
    expect(result.charts[1].rawText).toBe('怪物有 +80% 的几率压制法术伤害\n+30(26-40)% 怪物的混沌抗性\n+35(26-40)% 怪物的元素抗性\n怪物的法术击中施加缓速\n怪物击中时致盲')
  })
  it('keeps the existing uncharted rejection category for a derived mainland prompt', () => {
    // Prompt candidate from handoff; derived text, not a collected real item.
    const uncharted = first.replace(/(\{ 基底属性 \}\n)[^\n]+/, '$1航行词缀将在完成测绘后揭示')
    expect(parseChartText(uncharted)).toEqual({ charts: [], rejected: [{ name: '航海 冒险 珊瑚暗礁海图', reason: 'not charted yet (run it first to reveal its modifier)' }] })
  })
})
