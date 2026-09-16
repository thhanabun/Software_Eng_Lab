import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2eTest123!'
const ADMIN = 'e2e.admin@example.test'
const ALICE = 'e2e.alice@example.test'
const INITIAL_PASSWORD = 'E2eNewUser1!'
const RESET_PASSWORD = 'E2eReset123!'
const FINAL_PASSWORD = 'E2eFinal123!'

async function loginAs(page: Page, email: string, password = E2E_PASSWORD, home: RegExp = /\/tickets$/): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for the session round-trip before any direct goto, otherwise the
  // auth guard wins the race and bounces back to /login.
  await expect(page).toHaveURL(home)
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function searchUser(page: Page, query: string): Promise<void> {
  await page.getByLabel(/^search$/i).fill(query)
  await page.getByRole('button', { name: /apply search/i }).click()
}

test('E2E-03: create → edit → reset → forced change → safety rejections → non-admin 403 (AC-21..AC-25)', async ({
  page,
}) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const newName = `E2E New ${stamp}`
  const newEmail = `e2e.new.${stamp}@example.test`

  await loginAs(page, ADMIN, E2E_PASSWORD, /\/admin\/users$/)
  await expect(page).toHaveURL(/\/admin\/users$/)

  // Create with one role + initial password (AC-21).
  await page.getByRole('button', { name: 'Create user' }).click()
  const createDialog = page.getByRole('dialog')
  await createDialog.getByLabel(/^name/i).fill(newName)
  await createDialog.getByLabel(/^email/i).fill(newEmail)
  await createDialog.getByLabel(/^role/i).selectOption('REQUESTER')
  await createDialog.getByLabel(/initial password/i).fill(INITIAL_PASSWORD)
  await page.getByTestId('user-form-save').click()
  await expect(page.getByTestId('admin-notice')).toContainText(/must change/i)

  // Search finds the new account (ADM-05 in the browser).
  await searchUser(page, newEmail)
  const row = page.locator('tr', { hasText: newEmail })
  await expect(row).toBeVisible()

  // Edit name (AC-22 happy path).
  const editedName = `${newName} Edited`
  await page.getByRole('button', { name: `Edit ${newName}` }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.getByLabel(/^name/i).fill(editedName)
  await page.getByTestId('user-form-save').click()
  await expect(page.getByTestId('admin-notice')).toContainText(/updated/i)

  // Duplicate email is rejected with the field-level message and nothing changes (AC-22).
  await page.getByRole('button', { name: `Edit ${editedName}` }).click()
  const dupDialog = page.getByRole('dialog')
  await dupDialog.getByLabel(/^email/i).fill(ADMIN)
  await page.getByTestId('user-form-save').click()
  await expect(dupDialog.getByText('Email is already in use')).toBeVisible()
  await dupDialog.getByRole('button', { name: 'Cancel' }).click()

  // Reset password forces change at next login (AC-24).
  await page.getByRole('button', { name: `Set new password for ${editedName}` }).click()
  const resetDialog = page.getByRole('dialog')
  await resetDialog.getByLabel(/new initial password/i).fill(RESET_PASSWORD)
  await page.getByTestId('confirm-reset').click()
  await expect(page.getByTestId('admin-notice')).toContainText(/must change/i)

  // Self-deactivation is disabled with guidance (AC-23).
  await searchUser(page, ADMIN)
  await page.getByRole('button', { name: 'Edit E2E Admin' }).click()
  const selfDialog = page.getByRole('dialog')
  await expect(selfDialog.getByLabel('Active')).toBeDisabled()
  await expect(selfDialog.getByText(/cannot deactivate your own account/i)).toBeVisible()
  await selfDialog.getByRole('button', { name: 'Cancel' }).click()

  await logout(page)

  // Fresh initial password triggers the forced flow and lands on the role home.
  await loginAs(page, newEmail, RESET_PASSWORD, /\/change-password$/)
  await expect(page).toHaveURL(/\/change-password$/)
  await page.getByLabel(/current password/i).fill(RESET_PASSWORD)
  await page.getByLabel(/^new password/i).fill(FINAL_PASSWORD)
  await page.getByLabel(/confirm new password/i).fill(FINAL_PASSWORD)
  await page.getByRole('button', { name: /save new password/i }).click()
  await expect(page).toHaveURL(/\/tickets$/)

  await logout(page)

  // Non-admin callers get the safe forbidden panel with no user data (AC-25).
  await loginAs(page, ALICE, E2E_PASSWORD, /\/tickets$/)
  await page.goto('/admin/users')
  await expect(page.getByTestId('forbidden-panel')).toBeVisible()
  await expect(page.getByTestId('forbidden-panel')).toContainText(/access denied/i)
})

test('E2E-04: user management screenshots at three viewports', async ({ browser }) => {
  const viewports: [string, number, number][] = [
    ['desktop', 1280, 800],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]
  const outDir = fileURLToPath(
    new URL('../../artifacts/lab-03/screenshots/user-management', import.meta.url),
  )

  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await loginAs(page, ADMIN, E2E_PASSWORD, /\/admin\/users$/)
    await expect(page.getByRole('button', { name: 'Create user' })).toBeVisible({
      timeout: 15_000,
    })
    fs.mkdirSync(outDir, { recursive: true })
    await page.screenshot({ path: path.join(outDir, `${name}.png`) })
    await context.close()
  }
})
