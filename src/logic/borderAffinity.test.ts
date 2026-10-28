import { describe, expect, it } from 'vitest'
import { BORDER_AFFINITY_RULES, evaluateBorderAffinity } from './borderAffinity'
import { STRATEGIES } from '../data/strategies'
import { BORDER_MODS } from '../data/mods'

describe('边界适配分', () => {
  it('十二条逐项查表，重复的稀有怪边界累计，独立显示必要边界', () => {
    const borders = ['b-divine', 'b-rare-1', 'b-rare-1', ...Array(9).fill('b-exp-1')]
    const result = evaluateBorderAffinity('divine-border-rares', borders)
    expect(result.status).toBe('complete')
    expect(result.total).toBe(20)
    expect(result.contributions.map((entry) => entry.weight)).toEqual([10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(result.requiredBorder).toEqual({ id: 'b-divine', present: true })
  })
  it('更换策略重新查权重，高总分不能掩盖必要边界缺失', () => {
    const borders = Array(12).fill('b-rare-1')
    expect(evaluateBorderAffinity('divine-border-rares', borders)).toMatchObject({ total: 60, requiredBorder: { id: 'b-divine', present: false } })
    expect(evaluateBorderAffinity('milky-ethereal', borders)).toMatchObject({ total: 0, requiredBorder: null })
    expect(evaluateBorderAffinity('milky-ethereal', Array(12).fill('b-minmagic')).total).toBe(120)
  })

  it('未选策略、少于十二条与未知规则不冒充零分', () => {
    expect(evaluateBorderAffinity(null, Array(12).fill('b-pack-1'))).toMatchObject({ status: 'no-strategy', total: null })
    expect(evaluateBorderAffinity('alc-and-go', ['b-pack-1'])).toMatchObject({ status: 'incomplete', total: null })
    expect(evaluateBorderAffinity('alc-and-go', [...Array(11).fill('b-pack-1'), null])).toMatchObject({ status: 'incomplete', total: null })
    expect(evaluateBorderAffinity('future-strategy', Array(12).fill('b-pack-1'))).toMatchObject({ status: 'unsupported', total: null })
    expect(evaluateBorderAffinity('alc-and-go', [...Array(11).fill('b-pack-1'), 'future-border'])).toMatchObject({ status: 'unsupported', total: null })
  })

  it('琪莎拉保图边界按50%=10、30%=8累加，其他边界零专项分且未知仍未知', () => {
    const result = evaluateBorderAffinity('kishara-boss-rush', ['b-keep-1', 'b-keep-2', 'b-keep-2', ...Array(9).fill('b-pack-1')])
    expect(result.total).toBe(28)
    expect(result.contributions.slice(0, 3).map((c) => c.weight)).toEqual([8, 10, 10])
    expect(evaluateBorderAffinity('kishara-boss-rush', ['future', ...Array(11).fill('b-keep-2')])).toMatchObject({ status: 'unsupported', total: null })
    expect(evaluateBorderAffinity('kishara-boss-rush', ['b-keep-1']).contributions[0].weight).toBe(8)
  })

  it('不能把版本配置中的无效权重当作完整评估', () => {
    const rules = structuredClone(BORDER_AFFINITY_RULES)
    rules.strategies['alc-and-go'].weights['b-pack-1'].weight = Number.NaN
    expect(evaluateBorderAffinity('alc-and-go', Array(12).fill('b-pack-1'), rules)).toMatchObject({ status: 'unsupported', total: null })
  })

  it('初版表覆盖每种当前策略和边界，并给每条权重可追溯的解释', () => {
    for (const strategy of STRATEGIES) {
      const profile = BORDER_AFFINITY_RULES.strategies[strategy.id]
      expect(profile.requiredBorderId).toBe(strategy.requiresBorderId?.id ?? null)
      for (const border of BORDER_MODS) {
        const rule = profile.weights[border.id]
        expect(Number.isFinite(rule.weight)).toBe(true)
        expect(rule.reason.length).toBeGreaterThan(10)
        expect(rule.sourceIds.length).toBeGreaterThan(0)
        for (const sourceId of rule.sourceIds) expect(BORDER_AFFINITY_RULES.sources[sourceId].url).toMatch(/^https:\/\//)
      }
    }
  })
})
