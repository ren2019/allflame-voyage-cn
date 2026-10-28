import { test, expect } from './offline'
import { defaultState } from '../../src/logic/storage'
import { exportState, loadState, openEmptyApp } from './acceptance-helpers'
import type { ChartData } from '../../src/types'

const inventory = () => {
  const s = defaultState()
  s.pool = Array.from({ length: 9 }, (_, i): ChartData => ({ uid: `public-${i}`, name: `合成海图${i}`, level: 83,
    areaType: i === 0 ? 'kisharas-rest' : 'abyssal-plain', edges: [true, true, true, true], modIds: [] }))
  s.strategyId = 'kishara-boss-rush'; s.mode = 'strict'; s.allowRotation = true
  return s
}

test.afterEach(async ({ page }, info) => {
  if (process.env.PLAYWRIGHT_BASE_URL) await page.screenshot({ path: info.outputPath('synthetic-production.png'), fullPage: true })
})

for (const ids of [['b-keep-1'], ['b-keep-2'], ['b-keep-1', 'b-keep-2'], ['b-keep-2', 'b-keep-2']]) {
  test(`#59 部分边界推荐去重 ${ids.join(',')}`, async ({ page }) => {
    await openEmptyApp(page)
    const s = inventory(); s.strategyId = 'alc-and-go'; s.pool = s.pool.slice(1)
    ids.forEach((id, i) => { s.borders[i] = id })
    await loadState(page, s)
    const recommendation = page.getByRole('article', { name: '推荐琪莎拉 Boss 速刷', exact: true })
    await expect(recommendation).toHaveCount(1)
    await expect(recommendation).toContainText('尚缺：1× 琪莎拉安息处海图')
    await expect(recommendation).toContainText('边界机会提示')
    await expect(recommendation.locator('p').first()).toHaveText(`发现：边界有${ids.includes('b-keep-2') ? '50%' : '30%'}${ids.includes('b-keep-2') && ids.includes('b-keep-1') ? '、30%' : ''}海图不消耗机会`)
    await recommendation.getByRole('button').click()
    const after = await exportState(page)
    expect(after).toEqual({ ...s, strategyId: 'kishara-boss-rush' })
    await expect(recommendation).toHaveCount(0)
    await expect(page.locator('.solve-result')).toHaveCount(0)
  })
}

test('#59 推荐随最后一条保图边界移除而消失，材料齐备不保证合法保图', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.strategyId = 'alc-and-go'; s.borders[0] = 'b-keep-2'
  await loadState(page, s)
  const recommendation = page.getByRole('article', { name: '推荐琪莎拉 Boss 速刷', exact: true })
  await expect(recommendation).toContainText('材料齐备')
  await expect(recommendation).toContainText('仍需检查实际接触')
  s.borders[0] = null; await loadState(page, s)
  await expect(recommendation).toHaveCount(0)
})

for (const scenario of ['fifty', 'thirty', 'fallback', 'none', 'locked', 'impossible'] as const) {
  test(`#59 默认保图与合法回退 ${scenario}`, async ({ page }) => {
    await openEmptyApp(page)
    const s = inventory()
    if (scenario !== 'none') { s.borders[0] = 'b-keep-2'; s.borders[3] = 'b-keep-1' }
    if (['thirty', 'fallback', 'impossible'].includes(scenario)) s.borders[9] = 'b-gold-1' // same top-left cell as 50%
    if (['fallback', 'impossible'].includes(scenario)) s.borders[2] = 'b-gold-2' // same top-right cell as 30%
    if (scenario === 'locked' || scenario === 'impossible') {
      s.pool[0].preserved = true
      s.board[scenario === 'locked' ? 2 : 0] = { chartUid: s.pool[0].uid, rotation: 0 }
    }
    // Even surplus Anchorfields must stay outside every candidate.
    s.pool.push(...['a1', 'a2'].map((uid): ChartData => ({ uid, name: '合成锚地', level: 83, areaType: 'anchorfield', modIds: [], edges: [true, true, true, true] })))
    await loadState(page, s)
    await page.locator('.solve-big').click()
    await expect(page.locator('.solve-big')).not.toContainText('正在求解', { timeout: 30000 })
    const after = await exportState(page)
    if (scenario === 'impossible') {
      expect(after.board).toEqual(s.board)
      await expect(page.locator('.solve-result:not(.invalid)')).toHaveCount(0)
      return
    }
    const expectedCell = scenario === 'fifty' ? 0 : scenario === 'thirty' || scenario === 'locked' ? 2 : 6
    expect(after.board[expectedCell]?.chartUid).toBe('public-0')
    expect(after.board.filter((p) => p?.chartUid === 'public-0')).toHaveLength(1)
    expect(after.board.some((p) => p && ['a1', 'a2'].includes(p.chartUid))).toBe(false)
    await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible()
    if (scenario === 'fifty') {
      await expect(page.locator('.boss-candidate').first()).toContainText('50%')
      await page.locator('.solve-result:not(.invalid)').filter({ hasText: 'Boss 第 7 格' }).first().click()
      expect((await exportState(page)).board[6]?.chartUid).toBe('public-0')
    }
    if (scenario === 'thirty') await expect(page.locator('.solve-bar-note').first()).toContainText('未找到合法50%保图方案，已回退30%')
    if (scenario === 'fallback') await expect(page.locator('.solve-bar-note').first()).toContainText('本次搜索未找到')
  })
}

test('#59 两档边界均为优先档，50%高于30%，未知边界不记零分', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.borders[0] = 'b-keep-1'; s.borders[1] = 'b-keep-2'; s.borders[2] = 'future-border'
  await loadState(page, s)
  await page.locator('.board-wrap').getByRole('button', { name: '边界分析', exact: true }).click()
  const entries = page.getByRole('dialog', { name: '边界分析', exact: true }).locator('.border-affinity-entry')
  await expect(entries.nth(0)).toContainText('10/10 · 优先')
  await expect(entries.nth(1)).toContainText('8/10 · 优先')
  await expect(entries.nth(2)).toContainText('暂无规则')
})
