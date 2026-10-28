import { expect, test } from './offline'
import type { Page } from '@playwright/test'
import { exportState, loadState, openEmptyApp } from './acceptance-helpers'
import { defaultState } from '../../src/logic/storage'
import { BORDER_CHOICES } from '../../src/data/borderLocale'

async function exportedBorders(page: Page): Promise<(string | null)[]> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出规划备份', exact: true }).click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8')).borders
}

async function selectBorder(page: Page, segment: number, query: string, text: string) {
  await page.locator(`[data-border-segment="${segment}"]`).click()
  await page.getByPlaceholder('搜索边界词缀…').fill(query)
  await page.locator('.bpop-item').filter({ hasText: text }).click()
}

test('all twelve real border controls support Chinese search, selection, replacement and clearing', async ({ page }) => {
  await page.goto('/')
  await page.locator('.onboard-actions button').last().click()
  for (let segment = 0; segment < 12; segment++) {
    const slot = page.locator(`[data-border-segment="${segment}"]`)
    await selectBorder(page, segment, '怪物群规模提高 16%', '相邻区域的怪物群规模提高 16%')
    await expect(slot).toContainText('16% 群规模')
    await expect(slot).toHaveAttribute('title', '相邻区域的怪物群规模提高 16%')
  }
  expect(await exportedBorders(page)).toEqual(Array(12).fill('b-pack-1'))
  for (let segment = 0; segment < 12; segment++) {
    const slot = page.locator(`[data-border-segment="${segment}"]`)
    await selectBorder(page, segment, '怪物群规模提高 24%', '相邻区域的怪物群规模提高 24%')
    await expect(slot).toContainText('24% 群规模')
  }
  expect(await exportedBorders(page)).toEqual(Array(12).fill('b-pack-2'))
  for (let segment = 0; segment < 12; segment++) {
    const slot = page.locator(`[data-border-segment="${segment}"]`)
    await slot.click()
    await page.getByRole('button', { name: '无边界词缀', exact: true }).click()
    await expect(slot).toContainText('·')
  }
  expect(await exportedBorders(page)).toEqual(Array(12).fill(null))
})

test('normal border choices and modifier browser hide maintenance status and conflicts', async ({ page }) => {
  await page.goto('/')
  await page.locator('.onboard-actions button').last().click()
  await page.locator('[data-border-segment="0"]').click()
  await expect(page.locator('.bpop-item')).toHaveCount(17)
  await expect(page.getByText(/仅来源|待客户端|译名冲突/)).toHaveCount(0)
  await page.getByPlaceholder('搜索边界词缀…').fill('死者硫磺')
  await page.locator('.bpop-item').filter({ hasText: '相邻区域的稀有怪物掉落死者硫磺' }).click()
  await expect(page.locator('[data-border-segment="0"]')).toHaveAttribute('title', '相邻区域的稀有怪物掉落死者硫磺')
  await expect(page.getByLabel('译名冲突')).toHaveCount(0)
  expect((await exportedBorders(page))[0]).toBe('b-sulphdrop')
  await page.getByRole('button', { name: /^(Mods|词缀)$/ }).click()
  await page.getByPlaceholder('搜索词缀…').fill('死者硫磺')
  await expect(page.locator('.mb-row')).toHaveCount(1)
  await expect(page.locator('.mb-row')).toContainText('相邻区域的稀有怪物掉落死者硫磺')
  await expect(page.getByText(/仅来源|待客户端|译名冲突/)).toHaveCount(0)
})

