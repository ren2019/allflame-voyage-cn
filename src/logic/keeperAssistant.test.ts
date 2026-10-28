import { describe, expect, it } from 'vitest'
import { keeperRecommendation } from './keeperAssistant'

// Independent guide/material examples, not generated from config. This is JS semantics,
// not evidence of the game's regex engine or capacity.
function search(strategy: string, text: string) {
  const expression = keeperRecommendation(strategy).regex
  expect(expression).not.toBeNull()
  return new RegExp(expression!.slice(1, -1)).test(text)
}

describe('留图助手完整材料覆盖（未替代游戏实测）', () => {
  it('锚地保留目的地或120%以上数量，不吞掉数字分支或接受低数量', () => {
    expect(search('anchorfield-fishing', '目的地：锚地')).toBe(true)
    for (const quantity of [120, 159, 199, 200, 999]) expect(search('anchorfield-fishing', `物品数量: +${quantity}%`)).toBe(true)
    for (const quantity of [19, 110, 119]) expect(search('anchorfield-fishing', `物品数量: +${quantity}%`)).toBe(false)
    expect(search('anchorfield-fishing', '相邻区域包含 4 个额外黄金灯笼')).toBe(false)
  })
})

it('魔法怪流涵盖攻略全部材料与目的地，不混入稀有怪或箱子条件', () => {
  for (const material of [
    '怪物有几率被 2000 个荒林鬼灵强化', '怪物有几率被 4000 个荒林鬼灵强化',
    '相邻区域包含 4 个额外黄金灯笼', '所有航行区域中的怪物无法掉落装备、药剂或酊剂',
    '所有航行区域的怪物至少为魔法', '相邻区域的魔法怪物数量提高 30%',
    '相邻区域的魔法怪物数量提高 60%', '所有航行区域的魔法怪物数量提高 25%',
    '目的地：感染潜航球',
  ]) expect(search('milky-ethereal', material), material).toBe(true)
  for (const other of ['相邻区域的稀有怪物数量提高 60%', '相邻区域包含 3 个额外侦探的保险箱', '目的地：海之柱']) {
    expect(search('milky-ethereal', other), other).toBe(false)
  }
})

it('两种神圣策略各覆盖自己的目的地和供给材料，不能以旧数量搜索冒充完整覆盖', () => {
  for (const material of ['目的地：海之柱', '相邻区域包含 5 个额外保险箱', '相邻区域包含 1 个额外保险箱', '相邻区域包含 (6—7) 个额外巨型海星', '所有航行区域的稀有怪物数量提高 25%', '相邻区域的稀有怪物数量提高 60%']) {
    expect(search('divine-border-rares', material), material).toBe(true)
  }
  for (const material of ['目的地：远洋深渊', '相邻区域包含 5 个额外保险箱', '相邻区域包含 3 个额外神圣的秘宝', '相邻区域包含 3 个额外奥术师的保险箱', '相邻区域包含 2 个额外侦探的保险箱', '所有航行区域的稀有怪物数量提高 25%', '物品数量: +120%']) {
    expect(search('cutedog-divine-boxes', material), material).toBe(true)
  }
  expect(search('divine-border-rares', '目的地：远洋深渊')).toBe(false)
  expect(search('divine-border-rares', '相邻区域包含 3 个额外侦探的保险箱')).toBe(false)
  expect(search('cutedog-divine-boxes', '相邻区域包含 5 个额外巨型海星')).toBe(false)
  expect(search('cutedog-divine-boxes', '相邻区域的稀有怪物数量提高 60%')).toBe(false)
})

it('速刷与稀有怪传说装保留全部替代材料且区分分裂类型，无规则时不虚构', () => {
  for (const material of ['相邻区域包含 1 个额外漂流瓶', '相邻区域包含 2 个额外神圣的秘宝', '相邻区域包含 2 个额外侦探的保险箱', '物品数量: +110%']) {
    expect(search('milky-speedrun', material), material).toBe(true)
  }
  expect(search('milky-speedrun', '物品数量: +109%')).toBe(false)
  expect(search('milky-speedrun', '相邻区域包含 2 个额外奥术师的保险箱')).toBe(false)
  for (const material of ['相邻区域包含 (4—5) 个额外巨型海星', '相邻区域的稀有怪物将带有众神词缀', '怪物有几率被 4000 个荒林鬼灵强化', '海之柱', '相邻区域包含 4 个额外黄金灯笼', '所有航行区域的稀有怪物有 100% 的几率被附身', '所有航行区域中的怪物无法掉落装备、药剂或酊剂', '所有航行区域的稀有怪物死亡时有 50% 的几率分裂']) {
    expect(search('milky-meatfish', material), material).toBe(true)
  }
  for (const other of ['怪物有几率被 2000 个荒林鬼灵强化', '相邻区域掉落的物品有 2% 的几率分裂', '所有航行区域的怪物至少为魔法']) expect(search('milky-meatfish', other), other).toBe(false)
  expect(keeperRecommendation('alc-and-go').regex).toBeNull()
  expect(keeperRecommendation('alc-and-go').note).toContain('暂无有来源')
  expect(keeperRecommendation('unknown').regex).toBeNull()
})

it('锚地保留攻略中混沌边界可选的稀有怪替代海图，并明示适用条件', () => {
  expect(search('anchorfield-fishing', '相邻区域的稀有怪物数量提高 60%')).toBe(true)
  expect(search('anchorfield-fishing', '所有航行区域的稀有怪物数量提高 25%')).toBe(true)
  expect(keeperRecommendation('anchorfield-fishing').conditions.map((c) => c.label).join('；')).toContain('仅有混沌石边界时')
})
