import { test, expect } from './offline'
import { exportState, installClipboardRecorder, loadState, openEmptyApp } from './acceptance-helpers'
import { defaultState } from '../../src/logic/storage'
import type { ChartData } from '../../src/types'
import { readFileSync } from 'node:fs'

test.afterEach(async ({ page }, testInfo) => {
  if (process.env.PLAYWRIGHT_BASE_URL) await page.screenshot({ path: testInfo.outputPath('production-synthetic-state.png'), fullPage: true })
})

const inventory = () => {
  const s = defaultState()
  s.pool = Array.from({ length: 11 }, (_, i): ChartData => ({ uid: `synthetic-${i}`, name: `合成海图${i}`, level: 83,
    areaType: i === 0 ? 'anchorfield' : i === 10 ? 'kisharas-rest' : 'abyssal-plain', edges: [true, true, true, true], modIds: [] }))
  s.board = s.pool.slice(0, 9).map((c, i) => ({ chartUid: c.uid, rotation: i % 4 }))
  s.strategyId = 'anchorfield-fishing'
  s.allowRotation = true
  return s
}

test('#44 #45 #50 标记、恢复、缺失移出、手动补位、统一清理维持实例身份', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory()
  await loadState(page, s)
  const tile = page.locator('.board-grid .tile').nth(4)
  await tile.hover(); await tile.getByTitle('标记待删除', { exact: true }).click()
  let saved = await exportState(page)
  expect(saved.pool.find((c) => c.uid === 'synthetic-4')?.pendingDeletion).toBe(true)
  expect(saved.board).toEqual(s.board)
  expect(saved.pool).toHaveLength(11)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}').pool?.find((c: { uid: string }) => c.uid === 'synthetic-4')?.pendingDeletion)).toBe(true)
  await page.reload()
  await expect(page.locator('.pending-summary')).toContainText('待删除 1 张')
  await tile.hover(); await tile.getByTitle('取消待删除', { exact: true }).click()
  await tile.getByTitle('找不到：标记待删除并移出摆盘', { exact: true }).click()
  saved = await exportState(page)
  expect(saved.board[4]).toBeNull()
  expect(saved.pool.find((c) => c.uid === 'synthetic-4')?.pendingDeletion).toBe(true)
  await page.getByRole('button', { name: '补齐空位（1）', exact: true }).click()
  await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible()
  const filled = await exportState(page)
  expect(filled.board.every(Boolean)).toBe(true)
  s.board.forEach((p, i) => { if (i !== 4) expect(filled.board[i]).toEqual(p) })
  expect(filled.board.some((p) => p?.chartUid === 'synthetic-4')).toBe(false)
  expect(filled.pool.filter((c) => filled.board.some((p) => p?.chartUid === c.uid) && c.areaType === 'anchorfield')).toHaveLength(1)
  await page.getByRole('button', { name: '统一删除待删除海图', exact: true }).click()
  expect((await exportState(page)).pool).toHaveLength(10)
  await loadState(page, saved)
  await expect(page.locator('.pending-summary')).toContainText('待删除 1 张')
})

test('#49 #46 普通策略拒绝锁定Boss，专用策略单张左下并显示保图概率', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.pool[10].preserved = true; s.board[6] = { chartUid: s.pool[10].uid, rotation: 0 }
  s.strategyId = 'alc-and-go'
  await loadState(page, s)
  await page.locator('.solve-big').click()
  await expect(page.locator('.solve-bar')).toContainText('锁定海图受到策略保护')
  expect((await exportState(page)).board).toEqual(s.board)
  s.pool[10].preserved = false; s.strategyId = 'kishara-boss-rush'; s.borders[6] = 'b-keep-2'
  await loadState(page, s)
  await page.locator('.solve-big').click()
  await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible({ timeout: 20000 })
  const result = await exportState(page)
  expect(result.board[6]?.chartUid).toBe('synthetic-10')
  expect(result.board.filter((p) => p?.chartUid === 'synthetic-10')).toHaveLength(1)
  await expect(page.locator('.boss-candidate').first()).toContainText('50%')
})

for (const theme of ['dark', 'light']) test(`#47 ${theme} 悬浮目的地保留原名和区域等级`, async ({ page }) => {
  await openEmptyApp(page); await loadState(page, inventory())
  const toggle = page.getByRole('button', { name: `切换到${theme === 'light' ? '浅色' : '深色'}主题`, exact: true })
  if (await toggle.count()) await toggle.click()
  await page.locator('.board-grid .tile').first().hover()
  await expect(page.locator('.poe-tooltip .destination-orange')).toHaveText('目的地：锚地')
  await expect(page.locator('.poe-tooltip')).toContainText('合成海图0')
  await expect(page.locator('.poe-tooltip')).toContainText('区域等级：83')
})

