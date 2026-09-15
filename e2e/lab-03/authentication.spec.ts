import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const ALICE = 'e2e.alice@example.test'
const STAFF = 'e2e.staff@example.test'
const ADMIN = 'e2e.admin@example.test'
const MUSTCHANGE = 'e2e.mustchange@example.test'
const INACTIVE = 'e2e.inactive@example.test'
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eTest123!'
const CHANGED_PASSWORD = 'E2eChanged123!'

async function fillLogin(page: Page, email: string, password: string = E2E_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test('E2E-01: each role lands on its home after login (AC-01)', async ({ page }) => {
  await fillLogin(page, ALICE)
  await expect(page).toHaveURL(/\/tickets$/)

  await logout(page)
  await fillLogin(page, STAFF)
  await expect(page).toHaveURL(/\/staff\/tickets$/)

  await logout(page)
  await fillLogin(page, ADMIN)
  await expect(page).toHaveURL(/\/admin\/users$/)
})

test('E2E-01: wrong password and unknown email give the identical generic error (AC-05)', async ({
  page,
}) => {
  await fillLogin(page, ALICE, 'WrongPass123!')
  const wrongPassword = await page.getByTestId('login-error').innerText()

  await fillLogin(page, 'nobody-here@example.test', 'WrongPass123!')
  const unknownEmail = await page.getByTestId('login-error').innerText()

  expect(wrongPassword).toMatch(/invalid email or password/i)
  expect(unknownEmail).toBe(wrongPassword)
})

test('E2E-01: inactive account is rejected with the deactivated message (AC-06)', async ({
  page,
}) => {
  await fillLogin(page, INACTIVE)
  await expect(page.getByTestId('login-error')).toContainText(/deactivat/i)
})

// Must-change flow: pinE2EUsers (globalSetup) re-pins mustChangePassword:true
// and resets the hash to E2eTest123! on every full run, so this test is
// self-healing.  If someone runs ONLY this file without globalSetup, the
// mustchange user will remain in changed state — not a real concern in CI
// (always full) but worth noting for isolated debugging.
test('E2E-01: must-change account is gated until a valid new password is saved (AC-02)', async ({
  page,
}) => {
  await fillLogin(page, MUSTCHANGE)
  await expect(page).toHaveURL(/\/change-password$/)

  // Normal screens stay unreachable while the flag is set (BR-02 gate).
  await page.goto('/tickets')
  await expect(page).toHaveURL(/\/change-password$/)

  await page.getByLabel(/current password/i).fill(E2E_PASSWORD)
  await page.getByLabel(/^new password/i).fill(CHANGED_PASSWORD)
  await page.getByLabel(/confirm new password/i).fill(CHANGED_PASSWORD)
  await page.getByRole('button', { name: /save new password/i }).click()

  // Must-change account holds the REQUESTER role, so its home is My Tickets.
  await expect(page).toHaveURL(/\/tickets$/)
  await expect(page.getByTestId('current-user')).toContainText('E2E Mustchange')
})

test('E2E-01: logout invalidates the session including back-button revisit (AC-07)', async ({
  page,
}) => {
  await fillLogin(page, ALICE)
  await expect(page).toHaveURL(/\/tickets$/)

  await logout(page)

  await page.goto('/tickets')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

test('E2E-05 (AC-29): login completes keyboard-only with visible focus', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel(/email/i).focus()
  await page.keyboard.type(ALICE)
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.getAttribute('id'))).toBe(
    'login-password',
  )
  await page.keyboard.type(E2E_PASSWORD)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/tickets$/)
})

test('E2E-04: authentication screenshots at three viewports (login + change-password)', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 800],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const outDir = fileURLToPath(new URL('../../artifacts/lab-03/screenshots/authentication', import.meta.url))

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    fs.mkdirSync(outDir, { recursive: true })

    // Login screenshot
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, `${name}.png`) })

    // Change-password screenshot (logged-in user navigating to /change-password)
    await page.getByLabel(/email/i).fill(ALICE)
    await page.getByLabel(/password/i).fill(E2E_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/tickets$/)
    await page.goto('/change-password')
    await expect(page.getByLabel(/current password/i)).toBeVisible()
    await page.screenshot({ path: path.join(outDir, `change-password-${name}.png`) })

    await context.close()
  }
})
