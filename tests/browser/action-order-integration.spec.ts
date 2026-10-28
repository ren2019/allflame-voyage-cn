import { test, expect } from './offline'
import { openEmptyApp, loadState, exportState } from './acceptance-helpers'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { AppState } from '../../src/logic/storage'
import type { ChartData } from '../../src/types'

const fixture = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url), 'utf8'))
const historyContext = {
  ruleVersion: '3.29-additive-rewards-v1', strategyId: null, weights: { currency: 1 },
  adjacencyMode: 'physical' as const, adjacentAffectsSelf: false, disabledMods: [], connectivityMode: 'strict' as const,
}
// Synthetic planning inputs exercise the public UI; these are not game or drop evidence.
const planning = (): AppState => {
  const pool: ChartData[] = Array.from({ length: 9 }, (_, i) => ({
    uid: `integrated-${i}`, name: `组合海图 ${i + 1}`, level: 83, edges: [true, true, true, true],
    modIds: i === 4 ? ['adj-lantern', 'adj-star-1', 'adj-rare-1', 'adj-magic-1', 'adj-box-1'] : [],
    areaType: i === 0 ? 'anchorfield' : i === 1 ? 'infested-bathyspheres' : i === 2 ? 'kisharas-rest' : 'abyssal-plain',
  }))
  return {
    ...fixture, pool, board: pool.map(chart => ({ chartUid: chart.uid, rotation: 0 })),
    borders: [null, 'b-divine', ...Array(10).fill(null)], strategyId: null,
    disabledMods: ['adj-box-1', 'adj-star-1', 'b-divine'],
    strategyReservations: { divine: false, meatfish: false, ethereal: true },
    voyageHistory: [{ completionId: 'synthetic-action-history', completedAt: '2026-10-20T00:00:00.000Z', strategyId: null, score: 42,
      scoringContext: historyContext, contextKey: JSON.stringify(historyContext) }],
  }
}
const actionNames = async (page: Page) => (await page.getByRole('note', { name: /打法行动/ }).evaluateAll(elements =>
  elements.map(element => element.getAttribute('aria-label')!),
)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
const expectActions = async (page: Page, labels: string[]) => {
  await expect(page.getByRole('note', { name: /打法行动/ })).toHaveCount(labels.length)
  await expect.poll(() => actionNames(page)).toEqual(labels.map((label, i) => `打法行动 ${i + 1}：${label}`))
}

test('同盘八策略及手动连续切换，显示和详情只读且组合布局可用', async ({ page }) => {
  await openEmptyApp(page)
  await loadState(page, planning())
  const initial = await exportState(page)
  const scenarios: [string | null, string, string[]][] = [
    ['anchorfield-fishing', '锚地赐福', ['找赐福', '找赐福', '找赐福', '锚地，赐福后开']],
    ['kishara-boss-rush', '琪莎拉 Boss 速刷', ['琪莎拉 Boss']],
    ['milky-speedrun', '速刷保险箱', Array(4).fill('保险箱，开箱前洗练')],
    ['milky-meatfish', '稀有怪传说装', ['收黄金灯笼', '收黄金灯笼', '处理巨型海星', '处理巨型海星']],
    ['milky-ethereal', '魔法怪流', ['收黄金灯笼', '收黄金灯笼', '处理感染潜航球', '处理魔法怪']],
    ['divine-border-rares', '稀有怪神圣雨', ['神圣稀有怪']],
    ['cutedog-divine-boxes', '神圣保险箱', ['神圣保险箱，开箱前洗练']],
    ['alc-and-go', '点金速刷', Array(4).fill('沿途目标')],
    [null, '无策略（手动）', []],
  ]
  for (const [id, name, labels] of scenarios) {
    await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name, exact: true }).click()
    await expectActions(page, labels)
    const score = await page.locator('.score-total strong').textContent()
    const toggle = page.getByRole('checkbox', { name: '打法顺序', exact: true })
    await toggle.uncheck()
    await expectActions(page, [])
    await page.getByRole('radio', { name: '全部', exact: true }).check()
    await toggle.focus()
    await page.keyboard.press('Space')
    await expectActions(page, labels)
    await page.getByRole('radio', { name: '高价值', exact: true }).check()
    await page.getByRole('radio', { name: '关闭', exact: true }).check()
    await expectActions(page, labels)
    await expect(page.locator('.score-total strong')).toHaveText(score!)
    expect(await exportState(page)).toEqual({ ...initial, strategyId: id })
  }
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  const icon = page.getByLabel('区域 1 目标', { exact: true }).getByRole('button').first()
  await icon.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '区域 1 目标详情', exact: true })).toContainText('沉没宝藏')
  await page.keyboard.press('Escape')
  await expect(icon).toBeFocused()
  expect(await exportState(page)).toEqual(initial)

  for (const name of ['锚地赐福', '魔法怪流']) {
    await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name, exact: true }).click()
    const beforeDisplay = await exportState(page)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['dark', 'light']) {
        const toggle = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
        if (await toggle.count()) await toggle.click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        for (const tile of await page.locator('.tile.with-region-actions').all()) {
          const fits = await tile.evaluate(element => {
            const overlay = element.querySelector('.region-overlay')!.getBoundingClientRect()
            const bounds = element.getBoundingClientRect()
            const score = element.querySelector('.tile-score')!.getBoundingClientRect()
            const start = element.querySelector('.tile-start')?.getBoundingClientRect()
            return overlay.left >= bounds.left && overlay.right <= bounds.right && overlay.bottom <= score.top && (!start || overlay.bottom <= start.top)
          })
          expect(fits).toBe(true)
        }
      }
    }
    expect(await exportState(page)).toEqual(beforeDisplay)
  }
})

