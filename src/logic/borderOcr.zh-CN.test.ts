import { describe, expect, it } from 'vitest'
import { parseBorderOcrPayload } from './borderOcr'

const block = (text: string, index = 0) =>
  `=== VOYAGE BORDER ${index} ===\n${text}\n=== END VOYAGE BORDER ===`

// Independent literal ID/text pairs from the reviewed Maiden Voyage source
// table. These are source-derived inputs, not client or Windows OCR evidence.
const sourceBorders = [
  ['b-pack-1', '相邻区域的怪物群规模提高 16%'],
  ['b-pack-2', '相邻区域的怪物群规模提高 24%'],
  ['b-pack-3', '相邻区域的怪物群规模提高 32%'],
  ['b-minmagic', '相邻区域的怪物至少为魔法'],
  ['b-rare-1', '相邻区域的稀有怪物数量提高 50%'],
  ['b-rare-2', '相邻区域的稀有怪物数量提高 75%'],
  ['b-rare-3', '相邻区域的稀有怪物数量提高 100%'],
  ['b-beasts-1', '相邻区域包含 8 个额外的海兽群'],
  ['b-beasts-2', '相邻区域包含 12 个额外的海兽群'],
  ['b-beasts-3', '相邻区域包含 16 个额外的海兽群'],
  ['b-crabs-1', '相邻区域包含 8 个额外的螃蟹群'],
  ['b-crabs-2', '相邻区域包含 12 个额外的螃蟹群'],
  ['b-crabs-3', '相邻区域包含 16 个额外的螃蟹群'],
  ['b-drowned-1', '相邻区域包含 8 个额外的溺亡者群'],
  ['b-drowned-2', '相邻区域包含 12 个额外的溺亡者群'],
  ['b-drowned-3', '相邻区域包含 16 个额外的溺亡者群'],
  ['b-mag-1', '相邻区域的词缀数值提高 40%'],
  ['b-mag-2', '相邻区域的词缀数值提高 60%'],
  ['b-mag-3', '相邻区域的词缀数值提高 80%'],
  ['b-keep-1', '相邻海图在开始航行时有 30% 的几率不被消耗'],
  ['b-keep-2', '相邻海图在开始航行时有 50% 的几率不被消耗'],
  ['b-octoboss', '相邻区域包含污秽蟹群'],
  ['b-lanterns', '在相邻区域放置灯笼不会减少你的灯笼数量'],
  ['b-ancient', '相邻区域的稀有怪物掉落 1 个额外远古石'],
  ['b-divine', '相邻区域的稀有怪物掉落 1 个额外神圣石'],
  ['b-exalt', '相邻区域的稀有怪物掉落 1 个额外崇高石'],
  ['b-annul', '相邻区域的稀有怪物掉落 1 个额外剥离石'],
  ['b-chaos', '相邻区域的稀有怪物掉落 1 个额外混沌石'],
  ['b-vaal', '相邻区域的稀有怪物掉落 1 个额外瓦尔宝珠'],
  ['b-gcp', '相邻区域的稀有怪物掉落 1 个额外宝石匠的棱镜'],
  ['b-chrome', '相邻区域的稀有怪物掉落 1 个额外幻色石'],
  ['b-regret', '相邻区域的稀有怪物掉落 1 个额外后悔石'],
  ['b-blessed', '相邻区域的稀有怪物掉落 1 个额外祝福石'],
  ['b-regal', '相邻区域的稀有怪物掉落 1 个额外富豪石'],
  ['b-support', '相邻区域的稀有怪物有 20% 的几率掉落一颗辅助技能石'],
  ['b-locker', '相邻区域包含一个失落的海盗储物箱'],
  ['b-pirates', '相邻区域包含一支盐水腐朽袭掠队'],
  ['b-rareconn-1', '相邻区域中稀有怪物数量按每条连接提高 50%'],
  ['b-rareconn-2', '相邻区域中稀有怪物数量按每条连接提高 75%'],
  ['b-quantconn-1', '相邻区域中找到的物品数量按每条连接降低 50%\n相邻区域中找到的物品数量提高 120%'],
  ['b-quantconn-2', '相邻区域中找到的物品数量按每条连接降低 50%\n相邻区域中找到的物品数量提高 180%'],
  ['b-gold-1', '相邻区域怪物掉落装备的 25% 转化为金币'],
  ['b-gold-2', '相邻区域怪物掉落装备的 50% 转化为金币'],
  ['b-decks', '相邻区域内怪物掉落的基础通货物品将改为掉落为命运卡组'],
  ['b-scarabdrop', '相邻区域的稀有怪物掉落 1 个额外圣甲虫'],
  ['b-curr-1', '相邻区域中找到的通货总增 50%'],
  ['b-curr-2', '相邻区域中找到的通货总增 75%'],
  ['b-curr-3', '相邻区域中找到的通货总增 100%'],
  ['b-scarab-1', '相邻区域中找到的圣甲虫总增 50%'],
  ['b-scarab-2', '相邻区域中找到的圣甲虫总增 75%'],
  ['b-scarab-3', '相邻区域中找到的圣甲虫总增 100%'],
  ['b-rarity-1', '相邻区域中找到物品的稀有度总增 50%'],
  ['b-rarity-2', '相邻区域中找到物品的稀有度总增 75%'],
  ['b-rarity-3', '相邻区域中找到物品的稀有度总增 100%'],
  ['b-crabboss', '相邻区域包含船长灾星'],
  ['b-exp-1', '相邻区域内的玩家获得的经验值提高 100%'],
  ['b-exp-2', '相邻区域内的玩家获得的经验值提高 150%'],
  ['b-exp-3', '相邻区域内的玩家获得的经验值提高 200%'],
  ['b-magicmods', '相邻区域的魔法怪物带有一个额外词缀'],
  ['b-anchor-1', '相邻区域包含 2 个额外宝藏锚'],
  ['b-anchor-2', '相邻区域包含 4 个额外宝藏锚'],
  ['b-sulphdrop', '相邻区域的稀有怪物掉落死者硫磺'],
  ['b-goldlantern', '相邻区域包含 4 个额外黄金灯笼'],
  ['b-izaro', '相邻区域包含 2 座女神祭坛'],
]

