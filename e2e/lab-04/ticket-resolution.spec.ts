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

test('E2E-07: gate blocks resolve-before-action, then resolve succeeds (AC-04..AC-06)', async ({
  page,
}) => {
  // Requester creates a fresh ticket.
  await loginAs(page, ALICE, /\/tickets$/)
  const summary = marker('e2e resolution loop')
  await page.getByRole('link', { name: 'Create Ticket' }).first().click()
  await expect(page).toHaveURL(/\/tickets\/new$/)
  await page.getByLabel(/^Category/i).selectOption({ index: 1 })
  await page.getByLabel(/Related System/i).selectOption({ index: 1 })
  await page.getByLabel(/Requested Priority/i).selectOption('HIGH')
  await page.getByLabel(/ticket summary/i).fill(summary)
  await page.getByLabel(/^Description/i).fill('Needs triage and resolution.')
  await page.getByRole('button', { name: 'Submit Ticket' }).click()
  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page).toHaveURL(/\/tickets\/\d+$/)
  const ticketId = new URL(page.url()).pathname.split('/').pop() as string
  await logout(page)

  // Staff triage: claim (NEW->OPEN), move to IN_PROGRESS.
  await loginAs(page, STAFF, /\/staff\/tickets$/)
  await page.goto(`/staff/tickets/${ticketId}`)
  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByTestId('ops-saved')).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('IN_PROGRESS')
  await expect(page.getByTestId('ops-saved')).toBeVisible()

  // Gate: RESOLVED with zero actions is rejected with a visible error.
  await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
  await expect(page.getByTestId('ops-error')).toContainText(/at least one recorded action/i)

  // Record an action, then RESOLVED succeeds.
  const actionDesc = marker('resolution action')
  await page.getByLabel(/action description/i).fill(actionDesc)
  await page.getByLabel(/^result/i).fill('Root cause fixed and verified.')
  await page.getByRole('button', { name: /post action/i }).click()
  await expect(page.getByText(actionDesc)).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
  await expect(page.getByTestId('ops-saved')).toBeVisible()
})
