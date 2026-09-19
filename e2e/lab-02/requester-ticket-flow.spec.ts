import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const ALICE_EMAIL = 'e2e.alice@example.test'
const CARLOS_EMAIL = 'e2e.carlos@example.test'
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eTest123!'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function marker(label: string): string {
  return `${label} ${Date.now()} ${Math.floor(Math.random() * 1000)}`
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/tickets$/)
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

test('E2E-01: select requester, create ticket, find it in My Tickets, open detail', async ({ page }) => {
  await loginAs(page, ALICE_EMAIL)

  const summary = marker('e2e battery drain')
  const number = await createTicketViaUI(page, summary)

  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page.getByTestId('detail-ticket-number')).toHaveText(number)
  await expect(page.getByText(summary)).toBeVisible()

  await page.getByRole('link', { name: /back to my tickets/i }).click()
  await page.getByLabel(/^Search$/).fill(summary)
  await page.getByRole('button', { name: /apply search/i }).click()

  const row = page.locator('tr', { hasText: number })
  await expect(row).toBeVisible()
  await expect(row).toContainText(summary)
})

test('E2E-05 (AC-28): ticket can be created using only the keyboard', async ({ page }) => {
  await loginAs(page, ALICE_EMAIL)

  await page.getByRole('link', { name: 'Create Ticket' }).first().focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tickets\/new$/)

  await page.getByLabel(/^Category/i).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByLabel(/Related System/i).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByLabel(/Requested Priority/i).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByLabel(/ticket summary/i).pressSequentially('keyboard only ticket')
  await page.getByLabel(/^Description/i).pressSequentially('Created without any mouse clicks.')
  await page.getByRole('button', { name: 'Submit Ticket' }).focus()
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('generated-ticket-number')).toHaveText(/^TKT-\d{8}-\d{4}$/)
})

test('E2E-02: requester B never sees requester A tickets (UI and direct API)', async ({
  page,
}) => {
  await loginAs(page, ALICE_EMAIL)
  const summary = marker('e2e private ticket')
  await createTicketViaUI(page, summary)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  const ticketUrl = new URL(page.url())
  const ticketId = ticketUrl.pathname.split('/').pop() as string

  await logout(page)
  await loginAs(page, CARLOS_EMAIL)

  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByTestId('not-found-panel')).toBeVisible()

  await page.goto('/tickets')
  await page.getByLabel(/^Search$/).fill(summary)
  await page.getByRole('button', { name: /apply search/i }).click()
  await expect(page.getByTestId('no-results-state')).toBeVisible()

  // Direct API with Carlos's session cookies (page.request shares them).
  const direct = await page.request.get(`/api/tickets/${ticketId}`)
  expect(direct.status()).toBe(404)
})

test('E2E-03: attachment upload, download, soft removal and blocked download', async ({
  page,
}) => {
  await loginAs(page, ALICE_EMAIL)
  const summary = marker('e2e attachment ticket')
  await createTicketViaUI(page, summary)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page.getByTestId('detail-ticket-number')).toBeVisible()

  await page
    .getByLabel(/choose attachment file/i)
    .setInputFiles({ name: 'e2e-proof.png', mimeType: 'image/png', buffer: PNG_MAGIC })

  const row = page.locator('li', { hasText: 'e2e-proof.png' })
  await expect(row.first()).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download e2e-proof\.png/i }).click(),
  ])
  expect(download.suggestedFilename()).toBe('e2e-proof.png')

  await page.getByRole('button', { name: /remove e2e-proof\.png/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/removal reason/i).fill('duplicate evidence upload')
  await page.getByTestId('confirm-remove').click()

  const removedRow = page.locator('li', { hasText: 'e2e-proof.png' })
  await expect(removedRow.getByTestId('attachment-removed-badge')).toBeVisible()
  await expect(removedRow).toContainText('duplicate evidence upload')
  await expect(
    page.getByRole('button', { name: /download e2e-proof\.png/i }),
  ).toHaveCount(0)

  const testId = (await removedRow.first().getAttribute('data-testid')) ?? ''
  const attachmentId = testId.replace('attachment-row-', '')
  expect(attachmentId).toMatch(/^\d+$/)
  const blocked = await page.request.get(`/api/attachments/${attachmentId}/download`)
  expect(blocked.status()).toBe(410)
})

test('E2E-04: responsive screenshots for create, my tickets, and detail', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 900],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const outDir = fileURLToPath(new URL('../../artifacts/lab-02/screenshots', import.meta.url))

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()

    await loginAs(page, ALICE_EMAIL)
    await expect(
      page
        .getByTestId('pagination-info')
        .or(page.getByTestId('empty-state'))
        .or(page.getByTestId('no-results-state')),
    ).toBeVisible({ timeout: 15_000 })
    await page.screenshot({
      path: shot(outDir, 'my-tickets', name),
    })

    await page.getByRole('link', { name: 'Create Ticket' }).first().click()
    await expect(page).toHaveURL(/\/tickets\/new$/)
    await expect(page.getByLabel(/^Category/i)).toBeVisible()
    await page.screenshot({ path: shot(outDir, 'create-ticket', name) })

    const summary = marker(`e2e ${name} screenshot ticket`)
    await createTicketViaUI(page, summary)
    await page.getByRole('button', { name: 'View Ticket' }).click()
    await expect(page.getByTestId('detail-ticket-number')).toBeVisible()
    await page.screenshot({ path: shot(outDir, 'ticket-detail', name), fullPage: true })

    await context.close()
  }
})

function shot(baseDir: string, screen: string, viewport: string): string {
  const dir = path.join(baseDir, screen)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${viewport}.png`)
}
