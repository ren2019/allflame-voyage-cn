import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const keeperExpressions = [
  ['锚地赐福', '"锚地|物品数量.*(1[2-9].|[2-9]..)%|稀有怪物数量"'],
  ['速刷保险箱', '"漂流瓶|神圣的秘宝|侦探的保险箱|物品数量.*(1[1-9].|[2-9]..)%"'],
  ['稀有怪传说装', '"巨型海星|众神词缀|4000.*鬼灵|海之柱|黄金灯笼|被附身|无法掉落|稀有怪物死亡时.*分裂"'],
  ['魔法怪流', '"(2000|4000).*鬼灵|黄金灯笼|无法掉落|至少为魔法|魔法怪物数量|感染潜航球"'],
  ['稀有怪神圣雨', '"海之柱|额外保险箱|巨型海星|稀有怪物数量"'],
  ['神圣保险箱', '"远洋深渊|保险箱|神圣的秘宝|所有航行区域的稀有怪物数量|物品数量.*(1[2-9].|[2-9]..)%"'],
]
export const fixture = JSON.parse(readFileSync(new URL('../fixtures/acceptance/journey-two-voyages.json', import.meta.url)))
export const realLayout = JSON.parse(readFileSync(new URL('../../src/logic/__fixtures__/real-inventory-layout.json', import.meta.url)))
export async function load(page, state) {
  await page.getByLabel('恢复规划备份', { exact: true }).setInputFiles({ name: 'spec21.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) })
  await expect(page.locator('.planning-backup [role=status]')).toHaveText('已从 JSON 载入规划状态')
}
const backupReaders = new WeakMap()
// Native cross-host CDP downloads need an OS file transport; the export UI stays unchanged.
export const setBackupReader = (page, reader) => backupReaders.set(page, reader)
export async function backup(page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出规划备份', exact: true }).click()
  const download = await pending
  if (backupReaders.has(page)) return backupReaders.get(page)(download)
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function keeper(page, onCopy) {
  await page.getByText('留图助手', { exact: true }).click()
  const assistant = page.getByRole('region', { name: '留图助手' })
  for (const [name, expression] of keeperExpressions) {
    await assistant.getByRole('checkbox', { name, exact: true }).check()
    await assistant.getByRole('button', { name: `${name}留图搜索`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `${name}留图搜索` })
    await expect(dialog.getByRole('textbox')).toHaveValue(expression)
    await dialog.getByRole('button', { name: '复制全文', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('已复制')
    if (onCopy) await onCopy(name, expression)
    await page.keyboard.press('Escape')
  }
  await assistant.getByRole('checkbox', { name: '点金速刷', exact: true }).check()
  await expect(assistant).toContainText('暂无有来源的专项留图规则')
  await expect(assistant).toContainText('游戏语法与容量未验证')
  await expect(assistant.locator('.compact-copy')).toHaveCount(6)
  await page.getByText('留图助手', { exact: true }).click()
}
export async function fullCycle(page) {
  await page.locator('.onboard-actions button').last().click()
  await load(page, { ...fixture, strategyId: null, voyageHistory: [] })
  await page.getByRole('group', { name: '当前策略', exact: true }).getByRole('button', { name: '点金速刷', exact: true }).click()
  await expect(page.locator('.score-total strong')).toHaveText('13.0')
  await page.locator('.solve-big').click()
  await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible({ timeout: 120000 })
  await page.locator('.solve-result:not(.invalid)').last().click()
  const solved = await backup(page)
  expect(solved.voyageHistory).toEqual([])
  const selected = solved.board.map(p => p.chartUid)
  expect(new Set(selected).size).toBe(9)
  expect(selected).toContain('journey-01')
  expect(selected).toContain('journey-02')
  const beforeScore = await page.locator('.score-total strong').innerText()
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await expect(page.locator('.region-targets')).toHaveCount(9)
  await expect(page.locator('.board-wrap').getByRole('button', { name: '边界分析', exact: true })).toBeVisible()
  await expect(page.getByLabel('当前摆盘历史参考')).toContainText('样本不足')
  await keeper(page)
  await page.getByRole('button', { name: '单条中文校准模式', exact: true }).click()
  await expect(page.locator('.calibration-link').first()).toBeVisible()
  await page.getByRole('button', { name: '单条中文校准模式', exact: true }).click()
  expect(await backup(page)).toEqual(solved)
  await expect(page.locator('.score-total strong')).toHaveText(beforeScore)
  await page.locator('.finish-voyage').click()
  await page.getByRole('button', { name: '取消核销', exact: true }).click()
  expect(await backup(page)).toEqual(solved)
  await page.locator('.finish-voyage').click()
  await expect(page.locator('.preserve-confirm .pc-name')).toHaveText('双航程人工海图·甲')
  await page.locator('.pc-kept').click()
  await expect(page.locator('.preserve-confirm .pc-name')).toHaveText('双航程人工海图·乙')
  await page.locator('.pc-lost').click()
  await expect(page.getByLabel('航程历史')).toContainText('已记录 1 次')
  const completed = await backup(page)
  expect(completed.pool.map(c => c.uid)).toEqual(solved.pool.filter(c => !selected.includes(c.uid) || c.uid === 'journey-01').map(c => c.uid))
  expect(completed.pool).toHaveLength(4)
  expect(completed.board).toEqual(Array(9).fill(null))
  expect(completed.voyageHistory).toHaveLength(1)
  expect(completed.voyageHistory[0].score.toFixed(1)).toBe(beforeScore)
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '+ 添加海图', exact: true }).click()
  await page.locator('.solve-big').click()
  await expect(page.locator('.solve-result:not(.invalid)').first()).toBeVisible({ timeout: 120000 })
  const next = await backup(page)
  expect(next.pool).toHaveLength(9)
  expect(next.voyageHistory).toEqual(completed.voyageHistory)
  expect(next.board.every(Boolean)).toBe(true)
  for (const uid of selected.filter(uid => uid !== 'journey-01')) expect(next.board.map(p => p.chartUid)).not.toContain(uid)
  await page.waitForTimeout(400)
  await page.reload()
  expect(await backup(page)).toEqual(next)
  await load(page, completed)
  expect(await backup(page)).toEqual(completed)
  return { originalScore: '13.0', chosenScore: beforeScore, consumed: 8, retained: 1, historyRecords: 1, nextInventory: 9, refreshedAndBackupRestored: true }
}
export async function visualTargets(page, screenshot) {
  await load(page, realLayout)
  await page.getByRole('radio', { name: '全部', exact: true }).check()
  await expect(page.locator('.region-targets')).toHaveCount(9)
  const images = page.locator('.region-target img')
  expect(await images.count()).toBeGreaterThan(0)
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(n => n.complete && n.naturalWidth > 0))).toBe(true)
  const before = await backup(page)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['dark', 'light']) {
      const themeButton = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
      if (await themeButton.count()) await themeButton.click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const cell of await page.locator('.region-targets').all()) expect(await cell.locator('button').count()).toBeLessThanOrEqual(4)
      const icon = page.locator('.region-targets').nth(1).getByRole('button', { name: /箱子/ })
      await icon.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: '区域 2 目标详情' })
      await expect(dialog).toContainText('奥术师保险箱')
      await expect(dialog).toContainText('格 5')
      await expect(dialog).toContainText('精华囚禁怪')
      const bounds = await dialog.boundingBox()
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      if (screenshot) await screenshot(`targets-${theme}-${width}`, page)
      await page.keyboard.press('Escape')
      await expect(icon).toBeFocused()
    }
  }
  expect(await backup(page)).toEqual(before)
}

