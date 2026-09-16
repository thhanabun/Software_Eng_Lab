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
  // Wait for the session round-trip before any direct goto, otherwise the
  // auth guard wins the race and bounces back to /login.
  await expect(page).toHaveURL(home)
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function createTicketViaUI(page: Page, summary: string): Promise<string> {
  await page.getByRole('link', { name: 'Create Ticket' }).first().click()
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

test('E2E-02: queue → claim → priority → status → comment + note → indication visible (AC-13..AC-20)', async ({
  page,
}) => {
  // Requester opens the loop: create ticket, post a public comment, indicate resolved.
  await loginAs(page, ALICE, /\/tickets$/)
  const summary = marker('e2e staff loop')
  const number = await createTicketViaUI(page, summary)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page.getByTestId('detail-ticket-number')).toHaveText(number)
  const requesterUrl = new URL(page.url())
  const ticketId = requesterUrl.pathname.split('/').pop() as string

  const requesterComment = marker('requester comment')
  await page.getByLabel(/add a comment/i).fill(requesterComment)
  await page.getByRole('button', { name: /post comment/i }).click()
  await expect(page.getByText(requesterComment)).toBeVisible()

  // Fresh ticket is NEW, which is not indicatable — staff triage moves it to
  // OPEN first via claim below, then the requester indicates from there.
  await logout(page)

  // Staff finds the ticket through the queue search (AC-13).
  await loginAs(page, STAFF, /\/staff\/tickets$/)
  await expect(page).toHaveURL(/\/staff\/tickets$/)
  await page.getByLabel(/^search$/i).fill(summary)
  await page.getByRole('button', { name: /apply search/i }).click()
  const row = page.locator('tr', { hasText: number })
  await expect(row).toBeVisible()

  // Open detail and claim: owner set, NEW → OPEN side effect (AC-14).
  await row.getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(new RegExp(`/staff/tickets/${ticketId}$`))
  await expect(page.getByTestId('detail-ticket-number')).toHaveText(number)
  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByTestId('owner-line')).toContainText('E2E Staff')

  // IT Priority is staff-settable (AC-16).
  await page.getByLabel('IT Priority', { exact: true }).selectOption('URGENT')
  await expect(page.getByTestId('ops-saved')).toBeVisible()

  // Matrix-legal status move OPEN → IN_PROGRESS (AC-17).
  await page.getByLabel('Status', { exact: true }).selectOption('IN_PROGRESS')
  await expect(page.getByTestId('ops-saved')).toBeVisible()

  // Staff public reply (AC-18) + internal note (AC-19).
  const staffComment = marker('staff reply')
  await page.getByLabel(/reply to requester/i).fill(staffComment)
  await page.getByRole('button', { name: /post comment/i }).click()
  await expect(page.getByText(staffComment)).toBeVisible()

  const staffNote = marker('internal triage note')
  await page.getByLabel(/add internal note/i).fill(staffNote)
  await page.getByRole('button', { name: /post note/i }).click()
  await expect(page.getByText(staffNote)).toBeVisible()

  await logout(page)

  // Requester indicates "appears resolved" on the now-OPEN ticket (AC-20),
  // and never sees the internal note channel (AUTHZ-07 in the browser).
  await loginAs(page, ALICE, /\/tickets$/)
  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByTestId('notes-section')).toHaveCount(0)
  await page.getByRole('button', { name: /problem appears resolved/i }).click()
  await expect(page.getByTestId('resolved-indication-line')).toBeVisible()
  await expect(page.getByText(requesterComment)).toBeVisible()
  await expect(page.getByText(staffComment)).toBeVisible()
  await expect(page.getByText(staffNote)).toHaveCount(0)

  await logout(page)

  // Staff sees the requester indication line on the same ticket.
  await loginAs(page, STAFF, /\/staff\/tickets$/)
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByTestId('resolved-indication-line')).toBeVisible()
  await expect(page.getByText(staffNote)).toBeVisible()
})

test('E2E-04: staff queue and detail screenshots at three viewports', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 800],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const base = fileURLToPath(new URL('../../artifacts/lab-03/screenshots', import.meta.url))

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await loginAs(page, STAFF, /\/staff\/tickets$/)
    await expect(page.getByTestId('queue-count').or(page.getByTestId('empty-state'))).toBeVisible({
      timeout: 15_000,
    })
    const queueDir = path.join(base, 'staff-queue')
    fs.mkdirSync(queueDir, { recursive: true })
    await page.screenshot({ path: path.join(queueDir, `${name}.png`) })

    const firstOpen = page.getByRole('link', { name: 'Open' }).first()
    await expect(firstOpen).toBeVisible()
    await firstOpen.click()
    await expect(page.getByTestId('detail-ticket-number')).toBeVisible({ timeout: 15_000 })
    const detailDir = path.join(base, 'staff-ticket-detail')
    fs.mkdirSync(detailDir, { recursive: true })
    await page.screenshot({ path: path.join(detailDir, `${name}.png`), fullPage: true })

    await context.close()
  }
})
