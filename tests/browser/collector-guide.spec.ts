import { test, expect } from './offline'
import { openEmptyApp } from './acceptance-helpers'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('主安装入口直接可见并打开真实中文候选说明，裸脚本仅在高级维护', async ({ page }) => {
  await openEmptyApp(page)
  const card = page.getByRole('region', { name: '国服采集器安装', exact: true })
  await expect(card).toBeVisible()
  await expect(card).toContainText('候选未公开发布')
  const manifest = await (await page.request.get('collector-release.json')).json()
  await expect(card).toContainText(`候选版本 v${manifest.version}`)
  const install = card.getByRole('link', { name: '安装国服海图采集器', exact: true })
  await expect(install).toBeVisible()
  await expect(install).toHaveAttribute('href', /collector\/installer\/使用说明\.html#install$/)
  await expect(card.getByRole('link', { name: /下载国服.*ahk/ })).not.toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await install.click()
  const guide = await popupPromise
  await expect(guide.getByRole('heading', { name: '第一次安装', exact: true })).toBeVisible()
  await expect(guide.locator('body')).toContainText('安装或更新国服海图采集器.cmd')
  await expect(guide.locator('body')).toContainText('尚未公开发布')
  await expect(guide.locator('body')).toContainText('Windows PowerShell')
  await expect(guide.locator('body')).toContainText('查看本地诊断')
  await expect(guide.locator('body')).toContainText('国服海图采集器维护')
  await guide.close()
  await card.getByText('高级维护：裸脚本与版本清单', { exact: true }).click()
  const download = card.getByRole('link', { name: `⬇ 下载国服 ${manifest.script}`, exact: true })
  await expect(download).toBeVisible()
  const response = await page.request.get((await download.getAttribute('href'))!)
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain(`CollectorVersion := "${manifest.version}"`)
})


test('候选版本加载、无效清单和重试都有真实反馈，说明始终可用', async ({ page }) => {
  let releaseRequest: (() => void) | undefined
  const held = new Promise<void>(resolve => { releaseRequest = resolve })
  let useRealManifest = false
  await page.route('**/collector-release.json', async route => {
    if (useRealManifest) return route.continue()
    await held
    return route.fulfill({ json: { version: '99.0.0' } })
  })
  await openEmptyApp(page)
  const card = page.getByRole('region', { name: '国服采集器安装', exact: true })
  await expect(card.locator('[aria-live=polite]')).toHaveText('正在读取候选版本…')
  await expect(card.getByRole('link', { name: '安装国服海图采集器', exact: true })).toBeVisible()
  releaseRequest!()
  await expect(card.locator('[aria-live=polite]')).toContainText('暂时无法读取候选版本')
  await expect(card).not.toContainText('99.0.0')
  useRealManifest = true
  await card.getByRole('button', { name: '重试读取候选版本', exact: true }).click()
  const manifest = await (await page.request.get('collector-release.json')).json()
  await expect(card.locator('[aria-live=polite]')).toContainText(`候选版本 v${manifest.version}`)
  await expect(card.getByRole('button', { name: '重试读取候选版本', exact: true })).toHaveCount(0)

  await page.route('**/collector-release.json', route => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto('collector/installer/使用说明.html')
  await expect(page.getByRole('status')).toContainText('当前候选版本暂不可读取')
  await expect(page.getByRole('heading', { name: '第一次安装', exact: true })).toBeVisible()
})


test('安装卡片和独立说明在390与桌面、明暗主题均可阅读和键盘访问', async ({ page }) => {
  await openEmptyApp(page)
  const card = page.getByRole('region', { name: '国服采集器安装', exact: true })
  for (const theme of ['dark', 'harvest']) {
    await page.evaluate(value => { localStorage.setItem('theme', value) }, theme)
    await page.reload()
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const install = card.getByRole('link', { name: '安装国服海图采集器', exact: true })
      await install.scrollIntoViewIfNeeded()
      const box = await card.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await install.focus()
      await expect(install).toBeFocused()
    }
  }
  await page.goto('collector/installer/使用说明.html')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: /切换到.*主题/ }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByText('候选版本、准确大小与验收信息', { exact: true }).click()
      await expect(page.locator('#candidate')).toContainText('SHA-256')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByText('候选版本、准确大小与验收信息', { exact: true }).click()
      const install = page.getByRole('link', { name: '首次安装', exact: true })
      await install.focus()
      await expect(install).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#install$/)
      await expect(page.getByRole('heading', { name: '第一次安装', exact: true })).toBeInViewport()
    }
  }
})


test('随包说明复制到无payload的桌面帮助位置后，离线版本与清单仍可用', async ({ page }) => {
  const temporary = mkdtempSync(join(tmpdir(), 'voyage-guide-'))
  try {
    execFileSync('python3', ['scripts/build-collector.py', '--output', temporary])
    const archive = join(temporary, readdirSync(temporary).find(name => name.endsWith('-starter.zip'))!)
    const extracted = join(temporary, 'package')
    execFileSync('python3', ['-m', 'zipfile', '-e', archive, extracted])
    const installedGuide = join(temporary, '安装后的使用说明.html')
    copyFileSync(join(extracted, '使用说明.html'), installedGuide)
    await page.route('file:///**', route => route.continue())
    await page.goto(pathToFileURL(installedGuide).href)
    const manifest = JSON.parse(execFileSync('python3', ['-c',
      'import json,sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("payload/collector-release.json").decode())', archive], { encoding: 'utf8' }))
    await expect(page.getByRole('status')).toContainText(`候选版本 v${manifest.version}`)
    await page.getByText('候选版本、准确大小与验收信息', { exact: true }).click()
    await page.getByRole('link', { name: '查看本候选版本清单', exact: true }).click()
    await expect(page.locator('#bundled-release-view')).toBeVisible()
    expect(JSON.parse(await page.locator('#bundled-release-view').innerText())).toEqual(manifest)
    await expect(page).toHaveURL(/#bundled-release-details$/)
    await page.setViewportSize({ width: 390, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