export async function visualCalibration(page, screenshot) {
  await load(page, { ...fixture, strategyId: null, voyageHistory: [],
    pool: [{ uid: 'native-reserved', name: '策略预留与单条校准·长名称海图', level: 83, shape: 'cross', edges: [true, true, true, true], modIds: ['voy-rare'] }],
    board: Array(9).fill(null), borders: ['b-sulphdrop', ...Array(11).fill('b-pack-1')],
    strategyReservations: { divine: true, meatfish: true, ethereal: true },
  })
  const before = await backup(page)
  const pencil = page.getByRole('button', { name: '单条中文校准模式', exact: true })
  if (await pencil.getAttribute('aria-pressed') !== 'true') await pencil.click()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['dark', 'light']) {
      const themeButton = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
      if (await themeButton.count()) await themeButton.click()
      const feedback = page.getByRole('link', { name: '🐛 反馈', exact: true })
      await expect(feedback).toHaveCSS('background-color', theme === 'dark' ? 'rgb(32, 36, 42)' : 'rgb(255, 255, 255)')
      for (const view of ['grid', 'list']) {
        if (view === 'list') await page.getByRole('button', { name: '列表视图（编辑海图）', exact: true }).click()
        const card = page.locator(view === 'grid' ? '.chart-sq' : '.chart-card')
        const reservation = card.getByRole('button', { name: /查看策略预留/ })
        await reservation.click()
        const dialog = page.getByRole('dialog', { name: '策略预留详情' })
        await expect(dialog).toContainText('稀有怪')
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        const controls = [reservation, card.locator('.edge-glyph').first(), card.locator('.calibration-link').first()]
        const rectangles = []
        for (const control of controls) { await expect(control).toBeVisible(); rectangles.push(await control.boundingBox()) }
        for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
          const a = rectangles[i], b = rectangles[j]
          expect(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y)).toBe(true)
        }
        const pending = page.waitForEvent('popup')
        await card.locator('.calibration-link').first().click()
        const popup = await pending
        await popup.setViewportSize({ width, height: 1000 })
        await expect(popup.getByLabel('搜索词库')).toHaveValue('chart-implicit:voy-rare')
        await expect(popup.locator('.cal-page')).toHaveCSS('color', theme === 'dark' ? 'rgb(232, 236, 242)' : 'rgb(36, 44, 55)')
        expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (screenshot && view === 'grid') await screenshot(`calibration-${theme}-${width}`, popup)
        await popup.close()
        await expect(card).not.toHaveClass(/selected/)
        if (view === 'list') await page.getByRole('button', { name: '网格视图', exact: true }).click()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  }
  await pencil.click()
  expect(await backup(page)).toEqual(before)
}
