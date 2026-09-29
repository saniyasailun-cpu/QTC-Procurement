import fs from 'node:fs';
import assert from 'node:assert/strict';

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const transactions = [...(data.recentTransactions || []), ...(data.historicalTransactions || [])];
const expectedUrl = 'https://docs.google.com/spreadsheets/d/1iVgKgCdQRCz4_Vo1mdmM38xJHQI4B5mzKx7aJ9oBKn0/edit?gid=543596522#gid=543596522';

assert.equal(data.config?.gsheetUrl, expectedUrl, 'wrong Google Sheet source');
assert.ok(transactions.length > 0, 'no transactions');
assert.ok(transactions.every(t => t.poNo || t.supplier), 'blank transaction imported');
assert.ok(transactions.every(t => Number(t.totalPrice) > 0), 'incomplete transaction imported');

for (const summary of data.monthlySummary || []) {
  const monthRows = transactions.filter(t => String(t.year) === '2026' && t.month === summary.month);
  const sourcePeriod = data.workbookSource?.periods.find(p => p.year === '2026' && p.month === summary.month);
  const purchase = sourcePeriod ? sourcePeriod.purchase : monthRows.reduce((sum, t) => sum + Number(t.totalPrice || 0), 0);
  const savings = monthRows.reduce((sum, t) => sum + Number(t.totalSaving || 0), 0);
  if (purchase === null) assert.equal(summary.pv2026, null, `${summary.month} missing purchase must stay unavailable`);
  else assert.ok(Math.abs(purchase - Number(summary.pv2026 || 0)) < 0.01, `${summary.month} purchase mismatch`);
  assert.ok(Math.abs(savings - Number(summary.cr2026 || 0)) < 0.01, `${summary.month} savings mismatch`);
}

const js = fs.readFileSync('data.js', 'utf8');
assert.deepEqual(JSON.parse(js.slice('window.KPI_DATA = '.length).replace(/;\s*$/, '')), data, 'data.js mismatch');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
assert.ok(app.includes(`const LIVE_SHEET_URL = '${expectedUrl}'`), 'public page source is not pinned to the real sheet');
assert.match(app, /if \(IS_GITHUB_PAGES\) return window\.syncGoogleSheetNow\(showFeedback\)/, 'public refresh still calls the backend');
assert.match(app, /if \(IS_GITHUB_PAGES\) \{[\s\S]*?Static fallback data failed:[\s\S]*?return;[\s\S]*?\/api\/data/, 'public initial load can still call the backend');
assert.match(app, /const saved = IS_GITHUB_PAGES \? null : localStorage\.getItem\('qtc_strategic_goals'\)/, 'public goals can still load local edits');
assert.match(html, /id="gsheet-quality-summary"/, 'data quality summary missing');
assert.match(html, /id="excel-dropzone"[\s\S]*?data-static-hide|data-static-hide[\s\S]*?id="excel-dropzone"/, 'public upload controls are not hidden');
assert.match(html, /id="target-rate-badge"[\s\S]*?data-static-hide|data-static-hide[\s\S]*?id="target-rate-badge"/, 'public target controls are not hidden');

const definedTokens = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]));
const usedTokens = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map(match => match[1]));
assert.deepEqual([...usedTokens].filter(token => !definedTokens.has(token)), [], 'undefined CSS design token');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion support missing');
assert.match(css, /:focus-visible/, 'keyboard focus style missing');
assert.match(html, /id="monthly-chart-summary"/, 'monthly chart text summary missing');
assert.match(html, /id="strategy-chart-summary"/, 'strategy chart text summary missing');
assert.match(html, /id="multi-year-chart-summary"/, 'multi-year chart text summary missing');
assert.match(app, /animation: chartAnimation/, 'monthly chart does not respect reduced motion');
assert.match(app, /มูลค่าสั่งซื้อ:.*formatCurrency\(row\.pv\)/, 'monthly chart exact purchase value missing');
assert.match(app, /t\.year === yr && selectedMonths\.includes\(t\.month\)/, 'multi-year chart ignores the selected month');
assert.match(app, /รวมช่วงที่เลือก/, 'monthly KPI table ignores the selected month');

console.log(`Data valid: ${transactions.length} transactions; source gid=543596522.`);
