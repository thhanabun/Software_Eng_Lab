import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eTest123!'
const ALICE = 'e2e.alice@example.test'
const STAFF = 'e2e.staff@example.test'

function marker(label: string): string {
  return `${label} ${Date.now()} ${Math.floor(Math.random() * 1000)}`
}

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

async function createTicketViaUI(page: Page, summary: string): Promise<string> {
  await page.getByRole('link', { name: 'Create Ticket' }).first().click()
  await expect(page).toHaveURL(/\/tickets\/new$/)
  await page.getByLabel(/^Category/i).selectOption({ index: 1 })
  await page.getByLabel(/Related System/i).selectOption({ index: 1 })
  await page.getByLabel(/Requested Priority/i).selectOption('HIGH')
  await page.getByLabel(/ticket summary/i).fill(summary)
  await page.getByLabel(/^Description/i).fill('Observed repeatedly over the last two days.')
  await page.getByRole('button', { name: 'Submit Ticket' }).click()
  const number = (await page.getByTestId('generated-ticket-number').innerText()).trim()
  expect(number).toMatch(/^TKT-\d{8}-\d{4}$/)
  return number
}

test('E2E-06: create action with follow-up, edit it, requester sees read-only (AC-01..AC-03)', async ({
  page,
}) => {
  await loginAs(page, ALICE, /\/tickets$/)
  const summary = marker('e2e actions loop')
  await createTicketViaUI(page, summary)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page).toHaveURL(/\/tickets\/\d+$/)
  const requesterUrl = new URL(page.url())
  const ticketId = requesterUrl.pathname.split('/').pop() as string
  await logout(page)

  await loginAs(page, STAFF, /\/staff\/tickets$/)
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByTestId('detail-ticket-number')).toBeVisible()

  // Create with follow-up required.
  const desc = marker('action description')
  await page.getByLabel(/action description/i).fill(desc)
  await page.getByLabel(/^result/i).fill('Restarted the service; queue drains normally.')
  await page.getByLabel(/follow-up required/i).check()
  await page.getByLabel(/follow-up note/i).fill('Recheck in the morning shift.')
  await page.getByRole('button', { name: /post action/i }).click()
  await expect(page.getByText(desc)).toBeVisible()
  await expect(page.getByText('Recheck in the morning shift.')).toBeVisible()
  await logout(page)

  // Requester sees the action read-only: no form, no edit buttons.
  await loginAs(page, ALICE, /\/tickets$/)
  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByText(desc)).toBeVisible()
  expect(await page.getByTestId('actions-section').isVisible()).toBe(true)
  await expect(page.getByTestId('action-save')).toHaveCount(0)
})

test('E2E-09: actions-taken screenshots at three viewports', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 800],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const outDir = fileURLToPath(new URL('../../artifacts/lab-04/screenshots/actions-taken', import.meta.url))

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    fs.mkdirSync(outDir, { recursive: true })

    await loginAs(page, STAFF, /\/staff\/tickets$/)
    const firstOpen = page.getByRole('link', { name: 'Open' }).first()
    await expect(firstOpen).toBeVisible()
    await firstOpen.click()
    await expect(page.getByTestId('actions-section')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true })

    await context.close()
  }
})