test('#48 全部成功才突出核销，刷新与失败不保留提醒', async ({ page }) => {
  await installClipboardRecorder(page); await openEmptyApp(page); await loadState(page, inventory())
  await page.locator('.copy-into-game').click()
  for (let i = 0; i < 9; i++) { await page.locator('.copyseq-go').click(); await expect(page.locator('.copyseq .pc-head')).toHaveCount(i === 8 ? 0 : 1) }
  await expect(page.locator('.finish-voyage')).toHaveClass(/copy-complete-primary/)
  expect((await exportState(page)).pool).toHaveLength(11)
  await page.reload()
  await expect(page.locator('.finish-voyage')).not.toHaveClass(/copy-complete-primary/)
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(Error('denied')) }, configurable: true }) })
  await page.locator('.copy-into-game').click(); await page.locator('.copyseq-go').click()
  await expect(page.locator('.copyseq .pc-head')).toContainText('第 1/9 步')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.finish-voyage')).not.toHaveClass(/copy-complete-primary/)
})

test('#51 新增及重复高亮独立于选中，隐藏目标不改筛选', async ({ page }) => {
  await openEmptyApp(page)
  const sample = readFileSync(new URL('../../samples/charted.zh-CN.txt', import.meta.url), 'utf8')
  const input = page.locator('.import-panel textarea[placeholder]')
  await input.fill(sample); await page.getByRole('button', { name: '解析并加入', exact: true }).click()
  await expect(page.locator('[data-import-kind="新增"]')).toHaveCount(2)
  const original = await exportState(page)
  await page.getByPlaceholder('按名称或词缀筛选…').fill('不存在的名称')
  await input.fill(sample); await page.getByRole('button', { name: '解析并加入', exact: true }).click()
  await expect(page.getByLabel('本次导入定位')).toContainText('筛选隐藏 2 张')
  await expect(page.getByPlaceholder('按名称或词缀筛选…')).toHaveValue('不存在的名称')
  await expect(page.locator('.chart-sq')).toHaveCount(0)
  await page.getByPlaceholder('按名称或词缀筛选…').fill('')
  await expect(page.locator('[data-import-kind="已存在"]')).toHaveCount(2)
  await expect(page.locator('.chart-sq.selected')).toHaveCount(0)
  expect(await exportState(page)).toEqual(original)
})

test('#50 补位后逐格标识，修改新填格会使所有旧候选失效', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.board[4] = null
  await loadState(page, s)
  await page.locator('.refill-board').click()
  await expect(page.locator('.refilled-badge')).toHaveCount(1)
  await expect(page.locator('.board-grid .tile').nth(4).locator('.refilled-badge')).toContainText('请核对实物')
  await page.locator('.board-grid .tile').nth(4).hover()
  await page.locator('.board-grid .tile').nth(4).getByTitle('旋转', { exact: true }).click()
  await expect(page.locator('.solve-result:not(.invalid)')).toHaveCount(0)
  const changed = await exportState(page)
  await page.locator('.solve-result').first().click()
  expect((await exportState(page)).board).toEqual(changed.board)
})

test('#45 #50 唯一锚地待删除时补位失败，保持空位与固定格', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.pool[0].pendingDeletion = true; s.board[0] = null
  await loadState(page, s)
  await page.locator('.refill-board').click()
  await expect(page.locator('.solve-bar')).toContainText('本次未找到合法补位')
  expect(await exportState(page)).toEqual(s)
  await expect(page.locator('.solve-result')).toHaveCount(0)
})

test('#46 首选与保图重算都保留禁用词缀的评分设置', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.strategyId = 'kishara-boss-rush'; s.pool[1].modIds = ['voy-sulph-3']; s.disabledMods = ['voy-sulph-3']; s.borders[0] = 'b-keep-2'
  await loadState(page, s)
  await page.locator('.solve-big').click()
  await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible({ timeout: 20000 })
  for (const score of await page.locator('.solve-result .sr-pts').allTextContents()) expect(score).toBe('0.0')
})

test('#48 延迟复制拒绝重复推进，取消或恢复后旧请求不能产生完成提醒', async ({ page }) => {
  await openEmptyApp(page); await loadState(page, inventory())
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: () => new Promise<void>((resolve) => { (window as unknown as { completeWrite: () => void }).completeWrite = resolve }),
  } }))
  await page.locator('.copy-into-game').click()
  await page.locator('.copyseq-go').click(); await page.keyboard.press('Control+c')
  await expect(page.locator('.copyseq .pc-head')).toContainText('第 1/9 步')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.evaluate(() => (window as unknown as { completeWrite: () => void }).completeWrite())
  await expect(page.locator('.finish-voyage')).not.toHaveClass(/copy-complete-primary/)
})

test('#50 临时固定不能绕过其他策略材料预留', async ({ page }) => {
  await openEmptyApp(page)
  const s = inventory(); s.strategyId = 'alc-and-go'; s.board[4] = null; s.pool[1].modIds = ['voy-rare']
  await loadState(page, s)
  await page.locator('.refill-board').click()
  await expect(page.locator('.solve-bar')).toContainText('锁定海图受到策略保护')
  expect(await exportState(page)).toEqual(s)
})
