import { test, expect } from './offline'
import { openEmptyApp, loadState, exportState } from './acceptance-helpers'
import { readFileSync } from 'node:fs'
import type { AppState } from '../../src/logic/storage'

const fixture = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url), 'utf8'))
const pool = Array.from({ length: 9 }, (_, i) => ({
  uid: `monster-${i}`, name: `怪物场景 ${i + 1}`, level: 83,
  edges: [true, true, true, true],
  modIds: i === 4 ? ['adj-lantern', 'adj-star-1', 'adj-rare-1', 'adj-magic-1'] : [],
  areaType: i === 1 ? 'infested-bathyspheres' : 'abyssal-plain',
}))
const state = {
  ...fixture, strategyId: 'milky-meatfish', pool,
  board: pool.map(chart => ({ chartUid: chart.uid, rotation: 0 })),
  borders: Array(12).fill(null),
} as AppState

test('怪物策略先收灯笼、同格两动作，策略切换保留实际潜航球名称及只读显示', async ({ page }) => {
  await openEmptyApp(page)
  await loadState(page, state)
  const before = await exportState(page)
  const actions = page.getByLabel(/打法行动 \d：/)
  await expect(actions).toHaveCount(4)
  await expect(page.getByRole('group', { name: '区域 4 打法顺序', exact: true })).toHaveText('1收黄金灯笼4处理巨型海星')
  await expect(page.getByRole('group', { name: '区域 2 打法顺序', exact: true })).toHaveText('2收黄金灯笼3处理巨型海星')
  await expect(page.getByRole('group', { name: '区域 5 打法顺序', exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await page.getByRole('checkbox', { name: '打法顺序', exact: true }).uncheck()
  await expect(actions).toHaveCount(0)
  await page.getByRole('checkbox', { name: '打法顺序', exact: true }).check()
  await expect(actions).toHaveCount(4)
  expect(await exportState(page)).toEqual(before)

  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '魔法怪流', exact: true }).click()
  await expect(actions).toHaveCount(4)
  await expect(page.getByRole('group', { name: '区域 2 打法顺序', exact: true })).toHaveText('2收黄金灯笼3处理感染潜航球')
  await expect(page.getByRole('group', { name: '区域 4 打法顺序', exact: true })).toHaveText('1收黄金灯笼4处理魔法怪')
  const afterStrategy = await exportState(page)
  expect(afterStrategy).toEqual({ ...before, strategyId: 'milky-ethereal' })
  await page.getByLabel('区域 2 目标', { exact: true }).getByRole('button', { name: /感染潜航球/ }).click()
  await expect(page.getByRole('dialog', { name: '区域 2 目标详情', exact: true })).toContainText('感染潜航球')
  await page.keyboard.press('Escape')
  expect(await exportState(page)).toEqual(afterStrategy)
})

test('灯笼与怪物同格两编号在起点、四槽图标及两主题窄屏中可读，交换后随目标移动', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  const layout = structuredClone(state)
  layout.pool[4].modIds = ['adj-lantern', 'adj-magic-1', 'adj-box-1']
  layout.pool[0].areaType = 'sea-pillars'
  layout.pool[6].areaType = 'sea-pillars'
  await loadState(page, layout)
  const tiles = page.locator('.board-grid .tile')
  await tiles.nth(4).click()
  await tiles.nth(3).click()
  const start = page.getByRole('group', { name: '区域 7 打法顺序', exact: true })
  await expect(start).toHaveText('1收黄金灯笼4处理巨型海星')
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  const afterSwap = await exportState(page)
  for (const mode of ['rare', 'magic']) {
    if (mode === 'magic') {
      const magic = structuredClone(afterSwap)
      magic.strategyId = 'milky-ethereal'
      magic.pool[0].areaType = 'infested-bathyspheres'
      await loadState(page, magic)
      await expect(page.getByLabel('打法行动 3：处理感染潜航球', { exact: true })).toBeVisible()
    }
    const beforeDisplay = await exportState(page)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['dark', 'light']) {
        const toggle = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
        if (await toggle.count()) await toggle.click()
        await page.mouse.move(1, 1)
        await start.scrollIntoViewIfNeeded()
        await expect(start).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.locator('.board-wrap').screenshot({ path: testInfo.outputPath(`monster-two-actions-${mode}-${theme}-${width}.png`) })
        for (const tile of await page.locator('.tile.with-region-actions').all()) {
          const bounds = await tile.evaluate(element => {
            const overlay = element.querySelector('.region-overlay')!.getBoundingClientRect()
            const tile = element.getBoundingClientRect()
            const score = element.querySelector('.tile-score')!.getBoundingClientRect()
            const summary = element.querySelector('.tile-duo,.tile-duo-text')?.getBoundingClientRect()
            const start = element.querySelector('.tile-start')?.getBoundingClientRect()
            return { inside: overlay.left >= tile.left && overlay.right <= tile.right,
              aboveScore: overlay.bottom <= score.top,
              aboveStart: !start || overlay.bottom <= start.top,
              belowSummary: !summary || overlay.top >= summary.bottom }
          })
          expect(bounds, `${theme} ${width}px`).toEqual({ inside: true, aboveScore: true, aboveStart: true, belowSummary: true })
        }
      }
    }
    expect(await exportState(page)).toEqual(beforeDisplay)
  }
})

test('旋转后排除断路目标；缺灯笼、无对应目标和恢复备份不保留旧编号', async ({ page }) => {
  await openEmptyApp(page)
  const connected = structuredClone(state)
  connected.pool[3].edges = [false, false, true, false]
  await loadState(page, connected)
  const blocked = page.getByRole('group', { name: '区域 4 打法顺序', exact: true })
  await expect(blocked).toHaveCount(1)
  await page.locator('.board-grid .tile').nth(3).hover()
  await page.locator('.board-grid .tile').nth(3).getByTitle('旋转', { exact: true }).click()
  await expect(blocked).toHaveCount(0)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  // The target still exists under physical adjacency; its disconnected
  // cell has no sailing action, which is a different responsibility.
  await expect(page.getByLabel('区域 4 目标', { exact: true }).getByRole('button', { name: /黄金灯笼/ })).toBeVisible()

  const one = structuredClone(state)
  one.strategyId = 'milky-ethereal'
  one.pool.forEach((chart, cell) => { chart.modIds = []; chart.areaType = cell === 6 ? 'infested-bathyspheres' : 'abyssal-plain' })
  await loadState(page, one)
  await expect(page.getByLabel(/打法行动 \d：/)).toHaveCount(1)
  await expect(page.getByLabel('打法行动 1：处理感染潜航球', { exact: true })).toBeVisible()
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '稀有怪传说装', exact: true }).click()
  await expect(page.getByLabel(/打法行动 \d：/)).toHaveCount(0)
  await expect(page.getByText(/先收集实际灯笼/)).toHaveCount(0)
  await loadState(page, state)
  await expect(page.getByLabel(/打法行动 \d：/)).toHaveCount(4)
})
