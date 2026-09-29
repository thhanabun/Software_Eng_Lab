import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eTest123!'
const ALICE = 'e2e.alice@example.test'
const STAFF = 'e2e.staff@example.test'

async function loginAs(page: Page, email: string, home: RegExp): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(home)
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test('E2E-08: dashboards show metrics and drill down to filtered lists (AC-07..AC-09)', async ({
  page,
}) => {
  // Requester dashboard -> drill into filtered My Tickets.
  await loginAs(page, ALICE, /\/tickets$/)
  await page.goto('/dashboard')
  await expect(page.getByTestId('requester-dashboard')).toBeVisible()
  await page.getByRole('link', { name: 'View Waiting for you' }).click()
  await expect(page).toHaveURL(/\/tickets\?status=WAITING_FOR_REQUESTER/)
  await logout(page)

  // Staff dashboard -> drill into the filtered queue.
  await loginAs(page, STAFF, /\/staff\/tickets$/)
  await page.goto('/dashboard')
  await expect(page.getByTestId('staff-dashboard')).toBeVisible()
  await page.getByRole('link', { name: 'View Unassigned tickets' }).click()
  await expect(page).toHaveURL(/\/staff\/tickets\?owner=unassigned/)
})

test('E2E-09: dashboard screenshots at three viewports', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 800],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()

    const staffDir = fileURLToPath(new URL('../../artifacts/lab-04/screenshots/staff-dashboard', import.meta.url))
    fs.mkdirSync(staffDir, { recursive: true })
    await loginAs(page, STAFF, /\/staff\/tickets$/)
    await page.goto('/dashboard')
    await expect(page.getByTestId('staff-dashboard')).toBeVisible()
    await page.screenshot({ path: path.join(staffDir, `${name}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Logout' }).click()

    const reqDir = fileURLToPath(new URL('../../artifacts/lab-04/screenshots/requester-dashboard', import.meta.url))
    fs.mkdirSync(reqDir, { recursive: true })
    await loginAs(page, ALICE, /\/tickets$/)
    await page.goto('/dashboard')
    await expect(page.getByTestId('requester-dashboard')).toBeVisible()
    await page.screenshot({ path: path.join(reqDir, `${name}.png`), fullPage: true })

    await context.close()
  }
})
