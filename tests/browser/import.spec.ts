import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './offline'
import type { AppState } from '../../src/logic/storage'

const samples = readFileSync(new URL('../../samples/charted.zh-CN.txt', import.meta.url), 'utf8')
const [first, second] = samples.trim().split(/\n\s*(?=物品类别: 海图)/)
const extraSamples = readFileSync(new URL('../../samples/charted-extra-shapes.zh-CN.txt', import.meta.url), 'utf8')
const tormentedCage = readFileSync(new URL('../../samples/charted-tormented-cage.zh-CN.txt', import.meta.url), 'utf8')
const [third] = extraSamples.trim().split(/\n\s*(?=物品类别: 海图)/)
const unknown = first.replace(/(\{ 基底属性 \}\n)[^\n]+/, '$1明确未知的测试航行词缀')

async function importCharts(page: Page, text: string) {
  await page.locator('.import-panel textarea[placeholder]').fill(text)
  await page.locator('.import-actions button').first().click()
}

async function exportState(page: Page): Promise<AppState> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出规划备份', exact: true }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Close the actual first-visit onboarding without adding demo inventory.
  await page.locator('.onboard-actions button').last().click()
})

async function pasteCharts(page: Page, text: string) {
  await page.evaluate((value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', value)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }))
  }, text)
}

for (const control of ['paste', 'button']) {
  test(`reported Tormented Cage chart imports through ${control} and retains its fields in backup`, async ({ page }) => {
    const text = tormentedCage.replace(/\n/g, '\r\n')
    await (control === 'paste' ? pasteCharts(page, text) : importCharts(page, text))
    await expect(page.getByRole('status')).toHaveText('已导入 1 张海图：海洋 航行 珊瑚密林海图')
    await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(1)
    const state = await exportState(page)
    expect(state.pool).toHaveLength(1)
    expect(state.pool[0]).toMatchObject({
      name: '海洋 航行 珊瑚密林海图', level: 83, areaType: 'undersea-groves',
      shape: 'Crossing', edges: [true, true, true, true], modIds: ['adj-spirit-1'],
      implicitText: '相邻区域包含一个额外罪魂牢笼 — 数值不可调整',
      rewards: [{ stat: 'quantity', percent: 142 }, { stat: 'sulphur', percent: 30 }, { stat: 'rarity', percent: 22 }],
    })
  })
}

test('equivalent numeral and particle wording imports without broad fuzzy matching', async ({ page }) => {
  const implicit = '相邻区域包含两个额外的瓶中信'
  const text = tormentedCage.replace('相邻区域包含一个额外罪魂牢笼 — 数值不可调整', implicit)
  await importCharts(page, text)
  await expect(page.getByRole('status')).toHaveText('已导入 1 张海图：海洋 航行 珊瑚密林海图')
  const state = await exportState(page)
  expect(state.pool).toHaveLength(1)
  expect(state.pool[0]).toMatchObject({ modIds: ['adj-msg-2'], implicitText: implicit })
  await importCharts(page, text.replace('相邻区域包含', '所有航行区域包含'))
  await expect(page.getByRole('status')).toHaveText('拒绝 1 项无法识别')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(1)
})

test('consecutive single imports announce the actual chart and rotate success wording across both controls', async ({ page }) => {
  const status = page.getByRole('status')
  await pasteCharts(page, first)
  await expect(status).toHaveText('已导入 1 张海图：航海 冒险 珊瑚暗礁海图')
  await expect(status).toHaveAttribute('aria-atomic', 'true')
  await pasteCharts(page, first)
  await expect(status).toContainText('跳过 1 张已在库存中的海图')
  await expect(status).not.toContainText('已导入')
  await importCharts(page, second)
  await expect(status).toHaveText('已加入库存 1 张海图：航海 深入 金沙海床海图')
  await pasteCharts(page, third)
  await expect(status).toHaveText('已收录 1 张海图：远洋 冒险 珊瑚暗礁海图')
  const state = await exportState(page)
  expect(state.pool.map(chart => chart.name)).toEqual([
    '航海 冒险 珊瑚暗礁海图', '航海 深入 金沙海床海图', '远洋 冒险 珊瑚暗礁海图',
  ])
})

test('mixed batch feedback names only new charts with a compact summary and accurate counts', async ({ page }) => {
  await importCharts(page, first)
  await pasteCharts(page, `${samples}\n${extraSamples}\n${unknown}`)
  await expect(page.getByRole('status')).toHaveText(
    '已加入库存 4 张海图：航海 深入 金沙海床海图、远洋 冒险 珊瑚暗礁海图 等 4 张; 跳过 1 张已在库存中的海图（重新导入前可先清空库存）; 拒绝 1 项无法识别',
  )
  await expect(page.getByRole('status')).not.toContainText('航海 冒险 珊瑚暗礁海图')
  expect((await exportState(page)).pool).toHaveLength(5)
})

