import { defineConfig } from '@playwright/test'

const deploymentURL = process.env.PLAYWRIGHT_BASE_URL
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  use: { serviceWorkers: 'block', baseURL: deploymentURL ?? `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: deploymentURL ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI && process.env.OFFLINE_ACCEPTANCE !== '1',
  },
})
