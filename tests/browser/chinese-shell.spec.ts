import { expect, test } from './offline'

test('已读旧记录的用户仍看到新发布提醒，并能查看本次国服采集器说明', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen', '1')
    localStorage.setItem('announce-ahk-retired', '1')
    if (!localStorage.getItem('updates-seen')) localStorage.setItem('updates-seen', '2026-10-16')
  })
  await page.goto('/')
  const button = page.getByRole('button', { name: '更新记录', exact: true })
  await expect(button).toHaveClass(/unseen/)
  await button.click()
  const rows = page.locator('.updates-list .update-title')
  await expect(rows).toContainText([
    '统一国服采集器名称与版本',
    '国服海图与边界采集器',
    '琪莎拉整程填充与漂流瓶译名',
    '琪莎拉优先保图并保护锚地材料',
    '仅突出特殊目的地',
    '精简海图库存卡片操作',
    '航程保护、库存纠错与补位',
    '提高锚地策略的蛤蜊目标提醒优先级',
    '兼容同类海图词缀措辞',
    '修复罪魂牢笼海图导入',
    '紧凑边界选择与通货图标',
    '逐步复制操作保持可见',
  ])
  await expect(page.locator('.updates-list')).toContainText('包含一个／两个／二个')
  await expect(page.locator('.updates-list')).toContainText('真实出现权重')
  await page.keyboard.press('Escape')
  await expect(button).not.toHaveClass(/unseen/)
  await page.reload()
  await expect(button).not.toHaveClass(/unseen/)
})

test('页面标题、教程、更新记录和保留向导的完整交互说明使用简中', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page).toHaveTitle('永火航程规划 - 流放之路 3.29')
  await expect(page.locator('.onboard')).toContainText('Ctrl+Alt+C 高级复制')
  await page.locator('.onboard-actions button').last().click()
  await expect(page.locator('.import-panel textarea[placeholder]')).toHaveAttribute('placeholder', /Ctrl\+Alt\+C 高级复制/)
  await page.getByRole('button', { name: '🧭 使用教程', exact: true }).click()
  for (let step = 0; step < 8; step++) {
    await expect(page.locator('.tutorial .panel-title')).toContainText(/[\u4e00-\u9fff]/)
    if (step === 1) await expect(page.locator('.tutorial')).toContainText('Ctrl+Alt+C 高级复制')
    await expect(page.locator('.tutorial .tut-where')).toContainText(/[\u4e00-\u9fff]/)
    for (const paragraph of await page.locator('.tutorial .tut-body').allTextContents()) expect(paragraph).toMatch(/[\u4e00-\u9fff]/)
    if (step < 7) await page.locator('.tutorial .tut-next').click()
  }
  await page.getByRole('button', { name: '⚓ 开始规划', exact: true }).click()
  await page.getByRole('button', { name: '更新记录', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '更新记录', exact: true })).toBeVisible()
  await expect(page.locator('.updates-log')).toContainText('国服高级复制导入与简体中文界面')
  await expect(page.locator('.updates-log')).toContainText('九宫格区域目标提示')
  await expect(page.locator('.updates-log')).toContainText('完整规划备份与明暗主题')
  await expect(page.locator('.updates-log')).not.toContainText('旧版 Windows 批量导入脚本')
  await page.getByRole('button', { name: '原版历史', exact: true }).click()
  await expect(page.locator('.update-row')).toHaveCount(31)
  for (const title of await page.locator('.update-title').allTextContents()) expect(title).toMatch(/[\u4e00-\u9fff]/)
  for (const detail of await page.locator('.update-detail').allTextContents()) expect(detail).toMatch(/[\u4e00-\u9fff]/)
  await page.locator('.updates-log').getByRole('button', { name: '完成', exact: true }).click()
  // Exposes all steps and save/previous/next controls; dynamic strategy/type labels
  // come from the original definitions localized in parallel by #6.
  await page.getByRole('button', { name: '+ 添加海图', exact: true }).click()
  await page.getByRole('button', { name: '🔖 为策略保留海图…', exact: true }).click()
  await expect(page.locator('.save-wizard .panel-title')).toContainText('为策略保留海图')
  while (await page.locator('.save-wizard').getByRole('button', { name: '下一步 →', exact: true }).count()) {
    await page.locator('.save-wizard').getByRole('button', { name: '下一步 →', exact: true }).click()
  }
  await page.getByRole('button', { name: '💾 保存保留数量', exact: true }).click()
  await expect(page.locator('.save-wizard')).toHaveCount(0)
})

