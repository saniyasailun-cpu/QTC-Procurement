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
  const purchase = monthRows.reduce((sum, t) => sum + Number(t.totalPrice || 0), 0);
  const savings = monthRows.reduce((sum, t) => sum + Number(t.totalSaving || 0), 0);
  assert.ok(Math.abs(purchase - Number(summary.pv2026 || 0)) < 0.01, `${summary.month} purchase mismatch`);
  assert.ok(Math.abs(savings - Number(summary.cr2026 || 0)) < 0.01, `${summary.month} savings mismatch`);
}

const js = fs.readFileSync('data.js', 'utf8');
assert.deepEqual(JSON.parse(js.slice('window.KPI_DATA = '.length).replace(/;\s*$/, '')), data, 'data.js mismatch');

console.log(`Data valid: ${transactions.length} transactions; source gid=543596522.`);