describe('mainland border text matching through collector payloads', () => {
  it.each(sourceBorders)('maps reviewed source wording to %s without guessing', (id, text) => {
    const result = parseBorderOcrPayload(block(text, 7))
    expect(result.matches).toEqual([expect.objectContaining({ index: 7, id, confidence: 1 })])
    expect(result.borders[7]).toBe(id)
    expect(result.misses).toEqual([])
  })

  it('matches the client-confirmed singular scarab wording without repairing OCR mistakes', () => {
    const result = parseBorderOcrPayload(block('相邻区域的稀有怪物掉落一个额外圣甲虫', 4))
    expect(result.matches).toEqual([expect.objectContaining({ index: 4, id: 'b-scarabdrop', confidence: 1 })])
    expect(parseBorderOcrPayload(block('相邻区域的稀有怪物掉詹一个额外圣甲虫')).matches).toEqual([])
    expect(parseBorderOcrPayload(block('相邻区域的稀有怪物掉落二个额外圣甲虫')).matches).toEqual([])
  })

  it('joins arbitrarily wrapped Chinese text, normalizes width and keeps the complete two-clause effect', () => {
    const text = '相 邻 区 域 中 找 到 的物品数量按每条连\r\n接降低５０％。\r\n相邻区域中找到的物品数量提高１８０％'
    expect(parseBorderOcrPayload(block(text)).matches[0]?.id).toBe('b-quantconn-2')
  })

  it.each(['1。6', '1、6', '1：6', '1 。；： 6', '１。６'])('does not merge digits across OCR punctuation: %s', (value) => {
    const text = `相邻区域的怪物群规模提高 ${value}%`
    const result = parseBorderOcrPayload(block(text))
    expect(result.matches).toEqual([])
    expect(result.misses).toEqual([{ index: 0, raw: text }])
  })

  it.each([
    '相邻区域的怪物群规模提高 17%',
    '相邻区域的怪物群规模提高 1.6%',
    '相邻区域的怪物群规模提高 -16%',
    '相邻区域的怪物群规模提高 16',
    '相邻区域的怪物群规模降低 16%',
    '所有航行区域的怪物群规模提高 16%',
    '相邻区域的怪物群规模提高 16% 按每条连接',
    '相邻区域的稀有怪物数量按每条连接提高 50%',
    '相邻区域中找到的物品数量按每条连接提高 50%\n相邻区域中找到的物品数量提高 120%',
    '相邻区域中找到的物品数量按每条连接降低 50%',
    '相邻区域中找到的物品数量提高 120%',
    '相邻区域中找到的物品数量按每条连接降低 50%\n相邻区域中找到的物品数量提高 180%\n相邻区域中找到的物品数量提高 120%',
    '相邻区域的怪物群规模提高 16%\n相邻区域的稀有怪物数量提高 50%',
    '相邻区域包含未知的首领',
    '怪物群规模提高 16%',
    'OCR ERROR: 未安装中文识别组件',
  ])('does not infer a changed, incomplete, merged or unknown tooltip: %s', (text) => {
    const result = parseBorderOcrPayload(block(text))
    expect(result.matches).toEqual([])
    expect(result.misses).toEqual([{ index: 0, raw: text }])
  })
})
