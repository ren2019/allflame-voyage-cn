import { readFileSync } from 'node:fs'
import { test, expect } from './offline'
import { exportState, loadState, openEmptyApp } from './acceptance-helpers'
import type { AppState } from '../../src/logic/storage'

const inventory: AppState = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url), 'utf8'))
const choices = [
  ['琪莎拉 Boss 速刷', 'kishara-boss-rush'],
  ['点金速刷', 'alc-and-go'], ['锚地赐福', 'anchorfield-fishing'],
  ['速刷保险箱', 'milky-speedrun'], ['稀有怪传说装', 'milky-meatfish'],
  ['魔法怪流', 'milky-ethereal'], ['稀有怪神圣雨', 'divine-border-rares'],
  ['神圣保险箱', 'cutedog-divine-boxes'], ['无策略（手动）', null],
] as const

test('右栏集中选择八策略和手动，玩法同步且导出仅改变所选策略', async ({ page }) => {
  await openEmptyApp(page)
  await loadState(page, inventory)
  const before = await exportState(page)
  const sidebar = page.locator('.solver-col')
  const options = sidebar.getByRole('group', { name: '当前策略', exact: true })
  await expect(options.getByRole('button')).toHaveCount(9)
  await expect(page.getByRole('combobox', { name: '当前策略', exact: true })).toHaveCount(0)
  for (const [name, id] of choices) {
    const button = options.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(options.locator('[aria-pressed=true]')).toHaveCount(1)
    await expect(sidebar.getByRole('complementary', { name: '策略玩法说明' })).toContainText(id ? `${name} · 玩法` : '手动规划')
    if (id) await expect(sidebar.locator('.strategy-summary')).toContainText(name)
    else await expect(sidebar.locator('.strategy-manual-note')).toContainText('奖励权重')
    expect(await exportState(page)).toEqual({ ...before, strategyId: id })
  }
})

test('双推荐清楚说明发现条件、目标、缺项和点击作用，选择不自动执行航程', async ({ page }) => {
  await openEmptyApp(page)
  await loadState(page, { ...inventory, pool: [], board: Array(9).fill(null), borders: Array(12).fill(null) })
  const sidebar = page.locator('.solver-col')
  const recommendations = sidebar.getByRole('region', { name: '策略推荐', exact: true })
  await expect(recommendations).toHaveCount(0)
  const incomplete: AppState = {
    ...inventory, strategyId: 'alc-and-go', board: Array(9).fill(null),
    borders: ['b-divine', ...Array(11).fill(null)],
    pool: [{ ...inventory.pool[0], uid: 'recommendation-noequip', modIds: ['voy-noequip'] }],
  }
  await loadState(page, incomplete)
  const before = await exportState(page)
  const meatfish = recommendations.getByRole('article', { name: '推荐稀有怪传说装', exact: true })
  const divine = recommendations.getByRole('article', { name: '推荐稀有怪神圣雨', exact: true })
  await expect(meatfish).toContainText('发现：库存中有“怪物无法掉落装备”海图')
  await expect(meatfish).toContainText('可用于：稀有怪传说装')
  await expect(meatfish).toContainText('尚缺：2× 巨型海星海图')
  await expect(meatfish).toContainText('2× 海之柱海图（角落）')
  await expect(divine).toContainText('发现：边界有“稀有怪物额外掉落神圣石”')
  await expect(divine).toContainText('可用于：稀有怪神圣雨')
  await expect(divine).toContainText('5× 提高稀有怪数量海图')
  await expect(meatfish).toContainText('可先切换查看玩法，建议补齐后运行')
  await expect(recommendations).toContainText('切换只更改当前策略，不会自动求解或预留海图')
  await expect(recommendations).not.toContainText(/仍然切换|关键奖励|已锁定保留/)
  expect(await exportState(page)).toEqual(before)
  await meatfish.getByRole('button', { name: '切换到稀有怪传说装', exact: true }).click()
  expect(await exportState(page)).toEqual({ ...before, strategyId: 'milky-meatfish' })
  await expect(meatfish).toHaveCount(0)
  await expect(divine).toBeVisible()
  await divine.getByRole('button', { name: '切换到稀有怪神圣雨', exact: true }).click()
  expect(await exportState(page)).toEqual({ ...before, strategyId: 'divine-border-rares' })
  await expect(divine).toHaveCount(0)
  await expect(meatfish).toBeVisible()
  await loadState(page, { ...incomplete, pool: [] })
  await expect(meatfish).toHaveCount(0)
  await expect(divine).toBeVisible()
  await loadState(page, { ...incomplete, borders: Array(12).fill(null) })
  await expect(divine).toHaveCount(0)
  await expect(meatfish).toBeVisible()
  await loadState(page, { ...incomplete, pool: [], borders: Array(12).fill(null) })
  await expect(recommendations).toHaveCount(0)
})

test('材料检查通过也不保证九格可执行，双主题下推荐仅选择策略并位于攻略之前', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  // Existing material checks tally each requirement independently. Five charts
  // can pass those checks; they are intentionally insufficient to fill nine cells.
  await loadState(page, {
    ...inventory, strategyId: 'alc-and-go', board: Array(9).fill(null),
    borders: ['b-divine', ...Array(11).fill(null)],
    pool: Array.from({ length: 5 }, (_, i) => ({
      ...inventory.pool[0], uid: `recommendation-ready-${i}`, areaType: 'sea-pillars',
      modIds: ['voy-noequip', 'adj-star-1', 'adj-pantheon', 'adj-lantern', 'voy-possess', 'adj-box-3', 'voy-rare'],
    })),
  })
  const before = await exportState(page)
  const sidebar = page.locator('.solver-col')
  const recommendations = sidebar.getByRole('region', { name: '策略推荐', exact: true })
  for (const theme of ['light', 'dark']) {
    const themeButton = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
    if (await themeButton.count()) await themeButton.click()
    await expect(recommendations.getByRole('article')).toHaveCount(2)
    for (const article of await recommendations.getByRole('article').all()) {
      await expect(article).toContainText('材料齐备（按策略材料与必要边界检查）')
      await expect(article).toContainText('仍需检查九格摆盘与连接，不保证收益')
      await expect(article).not.toContainText('尚缺：')
      await expect(article.getByRole('button')).toBeEnabled()
    }
    const positions = await sidebar.evaluate(node => {
      const rect = (selector: string) => node.querySelector(selector)!.getBoundingClientRect()
      return {
        optionsBottom: rect('.strategy-options').bottom,
        summaryTop: rect('.strategy-summary').top,
        controlsBottom: rect('.strategies').bottom,
        recommendationTop: rect('.strategy-recommendations').top,
        recommendationBottom: rect('.strategy-recommendations').bottom,
        guideTop: rect('.strategy-guide').top,
      }
    })
    expect(positions.optionsBottom).toBeLessThanOrEqual(positions.summaryTop)
    expect(positions.controlsBottom).toBeLessThanOrEqual(positions.recommendationTop)
    expect(positions.recommendationBottom).toBeLessThanOrEqual(positions.guideTop)
    await sidebar.screenshot({ path: testInfo.outputPath(`strategy-recommendations-${theme}.png`) })
    expect(await exportState(page)).toEqual(before)
  }
  await recommendations.getByRole('button', { name: '切换到稀有怪神圣雨', exact: true }).click()
  expect(await exportState(page)).toEqual({ ...before, strategyId: 'divine-border-rares' })
  await expect(sidebar.locator('.strat-ready')).toBeVisible()
  await expect(sidebar.locator('.strat-ready')).toContainText('仍需检查九格摆盘与连接，不保证收益')
})
