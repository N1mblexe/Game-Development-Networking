// usage: node .scratch/shot.mjs <url> <id> <width> <theme> <out> [waitMs]
import { chromium } from '@playwright/test';
const [url, id, width, theme, out, wait = '2500', click] = process.argv.slice(2);
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
await pg.addInitScript((t) => { try { localStorage.setItem('netlearn-theme', t); } catch {} }, theme);
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url, { waitUntil: 'networkidle' });
if (id && id !== '-') {
  if (click) { await pg.locator('#' + id).evaluate((el) => el.scrollIntoView({ block: 'start' })); await pg.waitForTimeout(800); for (const c of click.split('|')) { if (c.startsWith('slider:')) { const [, name, n] = c.split(':'); const el = pg.locator('#' + id).getByLabel(name, { exact: true }); await el.focus(); for (let k = 0; k < Number(n); k++) await pg.keyboard.press(Number(n) > 0 ? 'ArrowRight' : 'ArrowLeft'); continue; } await pg.locator('#' + id).getByRole(c.startsWith('radio:') ? 'radio' : 'button', { name: c.replace(/^\w+:/, ''), exact: true }).first().click(); await pg.waitForTimeout(300); } }
  for (let k = 0; k < Number(wait) / 250; k++) {
    await pg.locator('#' + id).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await pg.waitForTimeout(250);
  }
  await pg.locator('#' + id).screenshot({ path: out });
} else {
  for (let y = 0; y < 30000; y += 600) { await pg.evaluate((yy) => window.scrollTo(0, yy), y); await pg.waitForTimeout(150); }
  await pg.waitForTimeout(Number(wait));
  await pg.screenshot({ path: out, fullPage: true });
}
const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
console.log('scrollWidth/clientWidth', sw, 'errors', errs);
await b.close();
