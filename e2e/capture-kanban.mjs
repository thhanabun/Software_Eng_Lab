import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/lab-03/evidence');

// Get project data via gh CLI (already authenticated)
const raw = execFileSync('gh', ['project', 'item-list', '1', '--owner', 'thhanabun', '--format', 'json', '--limit', '50'], { encoding: 'utf8' });
const data = JSON.parse(raw);

// Group by status
const grouped = {};
for (const item of data.items) {
  const status = item.status || '(no status)';
  if (!grouped[status]) grouped[status] = [];
  grouped[status].push(item);
}

// Build HTML
const columns = Object.entries(grouped).map(([status, items]) => {
  const cards = items.map(i => {
    const num = i.content?.number || '?';
    const title = i.content?.title || i.title;
    const isLab3 = num >= 29 && num <= 36;
    const border = isLab3 ? 'border-left: 4px solid #006B3C;' : 'border-left: 4px solid #ccc;';
    const badge = isLab3 ? '<span style="background:#006B3C;color:#fff;padding:1px 6px;border-radius:8px;font-size:11px;margin-left:6px;">Lab 3</span>' : '';
    return `<div style="background:#fff;border-radius:6px;padding:10px 12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.12);${border}">
      <div style="font-size:12px;color:#666;">#${num}${badge}</div>
      <div style="font-size:13px;font-weight:500;margin-top:2px;">${title}</div>
    </div>`;
  }).join('');
  return `<div style="min-width:260px;max-width:300px;flex:1;">
    <div style="font-weight:600;font-size:14px;padding:8px 0;color:#333;border-bottom:2px solid #006B3C;margin-bottom:10px;">
      ${status} <span style="color:#999;font-weight:400;">(${items.length})</span>
    </div>
    ${cards}
  </div>`;
}).join('');

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f6f8fa;padding:24px;}</style></head>
<body>
<div style="max-width:1400px;">
  <div style="font-size:20px;font-weight:700;margin-bottom:4px;">TokTickIT Individual Sprints</div>
  <div style="font-size:13px;color:#666;margin-bottom:20px;">GitHub Projects Kanban — All Lab 3 Issues (#29–#36) in Done</div>
  <div style="display:flex;gap:16px;overflow-x:auto;">
    ${columns}
  </div>
</div>
</body>
</html>`;

// Write temp HTML and screenshot
const tmpHtml = path.join(__dirname, '_kanban.html');
fs.writeFileSync(tmpHtml, html);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto('file:///' + tmpHtml.replace(/\\/g, '/'), { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'kanban-board.png'), fullPage: true });
console.log('saved: kanban-board.png');
await ctx.close();
await browser.close();
fs.unlinkSync(tmpHtml);
