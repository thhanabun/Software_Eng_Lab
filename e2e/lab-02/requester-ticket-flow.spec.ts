import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const ALICE = 'Alice Carter (alice.carter@student.example)'
const CARLOS = 'Carlos Reyes (carlos.reyes@student.example)'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function marker(label: string): string {
  return `${label} ${Date.now()} ${Math.floor(Math.random() * 1000)}`
}

async function selectRequester(page: Page, label: string): Promise<void> {
  await page.goto('/select-requester')
  await page.getByLabel(/Development Requester/i).selectOption({ label })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/tickets$/)
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
  await selectRequester(page, ALICE)

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
  await selectRequester(page, ALICE)

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
  request,
}) => {
  await selectRequester(page, ALICE)
  const summary = marker('e2e private ticket')
  await createTicketViaUI(page, summary)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  const ticketUrl = new URL(page.url())
  const ticketId = ticketUrl.pathname.split('/').pop() as string

  await page.getByRole('button', { name: /change requester/i }).click()
  await page.getByLabel(/Development Requester/i).selectOption({ label: CARLOS })
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByTestId('not-found-panel')).toBeVisible()

  await page.goto('/tickets')
  await page.getByLabel(/^Search$/).fill(summary)
  await page.getByRole('button', { name: /apply search/i }).click()
  await expect(page.getByTestId('no-results-state')).toBeVisible()

  const requesters = (await (await request.get('/api/requesters')).json()) as {
    id: number
    name: string
  }[]
  const carlosId = requesters.find((r) => r.name === 'Carlos Reyes')?.id
  expect(carlosId).toBeTruthy()
  const direct = await request.get(`/api/tickets/${ticketId}`, {
    headers: { 'X-Requester-Id': String(carlosId) },
  })
  expect(direct.status()).toBe(404)
})

test('E2E-03: attachment upload, download, soft removal and blocked download', async ({
  page,
  request,
}) => {
  await selectRequester(page, ALICE)
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
  if (/^\d+$/.test(attachmentId)) {
    const requesters = (await (await request.get('/api/requesters')).json()) as {
      id: number
      name: string
    }[]
    const aliceId = requesters.find((r) => r.name === 'Alice Carter')?.id
    const blocked = await request.get(`/api/attachments/${attachmentId}/download`, {
      headers: { 'X-Requester-Id': String(aliceId) },
    })
    expect(blocked.status()).toBe(410)
  }
})

test('E2E-04: responsive screenshots for create, my tickets, and detail', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 900],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const outDir = fileURLToPath(new URL('../../artifacts/lab-02/screenshots', import.meta.url))
  fs.mkdirSync(outDir, { recursive: true })

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()

    await selectRequester(page, ALICE)
    await expect(
      page
        .getByTestId('pagination-info')
        .or(page.getByTestId('empty-state'))
        .or(page.getByTestId('no-results-state')),
    ).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: path.join(outDir, `${name}-my-tickets.png`) })

    await page.getByRole('link', { name: 'Create Ticket' }).first().click()
    await expect(page).toHaveURL(/\/tickets\/new$/)
    await expect(page.getByLabel(/^Category/i)).toBeVisible()
    await page.screenshot({ path: path.join(outDir, `${name}-create-ticket.png`) })

    const summary = marker(`e2e ${name} screenshot ticket`)
    await createTicketViaUI(page, summary)
    await page.getByRole('button', { name: 'View Ticket' }).click()
    await expect(page.getByTestId('detail-ticket-number')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, `${name}-ticket-detail.png`), fullPage: true })

    await context.close()
  }
})
