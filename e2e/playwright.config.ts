import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './lab-02',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../artifacts/lab-02/playwright-report' }],
  ],
  globalSetup: './lab-02/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '../client',
      port: 5173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
