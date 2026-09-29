import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let rows = [{ month: 'JAN', pv: 1000, cr: 80, target: 30 }];
const elements = new Map();
const canvas = { parentElement: { classList: { toggle() {} } } };
const context = vm.createContext({
  console, location: { hostname: 'test.github.io' },
  localStorage: { getItem: () => null },
  document: {
    addEventListener() {}, documentElement: {},
    getElementById(id) {
      if (id === 'monthlyTrendChart') return { getContext: () => ({ canvas }) };
      if (!['chart-actual-total', 'chart-target-total', 'chart-variance-total', 'chart-status-badge', 'monthly-chart-summary'].includes(id)) return null;
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    }
  },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  matchMedia: () => ({ matches: true }),
  Chart: class {
    static defaults = { animation: {}, elements: { line: {} } };
    constructor(ctx, config) { this.config = config; }
    destroy() {}
  },
  getRows: () => rows
});
context.window = context;
vm.runInContext(fs.readFileSync('app.js', 'utf8') + `
  getMonthlyAggregatedData = () => getRows();
  globalThis.api = { State, renderMonthlyTrendChart };
`, context);
const { State, renderMonthlyTrendChart } = context.api;
State.activeMonth = 'JAN';
for (const mode of ['bar', 'curve']) {
  State.chartMode = mode;
  renderMonthlyTrendChart();
  const config = State.charts.monthlyTrend.config;
  assert.equal(config.options.indexAxis, 'y');
  assert.equal(config.options.scales.x.beginAtZero, true);
  assert.ok(config.data.datasets.every(d => d.type === 'bar'));
  assert.equal(config.data.datasets[0].data[0], 80 / 1e6);
  assert.equal(config.data.datasets[1].data[0], 30 / 1e6);
}
rows[0] = { ...rows[0], cr: -20, missingPurchase: true };
renderMonthlyTrendChart();
assert.equal(State.charts.monthlyTrend.config.data.datasets[0].data[0], -20 / 1e6);
assert.equal(State.charts.monthlyTrend.config.data.datasets[1].data[0], null);
assert.equal(elements.get('chart-target-total').textContent, '—');
rows.push({ month: 'FEB', pv: 1000, cr: 50, target: 30 });
State.activeMonth = 'ALL';
State.chartMode = 'curve';
renderMonthlyTrendChart();
assert.equal(State.charts.monthlyTrend.config.type, 'line');
State.chartMode = 'bar';
renderMonthlyTrendChart();
assert.equal(State.charts.monthlyTrend.config.options.indexAxis, 'x');
assert.equal(State.charts.monthlyTrend.config.data.datasets[1].type, 'line');
console.log('Monthly chart checks passed');