test('国服更新提醒覆盖已读原版日期，阅读后刷新保留，切换历史不混入本版', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen', '1')
    localStorage.setItem('announce-ahk-retired', '1')
    if (!localStorage.getItem('updates-seen')) localStorage.setItem('updates-seen', '2026-08-20')
  })
  await page.goto('/')
  const updatesButton = page.getByRole('button', { name: '更新记录', exact: true })
  await expect(updatesButton).toHaveClass(/unseen/)
  await updatesButton.click()
  const local = page.getByRole('button', { name: '国服版更新', exact: true })
  await expect(local).toHaveAttribute('aria-pressed', 'true')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const dialog = page.getByRole('dialog', { name: '更新记录', exact: true })
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
    await page.locator('.updates-list .update-row').last().scrollIntoViewIfNeeded()
    await expect(local).toBeInViewport()
    await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeInViewport()
  }
  await page.getByRole('button', { name: '原版历史', exact: true }).click()
  await expect(page.locator('.updates-list')).toContainText('原版海图与边界采集器')
  await expect(page.locator('.updates-list')).not.toContainText('国服高级复制导入与简体中文界面')
  await local.click()
  await expect(page.locator('.updates-list')).toContainText('航程历史与同策略比较')
  await page.locator('.updates-log').getByRole('button', { name: '完成', exact: true }).click()
  await expect(updatesButton).not.toHaveClass(/unseen/)
  await page.reload()
  await expect(updatesButton).not.toHaveClass(/unseen/)
  await updatesButton.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '更新记录', exact: true })).toHaveCount(0)
})

test('国服采集说明保留 F7 浮窗、被动采集和本地识别，并提供脚本下载', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen', '1')
    localStorage.setItem('announce-ahk-retired', '1')
  })
  await page.goto('/')
  const collector = page.getByRole('region', { name: '国服采集器安装', exact: true })
  await collector.getByText('高级维护：裸脚本与版本清单', { exact: true }).click()
  await expect(collector).toContainText('国服海图采集器')
  await expect(collector).toContainText('Ctrl+Alt+C')
  await expect(collector).toContainText('浮窗')
  await expect(collector).toContainText('错误')
  await expect(collector).toContainText('简体中文 OCR')
  await expect(collector).toContainText('不会向游戏发送按键或点击')
  await expect(collector).toContainText('按住 Alt')
  await expect(collector).toContainText('单独')
  await expect(collector).toContainText('手动选择')
  await expect(collector).not.toContainText('未做国服')
  const download = collector.getByRole('link', { name: '⬇ 下载国服 voyage-clip-collector-cn.ahk', exact: true })
  await expect(download).toHaveAttribute('download', '')
  const response = await page.request.get((await download.getAttribute('href'))!)
  expect(response.ok()).toBe(true)
  const script = await response.text()
  expect(script).toContain('#Requires AutoHotkey v2.0')
  const releaseResponse = await page.request.get(new URL('collector-release.json', response.url()).href)
  expect(releaseResponse.ok()).toBe(true)
  const release = await releaseResponse.json()
  await expect(collector).toContainText(`脚本版本 v${release.version}`)
  expect(script).toContain(`CollectorVersion := "${release.version}"`)
  expect(new URL(response.url()).pathname).toMatch(/\/voyage-clip-collector-cn\.ahk$/)
})

test('回访公告区分旧自动操作脚本与国服被动采集器', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-seen', '1'))
  await page.goto('/')
  const notice = page.locator('.ahk-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('旧版自动批量操作脚本保持停用')
  await expect(notice).toContainText('国服被动采集器')
  await expect(notice).toContainText('F7')
  await expect(notice).not.toContainText('未做国服')
  await notice.getByRole('button', { name: '知道了', exact: true }).click()
  await page.reload()
  await expect(notice).toHaveCount(0)
})