test('蛇形连接在忽略连接模式仍真实派生，旋转移除补入和改边界同步更新', async ({ page }) => {
  await openEmptyApp(page)
  const state = planning()
  const edges: ChartData['edges'][] = [
    [false, true, true, false], [false, true, false, true], [false, false, false, true],
    [true, true, false, false], [false, true, false, true], [false, false, true, true],
    [false, true, false, false], [true, false, true, false], [true, false, false, true],
  ]
  state.pool = state.pool.map((chart, i) => ({ ...chart, edges: edges[i], modIds: [], areaType: i === 2 ? 'kisharas-rest' : 'abyssal-plain' }))
  state.board[7]!.rotation = 1
  state.mode = 'any'
  state.strategyId = 'kishara-boss-rush'
  state.disabledMods = []
  state.borders = Array(12).fill(null)
  await loadState(page, state)
  const original = await exportState(page)
  await expectActions(page, ['琪莎拉 Boss'])
  const tiles = page.locator('.board-grid .tile')
  await tiles.nth(7).hover()
  await tiles.nth(7).getByTitle('旋转', { exact: true }).click()
  await expectActions(page, [])
  const rotated = structuredClone(original)
  rotated.board[7]!.rotation = 2
  expect(await exportState(page)).toEqual(rotated)
  await tiles.nth(7).hover()
  await tiles.nth(7).getByRole('button', { name: '移出摆盘，保留库存', exact: true }).click()
  await expectActions(page, [])
  const removed = structuredClone(rotated)
  removed.board[7] = null
  expect(await exportState(page)).toEqual(removed)
  await page.getByTitle('列表视图（编辑海图）', { exact: true }).click()
  await page.locator('.chart-card').filter({ has: page.locator('.chart-name', { hasText: /^组合海图 8$/ }) }).click()
  await tiles.nth(7).click()
  await expectActions(page, [])
  await tiles.nth(7).hover()
  await tiles.nth(7).getByTitle('旋转', { exact: true }).click()
  await expectActions(page, ['琪莎拉 Boss'])
  expect(await exportState(page)).toEqual(original)

  const physical = structuredClone(state)
  physical.strategyId = 'milky-speedrun'
  physical.pool[6].modIds = ['adj-box-1']
  physical.board[7]!.rotation = 0
  await loadState(page, physical)
  const physicalLoaded = await exportState(page)
  await expectActions(page, [])
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  for (const region of [4, 8])
    await expect(page.getByLabel(`区域 ${region} 目标`, { exact: true }).getByRole('button', { name: /箱子/ })).toBeVisible()
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '稀有怪神圣雨', exact: true }).click()
  await expectActions(page, [])
  await page.getByRole('button', { name: '边界位置 7', exact: true }).click()
  await page.getByPlaceholder('搜索边界词缀…').fill('神圣石')
  await page.locator('.bpop-item').filter({ hasText: '稀有怪物' }).click()
  await expectActions(page, ['神圣稀有怪'])
  await expect(page.getByRole('group', { name: '区域 7 打法顺序', exact: true })).toHaveText('1神圣稀有怪')
  const changed = await exportState(page)
  expect(changed).toEqual({ ...physicalLoaded, strategyId: 'divine-border-rares', borders: [null, null, null, null, null, null, 'b-divine', null, null, null, null, null] })
  await page.getByRole('button', { name: '清空边界', exact: true }).click()
  await expectActions(page, [])
})

