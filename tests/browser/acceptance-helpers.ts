import { expect, type Page } from '@playwright/test'
import type { AppState } from '../../src/logic/storage'

export async function openEmptyApp(page: Page) {
  await page.goto('./')
  await page.locator('.onboard-actions button').last().click()
}

export async function loadState(page: Page, state: AppState) {
  await page.getByLabel('恢复规划备份', { exact: true }).setInputFiles({
    name: 'offline-acceptance-state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)),
  })
  await expect(page.locator('.planning-backup [role=status]')).toHaveText('已从 JSON 载入规划状态')
}

export async function exportState(page: Page): Promise<AppState> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出规划备份', exact: true }).click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** The OS clipboard is the only substitute; app copy handlers run unchanged. */
export async function installClipboardRecorder(page: Page) {
  await page.addInitScript(() => {
    const writes: string[] = []
    Object.defineProperty(window, '__acceptanceClipboardWrites', { value: writes })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { writes.push(text) },
    } })
  })
}

export const clipboardWrites = (page: Page): Promise<string[]> => page.evaluate(() =>
  (window as unknown as { __acceptanceClipboardWrites: string[] }).__acceptanceClipboardWrites,
)
