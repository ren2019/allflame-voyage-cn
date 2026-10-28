import { test, expect } from './offline'
import { openEmptyApp, loadState, exportState } from './acceptance-helpers'
import { readFileSync } from 'node:fs'
import type { AppState } from '../../src/logic/storage'
import type { ChartData } from '../../src/types'
import type { Page, TestInfo } from '@playwright/test'

const fixture = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url), 'utf8'))
const chart = (i: number, modIds: string[] = [], areaType: ChartData['areaType'] = 'abyssal-plain'): ChartData => ({
  uid: `strategy-action-${i}`, name: `测试区域 ${i + 1}`, level: 83,
  edges: [true, true, true, true], modIds, areaType,
})
const planningState = (pool: ChartData[], strategyId: string | null, borders = Array(12).fill(null)): AppState => ({
  ...fixture, strategyId, pool, board: pool.map(chart => ({ chartUid: chart.uid, rotation: 0 })), borders,
})


async function verifyActionLayout(page: Page, testInfo?: TestInfo) {
  const actions = page.getByRole('note', { name: /打法行动/ })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['dark', 'light']) {
      const toggle = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
      if (await toggle.count()) await toggle.click()
      await actions.first().scrollIntoViewIfNeeded()
      for (const action of await actions.all()) await expect(action).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const bounds = await actions.first().evaluate(element => {
        const action = element.getBoundingClientRect(), tile = element.closest('.tile')!.getBoundingClientRect()
        return { inside: action.left >= tile.left && action.right <= tile.right, noClip: element.scrollWidth <= element.clientWidth }
      })
      expect(bounds).toEqual({ inside: true, noClip: true })
      await page.mouse.move(0, 0)
      if (testInfo) await page.locator('.board-wrap').screenshot({ path: testInfo.outputPath(`actions-${theme}-${width}.png`) })
    }
  }
}

test('琪莎拉仅标实际Boss，缺目标与手动模式不凑号，显示只读', async ({ page }) => {
  await openEmptyApp(page)
  const pool = Array.from({ length: 9 }, (_, i) => chart(i, [], i === 2 ? 'kisharas-rest' : 'abyssal-plain'))
  await loadState(page, planningState(pool, 'kishara-boss-rush'))
  const before = await exportState(page)
  const actions = page.getByRole('note', { name: /打法行动/ })
  await expect(actions).toHaveCount(1)
  await expect(page.getByRole('group', { name: '区域 3 打法顺序', exact: true })).toHaveText('1琪莎拉 Boss')
  await verifyActionLayout(page)
  await page.getByRole('checkbox', { name: '打法顺序', exact: true }).uncheck()
  await expect(actions).toHaveCount(0)
  await page.getByRole('checkbox', { name: '打法顺序', exact: true }).check()
  expect(await exportState(page)).toEqual(before)
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '无策略（手动）', exact: true }).click()
  await expect(actions).toHaveCount(0)
  await loadState(page, planningState(pool.map(c => ({ ...c, areaType: 'abyssal-plain' })), 'kishara-boss-rush'))
  await expect(actions).toHaveCount(0)
})

test('保险箱仅编号实际接收四邻，重复来源合并；漂流瓶用独立互动文案', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  const pool = Array.from({ length: 9 }, (_, i) => chart(i, i === 4 ? ['adj-box-1', 'adj-box-2', 'adj-arcbox-1', 'adj-opbox-1', 'adj-divbox-1'] : []))
  await loadState(page, planningState(pool, 'milky-speedrun'))
  const before = await exportState(page)
  const actions = page.getByRole('note', { name: /打法行动/ })
  await expect(actions).toHaveCount(4)
  for (const [cell, order] of [[3, 1], [1, 2], [5, 3], [7, 4]]) {
    const group = page.getByRole('group', { name: `区域 ${cell + 1} 打法顺序`, exact: true })
    await expect(group).toContainText(`${order}保险箱开箱前洗练`)
  }
  await expect(page.getByRole('group', { name: '区域 5 打法顺序', exact: true })).toHaveCount(0)
  await verifyActionLayout(page)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await page.locator('.region-targets').nth(1).getByRole('button', { name: /箱子/ }).click()
  const details = page.getByRole('dialog', { name: '区域 2 目标详情', exact: true })
  await expect(details).toContainText('普通保险箱')
  await expect(details).toContainText('侦探保险箱')
  await page.keyboard.press('Escape')
  expect(await exportState(page)).toEqual(before)
  const bottlePool = pool.map((c, i) => ({ ...c, modIds: [], areaType: i === 6 ? 'clam-infested-shelf' as const : 'abyssal-plain' as const }))
  await loadState(page, planningState(bottlePool, 'milky-speedrun'))
  await expect(actions).toHaveCount(1)
  await expect(actions).toHaveAccessibleName('打法行动 1：互动漂流瓶')
  await expect(page.getByText('开箱前洗练', { exact: true })).toHaveCount(0)
  await verifyActionLayout(page, testInfo)
})

test('两种神圣策略仅标真实边界生效格，移除边界同步清空且计分停用不删目标', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  const pool = Array.from({ length: 9 }, (_, i) => chart(i, i === 4 ? ['adj-box-1'] : []))
  const state = { ...planningState(pool, 'divine-border-rares', [null, 'b-divine', ...Array(10).fill(null)]), disabledMods: ['b-divine', 'adj-box-1'] }
  await loadState(page, state)
  const actions = page.getByRole('note', { name: /打法行动/ })
  await expect(actions).toHaveCount(1)
  await expect(page.getByRole('group', { name: '区域 2 打法顺序', exact: true })).toHaveText('1神圣稀有怪')
  await verifyActionLayout(page)
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '神圣保险箱', exact: true }).click()
  await expect(actions).toHaveCount(1)
  await expect(page.getByRole('group', { name: '区域 2 打法顺序', exact: true })).toHaveText('1神圣保险箱开箱前洗练')
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await verifyActionLayout(page, testInfo)
  await page.getByRole('button', { name: '清空边界', exact: true }).click()
  await expect(actions).toHaveCount(0)
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '稀有怪神圣雨', exact: true }).click()
  await expect(actions).toHaveCount(0)
})

test('点金只筛选已有75及以上目标，低权重不凑号，最多四行动', async ({ page }) => {
  await openEmptyApp(page)
  const pool = Array.from({ length: 9 }, (_, i) => chart(i, i === 4 ? ['adj-box-1'] : []))
  await loadState(page, planningState(pool, 'alc-and-go', ['b-locker', 'b-anchor-1', ...Array(10).fill(null)]))
  const actions = page.getByRole('note', { name: /打法行动/ })
  await expect(actions).toHaveCount(1)
  await expect(page.getByRole('group', { name: '区域 2 打法顺序', exact: true })).toHaveText('1沿途目标')
  await expect(page.getByRole('group', { name: '区域 1 打法顺序', exact: true })).toHaveCount(0)
  const many = pool.map((c, i) => ({ ...c, modIds: i === 4 ? ['adj-arcbox-1'] : [], areaType: i === 6 ? 'clam-infested-shelf' as const : 'abyssal-plain' as const }))
  await loadState(page, planningState(many, 'alc-and-go'))
  await expect(actions).toHaveCount(4)
  for (const [cell, order] of [[6, 1], [3, 2], [1, 3], [5, 4]])
    await expect(page.getByRole('group', { name: `区域 ${cell + 1} 打法顺序`, exact: true })).toHaveText(`${order}沿途目标`)
  await verifyActionLayout(page)
})
