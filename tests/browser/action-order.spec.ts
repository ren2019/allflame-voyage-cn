import { test, expect } from './offline'
import { openEmptyApp, loadState, exportState } from './acceptance-helpers'
import { readFileSync } from 'node:fs'
const fixture = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url), 'utf8'))
import type { AppState } from '../../src/logic/storage'

const pool = Array.from({ length: 9 }, (_, i) => ({
  uid: `advice-${i}`, name: `测试区域 ${i + 1}`, level: 83,
  edges: [true, true, true, true], modIds: i === 4 ? ['adj-lantern', 'adj-box-1'] : [],
  areaType: i === 0 ? 'anchorfield' : 'abyssal-plain',
}))
const state = {
  ...fixture, strategyId: 'anchorfield-fishing', pool,
  board: pool.map(chart => ({ chartUid: chart.uid, rotation: 0 })),
  borders: Array(12).fill(null),
} as AppState

test('锚地打法顺序默认可见、图标独立开关且显示操作不改规划', async ({ page }) => {
  await openEmptyApp(page)
  await loadState(page, state)
  const before = await exportState(page)
  const toggle = page.getByRole('checkbox', { name: '打法顺序', exact: true })
  await expect(toggle).toBeChecked()
  const actions = page.getByLabel(/打法行动 \d：/)
  await expect(actions).toHaveCount(4)
  await expect(page.getByRole('group', { name: '区域 1 打法顺序', exact: true })).toContainText('4锚地赐福后开')
  await expect(page.getByRole('group', { name: '区域 7 打法顺序', exact: true })).toContainText('1找赐福')
  await expect(page.getByText(/找赐福仅为探索建议/)).toBeVisible()
  await expect(page.locator('.region-targets')).toHaveCount(0)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await expect(page.locator('.region-targets')).toHaveCount(9)
  await toggle.uncheck()
  await expect(actions).toHaveCount(0)
  await expect(page.locator('.region-targets')).toHaveCount(9)
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(actions).toHaveCount(4)
  await page.getByRole('radio', { name: '关闭', exact: true }).check()
  await expect(actions).toHaveCount(4)
  expect(await exportState(page)).toEqual(before)
})


test('锚地移到起点仍先探索；交换旋转后同步，窄屏与两主题条件可读', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  await loadState(page, state)
  const tiles = page.locator('.board-grid .tile')
  await tiles.nth(0).click()
  await tiles.nth(6).click()
  const anchor = page.getByRole('group', { name: '区域 7 打法顺序', exact: true })
  await expect(anchor).toContainText('4锚地赐福后开')
  await expect(page.getByRole('group', { name: '区域 4 打法顺序', exact: true })).toContainText('1找赐福')
  const afterSwap = await exportState(page)
  await tiles.nth(6).hover()
  await tiles.nth(6).getByTitle('旋转', { exact: true }).click()
  await expect(anchor).toContainText('赐福后开')
  const afterRotate = await exportState(page)
  expect(afterRotate.board[6]?.rotation).toBe((afterSwap.board[6]!.rotation + 1) % 4)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await page.getByLabel('区域 7 目标', { exact: true }).getByRole('button').click()
  await expect(page.getByRole('dialog', { name: '区域 7 目标详情', exact: true })).toContainText('锚地')
  await page.keyboard.press('Escape')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['dark', 'light']) {
      const toggle = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
      if (await toggle.count()) await toggle.click()
      await anchor.scrollIntoViewIfNeeded()
      await expect(anchor).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const tile of await page.locator('.tile.with-region-actions').all()) {
        const bounds = await tile.evaluate(element => {
          const overlay = element.querySelector('.region-overlay')!.getBoundingClientRect()
          const tile = element.getBoundingClientRect()
          const score = element.querySelector('.tile-score')!.getBoundingClientRect()
          const summary = element.querySelector('.tile-duo,.tile-duo-text')?.getBoundingClientRect()
          return { inside: overlay.left >= tile.left && overlay.right <= tile.right, aboveFooter: overlay.bottom <= score.top, belowSummary: !summary || overlay.top >= summary.bottom }
        })
        expect(bounds).toEqual({ inside: true, aboveFooter: true, belowSummary: true })
      }
      await page.locator('.board-wrap').screenshot({ path: testInfo.outputPath(`anchor-${theme}-${width}.png`) })
    }
  }
  expect(await exportState(page)).toEqual(afterRotate)
})
