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

for (const bottleName of ['瓶中信', '漂流瓶']) test(`equivalent numeral and particle wording imports ${bottleName} without broad fuzzy matching`, async ({ page }) => {
  const implicit = `相邻区域包含两个额外的${bottleName}`
  const text = tormentedCage.replace('相邻区域包含一个额外罪魂牢笼 — 数值不可调整', implicit)
  await importCharts(page, text)
  await expect(page.getByRole('status')).toHaveText('已导入 1 张海图：海洋 航行 珊瑚密林海图')
  const state = await exportState(page)
  expect(state.pool).toHaveLength(1)
  expect(state.pool[0]).toMatchObject({ modIds: ['adj-msg-2'], implicitText: implicit })
  await page.locator('.chart-grid .chart-sq').first().hover()
  await expect(page.locator('.poe-tooltip')).toContainText('漂流瓶')
  await expect(page.locator('.poe-tooltip')).not.toContainText('瓶中信')
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

// Derived collector payload from reviewed source wording; not a real OCR capture.
test('国服边界文字随真实海图批次一次粘贴并直接导入指定位置', async ({ page }) => {
  const border = '=== VOYAGE BORDER 4 ===\n相 邻 区 域 的 怪 物 群 规 模 提 高 １６ ％\n=== END VOYAGE BORDER ==='
  await pasteCharts(page, `${samples}\n${extraSamples}\n${tormentedCage}\n${border}`.replace(/\n/g, '\r\n'))
  const status = page.getByRole('status')
  await expect(status).toContainText('已导入 6 张海图')
  await expect(status).toContainText('已匹配 1/1 个边界词缀')
  await expect(page.locator('[data-border-segment="4"]')).toHaveAttribute('title', '相邻区域的怪物群规模提高 16%')
  const state = await exportState(page)
  expect(state.pool).toHaveLength(6)
  expect(state.pool.map(chart => chart.shape)).toEqual(['End', 'Straight', 'Corner', 'Junction', 'Crossing', 'Crossing'])
  expect(state.borders).toEqual([null, null, null, null, 'b-pack-1', null, null, null, null, null, null, null])
  await pasteCharts(page, `${samples}\n${extraSamples}\n${tormentedCage}\n${border}`)
  await expect(status).toContainText('跳过 6 张已在库存中的海图')
  expect((await exportState(page)).pool).toHaveLength(6)
})

test('中文边界数字被标点分隔时不猜档位，并保留原边界', async ({ page }) => {
  const block = (text: string) => `=== VOYAGE BORDER 0 ===\n${text}\n=== END VOYAGE BORDER ===`
  await pasteCharts(page, block('相邻区域的怪物群规模提高 24%'))
  await expect(page.getByRole('status')).toHaveText('已匹配 1/1 个边界词缀')

  await pasteCharts(page, block('相邻区域的怪物群规模提高 1。6%'))
  await expect(page.getByRole('status')).toHaveText('已匹配 0/1 个边界词缀; 未识别边界悬停文本，已保留原有边界')
  await expect(page.locator('[data-border-segment="0"]')).toHaveAttribute('title', '相邻区域的怪物群规模提高 24%')
  expect((await exportState(page)).borders).toEqual(['b-pack-2', null, null, null, null, null, null, null, null, null, null, null])
})

// Source-derived 12-slot payload with literal expected IDs, independent of the matcher.
test('国服十二槽直接更新保留全量、部分、全失败和手动补选的原版行为', async ({ page }) => {
  const block = (index: number, text: string) => `=== VOYAGE BORDER ${index} ===\n${text}\n=== END VOYAGE BORDER ===`
  const initial = Array.from({ length: 12 }, (_, index) => block(index, '相邻区域的怪物群规模提高 24%')).join('\n')
  await pasteCharts(page, initial)
  await expect(page.getByRole('status')).toHaveText('已匹配 12/12 个边界词缀')
  expect((await exportState(page)).borders).toEqual(Array(12).fill('b-pack-2'))

  const texts = [
    '相邻区域的怪物群规模提高 16%',
    '相邻区域的怪物群规模提高 24%',
    '相邻区域的怪物群规模提高 32%',
    '相邻区域的稀有怪物数量提高 50%',
    '相邻区域中稀有怪物数量按每条连接提高 75%',
    '相邻区域中找到的物品数量按每条连接降低 50%\n相邻区域中找到的物品数量提高 180%',
    '相邻区域的稀有怪物掉落 1 个额外神圣石',
    '相邻区域包含船长灾星',
    '相邻海图在开始航行时有 50% 的几率不被消耗',
    '相邻区域包含 2 个额外宝藏锚',
    '相邻区域中找到的通货总增 100%',
    'OCR ERROR: 未识别到边界文字',
  ]
  await pasteCharts(page, texts.map((text, index) => block(index, text)).join('\n'))
  await expect(page.getByRole('status')).toHaveText('已匹配 11/12 个边界词缀; OCR 未匹配的边界位置：12')
  const snapshot = ['b-pack-1', 'b-pack-2', 'b-pack-3', 'b-rare-1', 'b-rareconn-2', 'b-quantconn-2',
    'b-divine', 'b-crabboss', 'b-keep-2', 'b-anchor-1', 'b-curr-3', null]
  expect((await exportState(page)).borders).toEqual(snapshot)
  for (const segment of [0, 4, 6, 9]) {
    await expect(page.locator(`[data-border-segment="${segment}"]`)).toHaveAttribute('title', texts[segment])
  }
  await expect(page.locator('[data-border-segment="11"]')).toHaveText('·')

  await pasteCharts(page, Array.from({ length: 12 }, (_, index) => block(index, '相邻区域包含未知首领')).join('\n'))
  await expect(page.getByRole('status')).toHaveText('已匹配 0/12 个边界词缀; 未识别边界悬停文本，已保留原有边界')
  expect((await exportState(page)).borders).toEqual(snapshot)

  await pasteCharts(page, `${block(0, '相邻区域的怪物群规模提高 32%')}\n${block(1, '相邻区域的怪物群规模降低 24%')}`)
  await expect(page.getByRole('status')).toHaveText('已匹配 1/2 个边界词缀; OCR 未匹配的边界位置：2')
  expect((await exportState(page)).borders).toEqual(['b-pack-3', ...snapshot.slice(1)])

  await page.locator('[data-border-segment="11"]').click()
  await page.getByPlaceholder('搜索边界词缀…').fill('神圣石')
  await page.locator('.bpop-item').filter({ hasText: '相邻区域的稀有怪物掉落 1 个额外神圣石' }).click()
  expect((await exportState(page)).borders).toEqual(['b-pack-3', 'b-pack-2', 'b-pack-3', 'b-rare-1', 'b-rareconn-2', 'b-quantconn-2',
    'b-divine', 'b-crabboss', 'b-keep-2', 'b-anchor-1', 'b-curr-3', 'b-divine'])
})

for (const newline of ['LF', 'CRLF']) {
  test(`逐张带 BOM 的国服海图批次保留全部实物与字段，重复导入仍去重（${newline}）`, async ({ page }) => {
    const batch = `\uFEFF${first}\n\n\uFEFF${second}`
    await pasteCharts(page, newline === 'CRLF' ? batch.replace(/\n/g, '\r\n') : batch)
    await expect(page.getByRole('status')).toHaveText('已导入 2 张海图：航海 冒险 珊瑚暗礁海图、航海 深入 金沙海床海图')
    const state = await exportState(page)
    expect(state.pool).toHaveLength(2)
    expect(state.pool).toEqual([
      expect.objectContaining({ name: '航海 冒险 珊瑚暗礁海图', level: 83, areaType: 'clam-infested-shelf', shape: 'End',
        modIds: ['adj-crab-1'], rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 75 }] }),
      expect.objectContaining({ name: '航海 深入 金沙海床海图', level: 83, areaType: 'abyssal-plain', shape: 'Straight',
        modIds: ['voy-pack-1'], rewards: [{ stat: 'quantity', percent: 110 }, { stat: 'sulphur', percent: 60 }, { stat: 'packsize', percent: 5 }] }),
    ])
    await pasteCharts(page, samples)
    await expect(page.getByRole('status')).toContainText('跳过 2 张已在库存中的海图')
    expect((await exportState(page)).pool).toEqual(state.pool)
  })
}
