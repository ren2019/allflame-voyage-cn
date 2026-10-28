import { expect, test } from './offline'
import { clipboardWrites, installClipboardRecorder, openEmptyApp } from './acceptance-helpers'

const quantity = '数量 120% 以上（英文参考）'
const quantityRegex = '"m q.*(1[2-9].|[2-9]..)%"'

test('搜索参考默认紧凑，名称打开可选择全文的键盘弹窗，关闭后复制仍有可见反馈', async ({ page }) => {
  await installClipboardRecorder(page)
  await openEmptyApp(page)
  await page.getByText('导入说明与搜索参考', { exact: true }).click()
  await page.getByText('🎲 洗练与保留海图（搜索参考）', { exact: true }).click()
  const reference = page.locator('.ahk-help').first()
  await expect(reference.locator('input')).toHaveCount(0)
  const name = reference.getByRole('button', { name: quantity, exact: true })
  await name.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: quantity })
  await expect(dialog).toBeVisible()
  const fullText = dialog.getByRole('textbox', { name: '完整搜索串' })
  await expect(fullText).toHaveValue(quantityRegex)
  await expect(fullText).toBeFocused()
  expect(await fullText.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe(quantityRegex.length)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(name).toBeFocused()
  await reference.getByRole('button', { name: `复制${quantity}`, exact: true }).click()
  await expect.poll(() => clipboardWrites(page)).toEqual([quantityRegex])
  await expect(reference.getByRole('status')).toContainText(`${quantity}：已复制完整文本`)
})

test('剪贴板未确认时不能报成功，拒绝后展示失败并保留手动复制全文', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: () => new Promise<void>((_resolve, reject) => {
        Object.defineProperty(window, 'rejectCopy', { configurable: true, value: () => reject(new Error('Denied')) })
      }),
    } })
  })
  await openEmptyApp(page)
  await page.getByText('导入说明与搜索参考', { exact: true }).click()
  await page.getByText('🎲 洗练与保留海图（搜索参考）', { exact: true }).click()
  const row = page.locator('.ahk-help').first()
  await row.getByRole('button', { name: `复制${quantity}`, exact: true }).click()
  await expect(row.getByRole('status')).toContainText('正在复制')
  await expect(row.getByRole('status')).not.toContainText('已复制')
  await page.evaluate(() => (window as unknown as { rejectCopy: () => void }).rejectCopy())
  const dialog = page.getByRole('dialog', { name: quantity })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('复制失败，请选择全文后手动复制')
  await expect(dialog.getByRole('textbox', { name: '完整搜索串' })).toHaveValue(quantityRegex)
  await dialog.getByRole('button', { name: '关闭全文弹窗' }).click()
  await expect(row.getByRole('status')).toContainText('复制失败')
})

test('剪贴板不可用时，弹窗内复制也给出可访问的失败状态且可关闭', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
  await openEmptyApp(page)
  await page.getByText('导入说明与搜索参考', { exact: true }).click()
  await page.getByText('🎲 洗练与保留海图（搜索参考）', { exact: true }).click()
  await page.getByRole('button', { name: quantity, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: quantity })
  await dialog.getByRole('button', { name: '复制全文', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('复制失败，请选择全文后手动复制')
  await dialog.getByRole('button', { name: '选择全文', exact: true }).click()
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

for (const width of [1440, 390]) {
  test(`${width}px 两主题中三条参考均完整复制，图标紧凑且全文弹窗可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await installClipboardRecorder(page)
    await openEmptyApp(page)
    await page.getByText('导入说明与搜索参考', { exact: true }).click()
  await page.getByText('🎲 洗练与保留海图（搜索参考）', { exact: true }).click()
    // Literals preserved from the original search references, rather than importing implementation constants.
    const references = [
      ['优质词缀（简中候选）', '"至少为魔法|无法掉落|被附身|分裂|漂流瓶|神圣的秘宝|奥术师|侦探|巨型海星|众神词缀|腰带|黄金灯笼|4000.*鬼灵|保险箱|所有航行区域的稀有怪物数量|所有航行区域中找到的亡者硫磺"'],
      [quantity, quantityRegex],
      ['硫磺 75% 以上（污秽蟹群，英文参考）', '"sul.*(7[5-9]|[89].|\\d..)%"'],
    ]
    const expectedWrites: string[] = []
    for (let theme = 0; theme < 2; theme++) {
      if (theme) await page.locator('.theme-link').click()
      for (const [label, text] of references) {
        const copy = page.getByRole('button', { name: `复制${label}`, exact: true })
        await expect(copy).toHaveText('')
        const size = await copy.boundingBox()
        expect(size?.width).toBe(28)
        expect(size?.height).toBe(28)
        expect(size!.x + size!.width).toBeLessThanOrEqual(width)
        await copy.click()
        expectedWrites.push(text)
        await expect.poll(() => clipboardWrites(page)).toEqual(expectedWrites)
        await page.getByRole('button', { name: label, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: label })
        await expect(dialog.getByRole('textbox')).toHaveValue(text)
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await dialog.getByRole('button', { name: '关闭全文弹窗' }).click()
      }
    }
  })
}
