import { expect, test } from './offline'
import { clipboardWrites, exportState, installClipboardRecorder, openEmptyApp } from './acceptance-helpers'

const meatfish = '"巨型海星|众神词缀|4000.*鬼灵|海之柱|黄金灯笼|被附身|无法掉落|稀有怪物死亡时.*分裂"'
const speedrun = '"漂流瓶|神圣的秘宝|侦探的保险箱|物品数量.*(1[1-9].|[2-9]..)%"'

test('无库存可独立多选留图策略，每策略完整一串，操作不改变业务状态', async ({ page }) => {
  await installClipboardRecorder(page)
  await openEmptyApp(page)
  const before = await exportState(page)
  await page.getByText('留图助手', { exact: true }).click()
  const assistant = page.getByRole('region', { name: '留图助手' })
  await assistant.getByRole('checkbox', { name: '稀有怪传说装', exact: true }).check()
  await assistant.getByRole('checkbox', { name: '速刷保险箱', exact: true }).check()
  await assistant.getByRole('checkbox', { name: '点金速刷', exact: true }).check()
  await expect(assistant.getByText('暂无有来源的专项留图规则', { exact: false })).toBeVisible()
  await expect(assistant.locator('.compact-copy')).toHaveCount(2)
  for (const [name, regex] of [['稀有怪传说装', meatfish], ['速刷保险箱', speedrun]]) {
    await assistant.getByRole('button', { name: `复制${name}留图搜索`, exact: true }).click()
    await expect.poll(() => clipboardWrites(page)).toContain(regex)
    await assistant.getByRole('button', { name: `${name}留图搜索`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `${name}留图搜索` })
    await expect(dialog.getByRole('textbox')).toHaveValue(regex)
    await page.keyboard.press('Escape')
  }
  await expect(assistant).toContainText('游戏语法与容量未验证')
  expect(await exportState(page)).toEqual(before)
})

for (const width of [1440, 390]) {
  test(`${width}px 两主题的完整长串均可查看复制；关闭或改选不影响已载入规划`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await installClipboardRecorder(page)
    await openEmptyApp(page)
    const { defaultState } = await import('../../src/logic/storage')
    const { loadState } = await import('./acceptance-helpers')
    await loadState(page, {
      ...defaultState(), strategyId: 'milky-speedrun',
      pool: [{ uid: 'kept-map', name: '保留材料', level: 83, edges: [true, true, true, true], modIds: ['voy-rare'] }],
      board: [{ chartUid: 'kept-map', rotation: 0 }, ...Array(8).fill(null)],
      borders: Array(12).fill('b-divine'),
    })
    const before = await exportState(page)
    await page.getByText('留图助手', { exact: true }).click()
    const assistant = page.getByRole('region', { name: '留图助手' })
    const expectations = [
      ['锚地赐福', '"锚地|物品数量.*(1[2-9].|[2-9]..)%|稀有怪物数量"'],
      ['速刷保险箱', speedrun], ['稀有怪传说装', meatfish],
      ['魔法怪流', '"(2000|4000).*鬼灵|黄金灯笼|无法掉落|至少为魔法|魔法怪物数量|感染潜航球"'],
      ['稀有怪神圣雨', '"海之柱|额外保险箱|巨型海星|稀有怪物数量"'],
      ['神圣保险箱', '"远洋深渊|保险箱|神圣的秘宝|所有航行区域的稀有怪物数量|物品数量.*(1[2-9].|[2-9]..)%"'],
    ]
    for (const [name] of expectations) await assistant.getByRole('checkbox', { name, exact: true }).check()
    await expect(assistant.locator('.compact-copy')).toHaveCount(6)
    const writes: string[] = []
    for (let theme = 0; theme < 2; theme++) {
      if (theme) await page.locator('.theme-link').click()
      for (const [name, expression] of expectations) {
        const copy = assistant.getByRole('button', { name: `复制${name}留图搜索`, exact: true })
        await copy.click()
        writes.push(expression)
        await expect.poll(() => clipboardWrites(page)).toEqual(writes)
        const bounds = await copy.boundingBox()
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await assistant.getByRole('button', { name: `${name}留图搜索`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: `${name}留图搜索` })
        await expect(dialog.getByRole('textbox')).toHaveValue(expression)
        await page.keyboard.press('Escape')
      }
    }
    await assistant.getByRole('checkbox', { name: '稀有怪传说装', exact: true }).uncheck()
    await expect(assistant.locator('.compact-copy')).toHaveCount(5)
    await page.getByText('留图助手', { exact: true }).click()
    expect(await exportState(page)).toEqual(before)
  })
}

test('留图复制被拒绝后仍保留整条可手动复制的表达式', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new Error('Denied') },
  } }))
  await openEmptyApp(page)
  await page.getByText('留图助手', { exact: true }).click()
  const assistant = page.getByRole('region', { name: '留图助手' })
  await assistant.getByRole('checkbox', { name: '稀有怪传说装', exact: true }).check()
  await assistant.getByRole('button', { name: '复制稀有怪传说装留图搜索', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '稀有怪传说装留图搜索' })
  await expect(dialog.getByRole('textbox')).toHaveValue(meatfish)
  await expect(dialog.getByRole('status')).toContainText('复制失败')
  await expect(dialog.getByRole('status')).not.toContainText('已复制')
})
