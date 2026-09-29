import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';

const context = vm.createContext({ console, location: { hostname: 'test.github.io' }, localStorage: { getItem: () => null }, document: { addEventListener() {}, getElementById: () => null } });
context.window = context;
vm.runInContext(fs.readFileSync('workbook-sync.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('app.js', 'utf8') + '\nglobalThis.api = {State, buildDatasetFromTransactions, getMonthlyAggregatedData, calculateGoalProgress};', context);
const { State, buildDatasetFromTransactions, getMonthlyAggregatedData, calculateGoalProgress } = context.api;
const workbook = XLSX.utils.book_new();
const add = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
const header = ['Year', 'Month', 'PO No.', 'Supplier', 'Description', 'Qty', 'Unit', 'Unit price', 'Purchase', 'Negotiated', 'Difference', 'Savings', 'Rate', 'Method', 'PIC'];
const row = [2026, 'JAN', 'PO25-001', 'Supplier', 'Part', 1, 'ea', 100, 100, 90, 10, 10, .1, 'Negotiate', 'PIC'];
add('Data', [header, row, row, [2026, 'SEP', 'PO26-002', 'Supplier', 'Part', 1, 'ea', 100, 100, 100, 0, 0, 0], [2026, 'SEP', 'PO26-incomplete', 'Supplier', '', '', '', '', '', '', '', -999]]);
add('Improve#1', [header.slice(1), row.slice(1), row.slice(1)]);
add('สรุป-รายเดือน', [['', '', '', '', '', '', '', '', '', '', '', 'Year', 2026], ['JAN', '', '', '', '', 900, 20], ['SEP', '', '', '', '', 0, -999]]);
add('มูลค่าซื้อ', [[2026, 'JAN', 1000]]);
add('Reference', [['not a transaction', 12345]]);
workbook.Sheets.Reference.B2 = { t: 'e', v: 7, w: '#DIV/0!' };
workbook.Sheets.Reference['!ref'] = 'A1:B2';
const source = context.QTCWorkbook.read(workbook, XLSX);
assert.equal(source.tabs.length, 5);
assert.equal(source.transactions.length, 3, 'preserve repeated master rows, exclude cross-tab duplicates');
assert.equal(source.tabs.find(t => t.name === 'Improve#1').duplicates, 2, 'master booking year wins');
assert.equal(source.excluded.length, 1);
assert.ok(source.issues.some(x => x.includes('#DIV/0!')));
assert.equal(source.tabs.find(t => t.name === 'Reference').rows[1].values[1], '#DIV/0!', 'source errors remain visible');
const built = buildDatasetFromTransactions(source.transactions, {}, source);
assert.equal(built.monthlySummary[0].pv2026, 1000);
assert.equal(built.monthlySummary[8].pv2026, null);
assert.equal(built.yearlySummary[0].percentSaving, null);
assert.equal(built.workbookSource.importedRows, 3);
State.data = { workbookSource: source };
State.transactions = source.transactions;
let monthly = getMonthlyAggregatedData();
assert.equal(monthly[0].pv, 1000, 'official purchase denominator');
assert.equal(monthly[0].cr, 20);
assert.equal(monthly[0].pct, .02);
assert.equal(monthly[8].cr, 0, 'zero savings is a valid record');
assert.equal(monthly[8].pct, null, 'missing denominator is not zero percent');
assert.equal(monthly[8].target, null);
assert.equal(monthly[8].missingPurchase, true);
assert.equal(calculateGoalProgress({ category: 'savings_rate', year: '2026', month: 'SEP', targetValue: 3 }).available, false);
assert.equal(calculateGoalProgress({ category: 'savings_rate', year: '2026', month: 'JAN', targetValue: 3 }).current, 2);
vm.runInContext('downloadCSV = (name, headers, rows) => { globalThis.csv = rows; };', context);
State.activeMonth = 'SEP';
context.exportMonthlyKPIToCSV();
assert.equal(context.csv.length, 2, 'CSV honors selected month');
assert.equal(context.csv[0][4], 'ไม่พร้อมคำนวณ');
const noPo = [...row];
noPo[2] = '';
workbook.Sheets.Data = XLSX.utils.aoa_to_sheet([header, noPo]);
workbook.Sheets['Improve#1'] = XLSX.utils.aoa_to_sheet([header.slice(1), noPo.slice(1)]);
const noPoSource = context.QTCWorkbook.read(workbook, XLSX);
assert.equal(noPoSource.transactions.length, 1, 'keep source amounts with known booking year even without a PO number');
assert.equal(noPoSource.tabs.find(t => t.name === 'Improve#1').duplicates, 1, 'deduplicate before trying to infer a missing booking year');
assert.ok(noPoSource.issues.some(issue => issue.includes('ไม่มีเลข PO')));

if (process.argv.includes('--live') || process.argv.includes('--refresh')) {
  const url = 'https://docs.google.com/spreadsheets/d/1iVgKgCdQRCz4_Vo1mdmM38xJHQI4B5mzKx7aJ9oBKn0/export?format=xlsx';
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `Workbook fetch: ${response.status}`);
  const live = context.QTCWorkbook.read(XLSX.read(await response.arrayBuffer()), XLSX);
  State.data = { workbookSource: live };
  State.transactions = live.transactions;
  for (const year of [...new Set(live.periods.map(p => p.year)), 'ALL']) {
    State.activeYear = year;
    monthly = getMonthlyAggregatedData();
    for (const month of monthly) {
      const periods = live.periods.filter(p => p.month === month.month && (year === 'ALL' || p.year === year));
      assert.ok(Math.abs(month.cr - periods.reduce((s,p) => s + p.savings, 0)) < .01);
      assert.ok(Math.abs(month.pv - periods.reduce((s,p) => s + (p.purchase ?? 0), 0)) < .01);
      assert.equal(month.pct === null, month.pv === 0 || periods.some(p => p.count > 0 && p.purchase === null));
      State.activeMonth = month.month;
      context.exportMonthlyKPIToCSV();
      assert.equal(context.csv.length, 2);
    }
  }
  if (process.argv.includes('--refresh')) {
    const old = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const dataset = buildDatasetFromTransactions(live.transactions, old.config, live);
    const json = JSON.stringify(dataset, null, 2);
    fs.writeFileSync('data.json', json + '\n');
    fs.writeFileSync('data.js', 'window.KPI_DATA = ' + JSON.stringify(dataset) + ';\n');
  }
  console.log(JSON.stringify({ tabs: live.tabs.map(t => ({name:t.name, imported:t.imported, duplicates:t.duplicates})), imported: live.transactions.length, excluded: live.excluded.length, issues: live.issues.length, september: live.periods.find(p => p.year === live.reportYear && p.month === 'SEP') }, null, 2));
}
console.log('Workbook checks passed: deduplication, booking year, missing/zero values, source errors, KPI goals, and filtered CSV.');