test('compact categories retain the selected family, expose only other quick tiers, and default to the first visible result', async ({ page }) => {
  await page.goto('/')
  await page.locator('.onboard-actions button').last().click()
  await selectBorder(page, 0, '稀有度总增 75%', '相邻区域中找到物品的稀有度总增 75%')
  await page.locator('[data-border-segment="0"]').click()
  const chooser = page.getByRole('dialog', { name: '选择边界 1' })
  await expect(chooser.getByRole('navigation', { name: '边界分类' }).getByRole('button')).toHaveText([
    '怪物数量6', '收益经验6', '通货掉落13', '遭遇宝藏7', '特殊机制7',
  ])
  await expect(chooser.locator('.border-chooser-head')).toContainText('物品稀有度 75%')
  await expect(chooser.locator('.border-chooser-quick button')).toHaveText(['50%', '100%'])
  const rarity = chooser.getByRole('group', { name: '物品稀有度', exact: true })
  await expect(rarity.getByRole('button', { name: '相邻区域中找到物品的稀有度总增 75%', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await rarity.getByRole('button', { name: '物品稀有度，默认选择 50%' }).click()
  expect((await exportedBorders(page))[0]).toBe('b-rarity-1')
  await page.locator('[data-border-segment="0"]').click()
  await chooser.locator('.border-chooser-quick').getByRole('button', { name: '相邻区域中找到物品的稀有度总增 100%', exact: true }).click()
  expect((await exportedBorders(page))[0]).toBe('b-rarity-3')
  await page.locator('[data-border-segment="0"]').click()
  await chooser.getByPlaceholder('搜索边界词缀…').fill('稀有度总增 75%')
  await chooser.getByRole('button', { name: '物品稀有度，默认选择 75%' }).focus()
  await page.keyboard.press('Enter')
  expect(await exportedBorders(page)).toEqual(['b-rarity-2', ...Array(11).fill(null)])
})

test('all 64 IDs can be chosen through balanced categories, and all 13 currency icons load and support keyboard selection', async ({ page }) => {
  await openEmptyApp(page)
  const categories = [
    ['怪物数量，6 类词缀', ['b-pack-1', 'b-pack-2', 'b-pack-3', 'b-rare-1', 'b-rare-2', 'b-rare-3', 'b-beasts-1', 'b-beasts-2', 'b-beasts-3', 'b-crabs-1', 'b-crabs-2', 'b-crabs-3', 'b-drowned-1', 'b-drowned-2', 'b-drowned-3', 'b-rareconn-1', 'b-rareconn-2']],
    ['收益经验，6 类词缀', ['b-rarity-1', 'b-rarity-2', 'b-rarity-3', 'b-quantconn-1', 'b-quantconn-2', 'b-curr-1', 'b-curr-2', 'b-curr-3', 'b-scarab-1', 'b-scarab-2', 'b-scarab-3', 'b-gold-1', 'b-gold-2', 'b-exp-1', 'b-exp-2', 'b-exp-3']],
    ['通货掉落，13 类词缀', ['b-ancient', 'b-divine', 'b-exalt', 'b-annul', 'b-chaos', 'b-vaal', 'b-gcp', 'b-chrome', 'b-regret', 'b-blessed', 'b-regal', 'b-support', 'b-scarabdrop']],
    ['遭遇宝藏，7 类词缀', ['b-octoboss', 'b-crabboss', 'b-locker', 'b-pirates', 'b-anchor-1', 'b-anchor-2', 'b-goldlantern', 'b-izaro']],
    ['特殊机制，7 类词缀', ['b-minmagic', 'b-magicmods', 'b-mag-1', 'b-mag-2', 'b-mag-3', 'b-keep-1', 'b-keep-2', 'b-lanterns', 'b-sulphdrop', 'b-decks']],
  ] as const
  const slot = page.locator('[data-border-segment="4"]')
  const chooser = page.getByRole('dialog', { name: '选择边界 5' })
  for (const [categoryName, ids] of categories) {
    for (const id of ids) {
      await slot.click()
      await chooser.getByRole('button', { name: categoryName, exact: true }).click()
      const text = BORDER_CHOICES.find(choice => choice.id === id)!.text
      const option = chooser.locator('.border-chooser-results').getByRole('button', { name: text, exact: true })
      await expect(option).toHaveAttribute('title', text)
      if (categoryName.startsWith('通货')) {
        const icons = chooser.locator('.border-currency img')
        await expect(icons).toHaveCount(13)
        await expect.poll(() => icons.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
        await option.focus()
        await page.keyboard.press('Space')
      } else await option.click()
      expect(await exportedBorders(page)).toEqual([null, null, null, null, id, ...Array(7).fill(null)])
    }
  }
  await slot.click()
  await chooser.getByPlaceholder('搜索边界词缀…').fill('additional Divine Orbs')
  await chooser.getByRole('button', { name: '相邻区域的稀有怪物掉落 1 个额外神圣石', exact: true }).click()
  expect((await exportedBorders(page))[4]).toBe('b-divine')
})

test('cancel, search default, blank-space default, clearing, and backup restore preserve all other planning state', async ({ page }) => {
  await openEmptyApp(page)
  const initial = { ...defaultState(), borders: ['b-rarity-2', 'b-divine', ...Array(10).fill(null)] }
  await loadState(page, initial)
  const slot = page.locator('[data-border-segment="0"]')
  const chooser = page.getByRole('dialog', { name: '选择边界 1' })
  await slot.focus()
  await page.keyboard.press('Enter')
  await expect(chooser.getByPlaceholder('搜索边界词缀…')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(slot).toBeFocused()
  expect(await exportState(page)).toEqual(initial)
  await slot.click()
  await chooser.getByRole('button', { name: '关闭边界选择' }).click()
  expect(await exportState(page)).toEqual(initial)
  await slot.click()
  await page.locator('.bpop-backdrop').click({ position: { x: 0, y: 0 } })
  expect(await exportState(page)).toEqual(initial)
  await slot.click()
  const family = chooser.getByRole('group', { name: '物品稀有度', exact: true })
  // The gap above the tier buttons belongs to the row's default action.
  await family.click({ position: { x: 1, y: 1 } })
  expect(await exportState(page)).toEqual({ ...initial, borders: ['b-rarity-1', 'b-divine', ...Array(10).fill(null)] })
  await slot.click()
  await chooser.getByPlaceholder('搜索边界词缀…').fill('稀有度总增 100%')
  await page.keyboard.press('Enter')
  const changed = { ...initial, borders: ['b-rarity-3', 'b-divine', ...Array(10).fill(null)] }
  expect(await exportState(page)).toEqual(changed)
  await slot.click()
  await chooser.getByRole('button', { name: '无边界词缀', exact: true }).click()
  expect(await exportState(page)).toEqual({ ...initial, borders: [null, 'b-divine', ...Array(10).fill(null)] })
  await loadState(page, changed)
  expect(await exportState(page)).toEqual(changed)
  await slot.click()
  await expect(chooser.locator('.border-chooser-head')).toContainText('物品稀有度 100%')
  await expect(chooser.locator('.border-chooser-results [aria-pressed=true]')).toHaveAttribute('aria-label', '相邻区域中找到物品的稀有度总增 100%')
  expect(await chooser.innerText()).not.toMatch(/当前|✓|✔|打勾/)
})

test('all twelve popovers fit desktop and 390/320px viewports in both themes, with compact rows and currency grid', async ({ page }, testInfo) => {
  await openEmptyApp(page)
  await loadState(page, { ...defaultState(), borders: Array(12).fill('b-rarity-2') })
  const original = await exportState(page)
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 720 })
    for (const theme of ['dark', 'light']) {
      const themeName = theme === 'dark' ? '深色' : '浅色'
      const themeToggle = page.getByRole('button', { name: `切换到${themeName}主题`, exact: true })
      if (await themeToggle.count()) await themeToggle.click()
      for (let segment = 0; segment < 12; segment++) {
        const opener = page.locator(`[data-border-segment="${segment}"]`)
        await opener.click()
        const chooser = page.getByRole('dialog', { name: `选择边界 ${segment + 1}`, exact: true })
        await expect(chooser).toBeVisible()
        const bounds = await chooser.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(7)
        expect(bounds!.y).toBeGreaterThanOrEqual(7)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 7)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(713)
        expect(await chooser.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        if (width === 1280) {
          expect(bounds!.width).toBe(520)
          expect(bounds!.height).toBeLessThanOrEqual(370)
        }
        const colors = await chooser.evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }))
        expect(colors).toEqual(theme === 'dark' ? { bg: 'rgb(32, 36, 42)', text: 'rgb(232, 236, 242)' } : { bg: 'rgb(255, 255, 255)', text: 'rgb(36, 44, 55)' })
        if (segment === 0) {
          await page.screenshot({ path: testInfo.outputPath(`chooser-rows-${theme}-${width}.png`) })
          await chooser.getByRole('button', { name: '通货掉落，13 类词缀' }).click()
          await expect(chooser.locator('.border-currency')).toHaveCount(13)
          await page.screenshot({ path: testInfo.outputPath(`chooser-currency-${theme}-${width}.png`) })
          const currencyBounds = await chooser.boundingBox()
          expect(currencyBounds!.x + currencyBounds!.width).toBeLessThanOrEqual(width - 7)
          expect(currencyBounds!.y + currencyBounds!.height).toBeLessThanOrEqual(713)
          await chooser.locator('.border-currency').last().focus()
          await page.keyboard.press('Tab')
          expect(await chooser.evaluate(element => element.contains(document.activeElement))).toBe(true)
        }
        await page.keyboard.press('Escape')
        await expect(opener).toBeFocused()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  }
  expect(await exportState(page)).toEqual(original)
  await expect(page.getByText('角落有两条直接边界，中边一条，中心没有。', { exact: false })).toHaveCount(0)
  await expect(page.getByText('先点击库存海图再点击格子放置；点击两个已放置格子可交换。', { exact: true })).toBeVisible()
})

test('Enter in a broad search selects its first visible result, including currency icons', async ({ page }) => {
  await openEmptyApp(page)
  await page.locator('[data-border-segment="0"]').click()
  const chooser = page.getByRole('dialog', { name: '选择边界 1' })
  await chooser.getByPlaceholder('搜索边界词缀…').fill('相邻区域')
  await expect(chooser.locator('.border-chooser-results button').first()).toHaveAttribute('aria-label', '相邻区域的稀有怪物掉落 1 个额外远古石')
  await page.keyboard.press('Enter')
  expect((await exportedBorders(page))[0]).toBe('b-ancient')
})