test('备份切换与刷新派生当前建议，无效JSON原子保留旧盘，空盘和缺起点不造路线', async ({ page }) => {
  await openEmptyApp(page)
  const state = planning()
  state.strategyId = 'anchorfield-fishing'
  await loadState(page, state)
  const original = await exportState(page)
  const anchorLabels = ['找赐福', '找赐福', '找赐福', '锚地，赐福后开']
  await expectActions(page, anchorLabels)
  await page.getByLabel('恢复规划备份', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid json') })
  await expect(page.locator('.planning-backup [role=status]')).toHaveText('JSON 文件无效或无法读取')
  await expectActions(page, anchorLabels)
  expect(await exportState(page)).toEqual(original)

  const missingStart = structuredClone(original)
  missingStart.board[6] = null
  await loadState(page, missingStart)
  await expectActions(page, [])
  await expect(page.getByRole('group', { name: '区域 1 打法顺序', exact: true })).toHaveText('锚地赐福后开')
  const isolated = structuredClone(original)
  isolated.pool = [{ ...isolated.pool[0], edges: [false, false, false, false] }]
  isolated.board = Array(9).fill(null)
  isolated.board[6] = { chartUid: isolated.pool[0].uid, rotation: 0 }
  await loadState(page, isolated)
  await expectActions(page, [])
  await expect(page.getByRole('group', { name: '区域 7 打法顺序', exact: true })).toHaveText('锚地赐福后开')
  await expect(page.getByRole('group', { name: '区域 1 打法顺序', exact: true })).toHaveCount(0)
  await loadState(page, { ...original, board: Array(9).fill(null) })
  await expectActions(page, [])
  await expect(page.getByRole('group', { name: /区域 \d+ 打法顺序/ })).toHaveCount(0)

  const next = structuredClone(original)
  next.strategyId = 'kishara-boss-rush'
  ;[next.board[2], next.board[6]] = [next.board[6], next.board[2]]
  await loadState(page, next)
  await expectActions(page, ['琪莎拉 Boss'])
  await expect(page.getByRole('group', { name: '区域 7 打法顺序', exact: true })).toHaveText('1琪莎拉 Boss')
  const beforeDisplay = await exportState(page)
  await page.getByRole('checkbox', { name: '打法顺序', exact: true }).uncheck()
  await expectActions(page, [])
  expect(await exportState(page)).toEqual(beforeDisplay)
  // Wait for the existing debounced persistence boundary, rather than adding a fixed sleep.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}').board?.[6]?.chartUid)).toBe('integrated-2')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: '打法顺序', exact: true })).toBeChecked()
  await expectActions(page, ['琪莎拉 Boss'])
  await expect(page.getByRole('group', { name: '区域 7 打法顺序', exact: true })).toHaveText('1琪莎拉 Boss')
  expect(await exportState(page)).toEqual(beforeDisplay)
})