test('rejected, empty and border-only results replace chart feedback without advancing success wording', async ({ page }) => {
  const status = page.getByRole('status')
  await importCharts(page, first)
  await importCharts(page, unknown)
  await expect(status).toHaveText('拒绝 1 项无法识别')
  await importCharts(page, '不是海图')
  await expect(status).toHaveText('拒绝 1 项无法识别')
  await page.locator('.import-panel textarea[placeholder]').fill('')
  await expect(page.getByRole('button', { name: '解析并加入', exact: true })).toBeDisabled()
  await pasteCharts(page, '=== VOYAGE BORDER 0 ===\n16% increased Pack Size in adjacent Areas\n=== END VOYAGE BORDER ===')
  await expect(status).toHaveText('已匹配 1/1 个边界词缀')
  expect((await exportState(page)).borders[0]).toBe('b-pack-1')
  await pasteCharts(page, '=== VOYAGE BORDER 0 ===\nnot a border tooltip\n=== END VOYAGE BORDER ===')
  await expect(status).toHaveText('已匹配 0/1 个边界词缀; 未识别边界悬停文本，已保留原有边界')
  await pasteCharts(page, second)
  await expect(status).toHaveText('已加入库存 1 张海图：航海 深入 金沙海床海图')
  const state = await exportState(page)
  expect(state.pool).toHaveLength(2)
  expect(state.borders[0]).toBe('b-pack-1')
})

for (const theme of ['light', 'dark']) {
  test(`compact import feedback remains readable at 390px in ${theme} theme`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const switcher = page.getByRole('button', { name: `切换到${theme === 'dark' ? '深色' : '浅色'}主题`, exact: true })
    if (await switcher.count()) await switcher.click()
    await importCharts(page, first)
    await importCharts(page, `${samples}\n${extraSamples}\n${unknown}`)
    const status = page.getByRole('status')
    await expect(status).toContainText('已加入库存 4 张海图')
    await status.scrollIntoViewIfNeeded()
    const box = (await status.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.height).toBeLessThan(200)
    expect(await status.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.locator('.import-panel').screenshot({ path: testInfo.outputPath(`import-feedback-${theme}-390.png`) })
  })
}

test('real import controls add both real charts in a Windows batch', async ({ page }) => {
  await importCharts(page, samples.replace(/\n/g, '\r\n'))
  await expect(page.locator('.import-panel .muted.pad')).toHaveText('已导入 2 张海图：航海 冒险 珊瑚暗礁海图、航海 深入 金沙海床海图')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(2)
  await expect(page.locator('.chart-grid .sq-lvl')).toHaveText(['83', '83'])
  await expect(page.locator('.chart-grid [title="区域等级 83"]')).toHaveCount(2)
  const state = await exportState(page)
  expect(state.pool).toEqual([
    expect.objectContaining({ name: '航海 冒险 珊瑚暗礁海图', level: 83, areaType: 'clam-infested-shelf', shape: 'End', edges: [true, false, false, false], modIds: ['adj-crab-1'], rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 75 }] }),
    expect.objectContaining({ name: '航海 深入 金沙海床海图', level: 83, areaType: 'abyssal-plain', shape: 'Straight', edges: [true, false, true, false], modIds: ['voy-pack-1'], rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 60 }, { stat: 'packsize', percent: 5 }] }),
  ])
  expect(new Set(state.pool.map((chart) => chart.uid)).size).toBe(2)
})

test('real import controls add the samples individually', async ({ page }) => {
  await importCharts(page, first)
  await expect(page.locator('.import-panel .muted.pad')).toHaveText('已导入 1 张海图：航海 冒险 珊瑚暗礁海图')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(1)
  await importCharts(page, second)
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(2)
})

test('unknown crucial effects are refused with the existing summary only', async ({ page }) => {
  await importCharts(page, unknown)
  await expect(page.locator('.import-panel .muted.pad')).toHaveText('拒绝 1 项无法识别')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(0)
})

test('a mixed batch keeps its valid chart and reports one rejected item', async ({ page }) => {
  await importCharts(page, `${second}\n\n${unknown}`)
  await expect(page.locator('.import-panel .muted.pad')).toHaveText('已导入 1 张海图：航海 深入 金沙海床海图; 拒绝 1 项无法识别')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(1)
})

for (const [name, text] of [
  ['missing implicit', first.replace(/\{ 基底属性 \}\n[^\n]+\n/, '')],
  ['empty implicit', first.replace(/(\{ 基底属性 \})\n[^\n]+/, '$1\n')],
  ['missing shape', first.replace('海图形状：端点\n', '')],
  ['unknown shape', first.replace('海图形状：端点', '海图形状：明确未知形状')],
  ['non-chart', first.replace('物品类别: 海图', '物品类别: 戒指')],
]) {
  test(`real import controls reject ${name}`, async ({ page }) => {
    await importCharts(page, text)
    await expect(page.locator('.import-panel .muted.pad')).toHaveText('拒绝 1 项无法识别')
    await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(0)
  })
}

test('uncharted derived text stays in the existing uncharted summary category', async ({ page }) => {
  await importCharts(page, first.replace(/(\{ 基底属性 \}\n)[^\n]+/, '$1航行词缀将在完成测绘后揭示'))
  await expect(page.locator('.import-panel .muted.pad')).toHaveText('拒绝 1 张未测绘海图（先完成测绘以揭示航行词缀）')
  await expect(page.locator('.chart-grid .chart-sq')).toHaveCount(0)
})
