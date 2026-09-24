import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/lab-03/evidence');
const BASE = 'http://localhost:5173';
const E2E_PASSWORD = 'E2eTest123!';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet',  width: 820,  height: 1180 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const USERS = {
  admin:     'e2e.admin@example.test',
  staff:     'e2e.staff@example.test',
  requester: 'e2e.alice@example.test',
  inactive:  'e2e.inactive@example.test',
};

async function screenshot(page, name, fullPage = false) {
  const filePath = path.join(OUT, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage });
  console.log(`  saved: ${name}`);
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name.toUpperCase()} (${vp.width}x${vp.height}) ===`);

    // --- Login (fresh context) ---
    let ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    let page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await screenshot(page, `login-${vp.name}.png`);
    await ctx.close();

    // --- Login Error ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.requester);
    await page.getByLabel(/password/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForSelector('[data-testid="login-error"]', { timeout: 8000 });
    await page.waitForTimeout(300);
    await screenshot(page, `login-error-${vp.name}.png`);
    await ctx.close();

    // --- Login Deactivated ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.inactive);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForSelector('[data-testid="login-error"]', { timeout: 8000 });
    await page.waitForTimeout(300);
    await screenshot(page, `login-deactivated-${vp.name}.png`);
    await ctx.close();

    // --- Change Password (login as requester, then navigate) ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.requester);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/tickets$/, { timeout: 15000 });
    await page.goto(`${BASE}/change-password`);
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await screenshot(page, `change-password-${vp.name}.png`);
    await ctx.close();

    // --- Shell Admin ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.admin);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/users$/, { timeout: 15000 });
    await page.waitForTimeout(500);
    await screenshot(page, `shell-admin-${vp.name}.png`);
    await ctx.close();

    // --- Shell Staff ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.staff);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/staff\/tickets$/, { timeout: 15000 });
    await page.waitForTimeout(500);
    await screenshot(page, `shell-staff-${vp.name}.png`);
    await ctx.close();

    // --- Shell Requester ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.requester);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/tickets$/, { timeout: 15000 });
    await page.waitForTimeout(500);
    await screenshot(page, `shell-requester-${vp.name}.png`);
    await ctx.close();

    // --- Staff Queue ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.staff);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/staff\/tickets$/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, `staff-queue-${vp.name}.png`);
    await ctx.close();

    // --- Staff Detail ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.staff);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/staff\/tickets$/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    const firstOpen = page.getByRole('link', { name: 'Open' }).first();
    if (await firstOpen.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstOpen.click();
      await page.waitForSelector('[data-testid="detail-ticket-number"]', { timeout: 10000 });
      await page.waitForTimeout(500);
      await screenshot(page, `staff-detail-${vp.name}.png`, true);
    } else {
      console.log(`  SKIP staff-detail-${vp.name}: no open tickets`);
    }
    await ctx.close();

    // --- User Management ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.admin);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/users$/, { timeout: 15000 });
    await page.waitForSelector('button:has-text("Create user")', { timeout: 10000 });
    await screenshot(page, `user-mgmt-${vp.name}.png`);
    await ctx.close();

    // --- Create User dialog ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.admin);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/users$/, { timeout: 15000 });
    await page.waitForSelector('button:has-text("Create user")', { timeout: 10000 });
    await page.getByRole('button', { name: 'Create user' }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await screenshot(page, `create-user-${vp.name}.png`);
    await ctx.close();

    // --- Edit User dialog ---
    ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('button:has-text("Sign in")');
    await page.getByLabel(/email/i).fill(USERS.admin);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/users$/, { timeout: 15000 });
    await page.waitForSelector('button:has-text("Create user")', { timeout: 10000 });
    const editBtn = page.locator('button[aria-label^="Edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.evaluate(btn => btn.click());
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.waitForTimeout(300);
      await screenshot(page, `edit-user-${vp.name}.png`);
    } else {
      console.log(`  SKIP edit-user-${vp.name}: no edit button`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\nDone! All screenshots saved to docs/lab-03/evidence/');
}

main().catch((e) => { console.error(e); process.exit(1); });
