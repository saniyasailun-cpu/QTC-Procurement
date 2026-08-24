/**
 * ==========================================================================
 * ระบบแดชบอร์ดติดตาม KPI การลดต้นทุนจัดซื้อและส่วนลดซัพพลายเออร์
 * Procurement KPI & Supplier Discount Management Engine (Dynamic & Responsive)
 * ==========================================================================
 */

// สถานะการทำงานของระบบ (Application Global State)
const State = {
  data: null,
  activeYear: '2026',
  activeQuarter: 'ALL',
  activeView: 'dashboard',
  chartMode: 'bar', // 'bar' | 'curve'
  theme: localStorage.getItem('app-theme') || 'dark',
  targetRate: parseFloat(localStorage.getItem('qtc_target_rate') || '3.0') / 100,
  
  // รายการเป้าหมายเชิงกลยุทธ์ (Strategic Goals)
  goals: [],
  goalFilterCategory: 'ALL',
  
  // ตารางรายการสั่งซื้อ
  transactions: [],
  filteredTransactions: [],
  tablePage: 1,
  pageSize: 15,
  sortKey: 'totalSaving',
  sortAsc: false,
  filters: {
    search: '',
    month: 'ALL',
    pic: 'ALL',
    strategy: 'ALL'
  },
  
  // อินสแตนซ์ Chart.js
  charts: {
    monthlyTrend: null,
    strategyDonut: null,
    multiYear: null
  }
};

// ข้อมูลเดือนและไตรมาส
const MONTH_ORDER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const QUARTER_MONTHS = {
  'Q1': ['JAN', 'FEB', 'MAR'],
  'Q2': ['APR', 'MAY', 'JUN'],
  'Q3': ['JUL', 'AUG', 'SEP'],
  'Q4': ['OCT', 'NOV', 'DEC']
};

const THAI_MONTHS = {
  'JAN': 'มกราคม', 'FEB': 'กุมภาพันธ์', 'MAR': 'มีนาคม',
  'APR': 'เมษายน', 'MAY': 'พฤษภาคม', 'JUN': 'มิถุนายน',
  'JUL': 'กรกฎาคม', 'AUG': 'สิงหาคม', 'SEP': 'กันยายน',
  'OCT': 'ตุลาคม', 'NOV': 'พฤศจิกายน', 'DEC': 'ธันวาคม'
};

const THAI_MONTHS_SHORT = {
  'JAN': 'ม.ค.', 'FEB': 'ก.พ.', 'MAR': 'มี.ค.',
  'APR': 'เม.ย.', 'MAY': 'พ.ค.', 'JUN': 'มิ.ย.',
  'JUL': 'ก.ค.', 'AUG': 'ส.ค.', 'SEP': 'ก.ย.',
  'OCT': 'ต.ค.', 'NOV': 'พ.ย.', 'DEC': 'ธ.ค.'
};

const PIC_KEYS = ['Pawina', 'Tanida', 'Yuwanit', 'Dusit', 'Saniya'];

// ใช้ชื่อตาม Sheet ตรง 100% โดยไม่แปลชื่อหรือกลยุทธ์
const THAI_PIC_NAMES = {
  'Pawina': 'Pawina',
  'Tanida': 'Tanida',
  'Yuwanit': 'Yuwanit',
  'Dusit': 'Dusit',
  'Saniya': 'Saniya'
};

const THAI_STRATEGIES = {
  'Compare + Negotiate': 'Compare + Negotiate',
  'Negotiate': 'Negotiate',
  'Avoidance': 'Avoidance',
  'Rebate': 'Rebate',
  'เพิ่มเครดิต': 'เพิ่มเครดิต'
};

// เริ่มต้นการทำงานเมื่อโหลดหน้าเสร็จ
document.addEventListener('DOMContentLoaded', () => {
  // โหลดเป้าหมายที่บันทึกไว้
  const savedRate = localStorage.getItem('qtc_target_rate');
  const rateInput = document.getElementById('target-rate-input');
  if (savedRate) {
    const parsed = parseFloat(savedRate);
    if (!isNaN(parsed) && parsed > 0) {
      State.targetRate = parsed / 100;
      if (rateInput) rateInput.value = savedRate;
      updateTargetBadge(parsed);
    }
  }

  initTheme();
  initGoals();
  loadData();
  initNavigation();
  initFilterPills();
  initTableEvents();
  initSupplierEvents();
  initSimulators();
  initDropzone();
  initGoogleSheetSync();

  // ปิด Modal ด้วยปุ่ม ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTxModal();
  });
});

// จัดการธีม
function initTheme() {
  document.documentElement.setAttribute('data-theme', State.theme);
  updateThemeIcons();
  
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      State.theme = State.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', State.theme);
      localStorage.setItem('app-theme', State.theme);
      updateThemeIcons();
      updateChartsTheme();
    });
  }
}

function updateThemeIcons() {
  const moon = document.getElementById('theme-moon-icon');
  const sun = document.getElementById('theme-sun-icon');
  if (moon && sun) {
    if (State.theme === 'dark') {
      moon.style.display = 'block';
      sun.style.display = 'none';
    } else {
      moon.style.display = 'none';
      sun.style.display = 'block';
    }
  }
}

// โหลดข้อมูล
function loadData() {
  if (window.KPI_DATA) {
    State.data = window.KPI_DATA;
    setupDataset();
    renderAllViews();
  }
}

function setupDataset() {
  if (!State.data) return;
  
  const recent = State.data.recentTransactions || [];
  const historical = State.data.historicalTransactions || [];
  
  State.transactions = [...recent, ...historical].map((item, idx) => {
    // ใช้คอลัมน์ Method เป็นกลยุทธ์หลัก และเก็บข้อความหมายเหตุสีแดงไว้ใน remark
    const officialMethod = (item.method || item.strategy || 'Negotiate').trim();
    const remarkNote = (item.strategy && item.strategy !== officialMethod) ? item.strategy.trim() : '';

    return {
      ...item,
      globalId: item.id || `rec-${idx}`,
      year: String(item.year || '2026'),
      month: String(item.month || 'JAN').toUpperCase(),
      totalPrice: Number(item.totalPrice) || 0,
      totalSaving: Number(item.totalSaving) || 0,
      percentDiscount: Number(item.percentDiscount) || 0,
      qty: Number(item.qty) || 0,
      pic: (item.pic || 'ไม่ระบุ').trim(),
      strategy: officialMethod,
      remark: remarkNote
    };
  });

  filterTransactions();
}

// ระบบสลับเมนู
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(item.getAttribute('data-view'));
    });
  });

  const mobileToggle = document.getElementById('mobile-toggle');
  const sidebar = document.getElementById('sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

function switchView(viewName) {
  State.activeView = viewName;
  
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-view') === viewName);
  });

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  const titles = {
    'dashboard': { title: 'ภาพรวมผู้บริหาร', desc: 'สรุปผลการต่อรองลดต้นทุนจัดซื้อและติดตามผลการดำเนินงานตามเป้าหมาย' },
    'goals': { title: 'เป้าหมาย & แผนยุทธศาสตร์ (Goals & Targets)', desc: 'กำหนดและติดตามเป้าหมายการลดต้นทุนจัดซื้อประจำปีและรายบุคคล' },
    'kpi-tracking': { title: 'สรุปผล KPI รายเดือน & รายปี', desc: 'เปรียบเทียบผลการประหยัดต้นทุนเทียบเป้าหมาย 3.0% ประจำปี' },
    'transactions': { title: 'รายการสั่งซื้อ & ส่วนลด (PO Data)', desc: 'ค้นหาและตรวจสอบรายการสั่งซื้อกว่า 5,800+ รายการ' },
    'suppliers': { title: 'การวิเคราะห์ข้อมูลคู่ค้า (ซัพพลายเออร์)', desc: 'สรุปยอดสั่งซื้อและมูลค่าส่วนลดที่ได้รับจากคู่ค้าแต่ละราย' },
    'pic-team': { title: 'สรุปผลงานทีมจัดซื้อรายบุคคล', desc: 'สถิติและกลยุทธ์การต่อรองของเจ้าหน้าที่จัดซื้อแต่ละท่าน' },
    'simulators': { title: 'โปรแกรมคำนวณ Kaizen & ขยายเครดิตเทอม', desc: 'เครื่องมือจำลองผลประหยัดเวลาและผลประโยชน์ทางการเงิน' },
    'data-import': { title: 'จัดการไฟล์ข้อมูล Excel', desc: 'อัปโหลดไฟล์ Excel (.xlsx) ชุดใหม่ หรือดาวน์โหลดข้อมูล' }
  };

  const current = titles[viewName] || titles['dashboard'];
  document.getElementById('current-view-title').textContent = current.title;
  document.getElementById('current-view-desc').textContent = current.desc;

  setTimeout(() => {
    if (viewName === 'dashboard') {
      renderMonthlyTrendChart();
      renderStrategyDonutChart(getActiveScopeTransactions());
    } else if (viewName === 'kpi-tracking') {
      renderMultiYearChart();
    }
  }, 60);

  document.getElementById('sidebar')?.classList.remove('open');
}

// ตัวกรองเลือกปีและไตรมาส
function initFilterPills() {
  document.querySelectorAll('#year-filter-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#year-filter-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeYear = btn.getAttribute('data-year');
      renderAllViews();
    });
  });

  document.querySelectorAll('#quarter-filter-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quarter-filter-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeQuarter = btn.getAttribute('data-quarter');
      renderAllViews();
    });
  });
}

// ดึงรายการสั่งซื้อที่กรองตามปีและไตรมาสที่เลือก
function getActiveScopeTransactions() {
  let list = State.transactions;
  if (State.activeYear !== 'ALL') {
    list = list.filter(t => t.year === State.activeYear);
  }
  if (State.activeQuarter !== 'ALL') {
    const allowedMonths = QUARTER_MONTHS[State.activeQuarter] || [];
    list = list.filter(t => allowedMonths.includes(t.month));
  }
  return list;
}

// คำนวณสรุปรายเดือนแบบไดนามิกสำหรับปีที่เลือก
function getMonthlyAggregatedData() {
  const isAllYears = State.activeYear === 'ALL';
  const yearTxs = isAllYears 
    ? State.transactions 
    : State.transactions.filter(t => t.year === State.activeYear);

  const monthMap = {};
  MONTH_ORDER.forEach(m => {
    monthMap[m] = { month: m, purchase: 0, savings: 0, count: 0, creditSaving: 0 };
  });

  yearTxs.forEach(t => {
    const m = (t.month || 'JAN').toUpperCase();
    if (monthMap[m]) {
      monthMap[m].purchase += (Number(t.totalPrice) || 0);
      monthMap[m].savings += (Number(t.totalSaving) || 0);
      monthMap[m].count += 1;
      if (t.strategy && t.strategy.includes('เครดิต')) {
        monthMap[m].creditSaving += (Number(t.totalSaving) || 0);
      }
    }
  });

  // ถ้าเป็นปี 2026 ให้นำค่ามูลค่าจัดซื้อและผลประหยัดรวมอย่างเป็นทางการจาก monthlySummary มาใช้
  if (State.activeYear === '2026' && State.data?.monthlySummary) {
    State.data.monthlySummary.forEach(ms => {
      const m = (ms.month || '').toUpperCase();
      if (monthMap[m]) {
        if (ms.creditSaving > 0) monthMap[m].creditSaving = ms.creditSaving;
        if (ms.pv2026 > 0) {
          monthMap[m].purchase = ms.pv2026;
        }
        if (ms.cr2026 !== undefined && ms.cr2026 !== 0) {
          monthMap[m].savings = ms.cr2026;
        }
      }
    });
  } else if (!isAllYears && State.data?.purchaseHistory) {
    const phList = State.data.purchaseHistory.filter(ph => ph.year === State.activeYear);
    phList.forEach(ph => {
      const m = (ph.month || '').toUpperCase();
      if (monthMap[m] && ph.purchaseValue > 0) {
        monthMap[m].purchase = ph.purchaseValue;
      }
    });
  }

  return MONTH_ORDER.map(m => {
    const item = monthMap[m];
    const rate = State.targetRate || 0.03;
    const target = item.purchase * rate;
    const actualRate = item.purchase > 0 ? (item.savings / item.purchase) : 0;
    const isPassed = actualRate >= rate;
    return {
      month: m,
      pv: item.purchase,
      cr: item.savings,
      target: target,
      pct: actualRate,
      isPassed: isPassed,
      count: item.count,
      creditSaving: item.creditSaving
    };
  });
}

// เรนเดอร์หน้าจอทั้งหมด
function renderAllViews() {
  renderExecutiveDashboard();
  renderGoalsWidget();
  renderMonthlyKPITracking();
  renderSuppliersView();
  renderPICLeaderboard();
  filterTransactions();
  renderTransactionTable();
}

// รูปแบบตัวเลขและสกุลเงิน
function formatCurrency(num, decimals = 2) {
  if (isNaN(num) || num === null) return '฿0.00';
  return '฿' + Number(num).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatNumber(num, decimals = 0) {
  if (isNaN(num) || num === null) return '0';
  return Number(num).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(num, decimals = 2) {
  if (isNaN(num) || num === null) return '0.00%';
  return (Number(num) * 100).toFixed(decimals) + '%';
}

function animateValue(id, endValue, isCurrency = true, decimals = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const duration = 500;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - (1 - progress) * (1 - progress);
    const currentVal = start + (endValue - start) * easeProgress;

    if (isCurrency) el.textContent = formatCurrency(currentVal, decimals);
    else el.textContent = (currentVal * 100).toFixed(decimals) + '%';

    if (progress < 1) requestAnimationFrame(update);
    else {
      if (isCurrency) el.textContent = formatCurrency(endValue, decimals);
      else el.textContent = (endValue * 100).toFixed(decimals) + '%';
    }
  }

  requestAnimationFrame(update);
}

// -------------------------------------------------------------
// 1. ภาพรวมผู้บริหาร (DASHBOARD)
// -------------------------------------------------------------
function renderExecutiveDashboard() {
  const scopedTxs = getActiveScopeTransactions();
  
  let totalSavings = 0;
  let totalPurchase = 0;
  const poCount = scopedTxs.length;

  scopedTxs.forEach(t => {
    totalPurchase += t.totalPrice;
    totalSavings += t.totalSaving;
  });

  const monthlyAgg = getMonthlyAggregatedData();
  let totalCreditSavings = monthlyAgg.reduce((sum, m) => sum + (m.creditSaving || 0), 0);
  if (totalCreditSavings === 0 && (State.activeYear === '2026' || State.activeYear === 'ALL')) {
    totalCreditSavings = 85669.64;
  }

  const savingRate = totalPurchase > 0 ? (totalSavings / totalPurchase) : 0;
  const targetRate = State.targetRate || 0.03;
  const isMet = savingRate >= targetRate;

  animateValue('kpi-total-savings', totalSavings, true, 2);
  animateValue('kpi-total-purchase', totalPurchase, true, 2);

  document.getElementById('kpi-savings-mb').textContent = `${(totalSavings / 1000000).toFixed(2)} ล้านบาท`;
  document.getElementById('kpi-savings-rate').textContent = `+${(savingRate * 100).toFixed(2)}% ประหยัดได้`;

  document.getElementById('kpi-purchase-mb').textContent = `${(totalPurchase / 1000000).toFixed(2)} ล้านบาท`;
  document.getElementById('kpi-po-count').textContent = `${formatNumber(poCount)} รายการ`;

  const targetPctDisplay = document.getElementById('kpi-target-pct');
  const targetRateDisplay = document.getElementById('kpi-target-rate-display');
  const targetBadge = document.getElementById('kpi-target-badge');
  const targetDiff = document.getElementById('kpi-target-diff');
  const gaugeFill = document.getElementById('kpi-gauge-fill');

  const targetCardTitle = document.querySelector('#view-dashboard .accent-glow-orange .kpi-card-title');
  if (targetCardTitle) {
    targetCardTitle.textContent = `สถานะเป้าหมาย KPI (${(targetRate * 100).toFixed(2)}%)`;
  }

  targetPctDisplay.textContent = (savingRate * 100).toFixed(1) + '%';
  targetRateDisplay.textContent = (savingRate * 100).toFixed(2) + '%';

  const pctOfTarget = Math.min((savingRate / targetRate) * 100, 100);
  if (gaugeFill) {
    gaugeFill.setAttribute('stroke-dasharray', `${pctOfTarget}, 100`);
    gaugeFill.style.stroke = isMet ? 'var(--accent-emerald)' : 'var(--accent-rose)';
  }

  if (isMet) {
    targetBadge.className = 'kpi-badge success';
    targetBadge.textContent = 'ได้ตามเป้าหมาย (Passed)';
    targetDiff.textContent = `+${((savingRate - targetRate) * 100).toFixed(2)}% สูงกว่าเป้าหมาย (${(targetRate * 100).toFixed(1)}%)`;
  } else {
    targetBadge.className = 'kpi-badge danger';
    targetBadge.textContent = 'ต่ำกว่าเป้าหมาย';
    targetDiff.textContent = `${((savingRate - targetRate) * 100).toFixed(2)}% ต่ำกว่าเป้าหมาย (${(targetRate * 100).toFixed(1)}%)`;
  }

  document.getElementById('kpi-credit-savings').textContent = formatCurrency(totalCreditSavings);

  renderMonthlyTrendChart();
  renderStrategyDonutChart(scopedTxs);
  renderCompactPICList(scopedTxs);
  renderCompactTopSuppliers(scopedTxs);
}

window.setChartMode = function(mode) {
  State.chartMode = mode;
  document.getElementById('btn-chart-bar')?.classList.toggle('active', mode === 'bar');
  document.getElementById('btn-chart-curve')?.classList.toggle('active', mode === 'curve');
  renderMonthlyTrendChart();
};

function renderMonthlyTrendChart() {
  const ctx = document.getElementById('monthlyTrendChart')?.getContext('2d');
  if (!ctx) return;

  const rawMonthlyAgg = getMonthlyAggregatedData();
  const isQuarterFiltered = State.activeQuarter !== 'ALL';
  const targetMonths = isQuarterFiltered 
    ? (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER)
    : MONTH_ORDER;

  const monthlyAgg = isQuarterFiltered 
    ? rawMonthlyAgg.filter(r => targetMonths.includes(r.month))
    : rawMonthlyAgg;

  const monthLabelsThai = monthlyAgg.map(r => THAI_MONTHS_SHORT[r.month] || r.month);

  if (State.charts.monthlyTrend) {
    State.charts.monthlyTrend.destroy();
  }

  const isDark = State.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  if (State.chartMode === 'bar') {
    const purchaseValuesMB = monthlyAgg.map(r => (r.pv > 0 ? Number((r.pv / 1000000).toFixed(2)) : null));
    const costReductionMB = monthlyAgg.map(r => {
      if (r.pv === 0 && r.cr === 0) return null;
      return Number((r.cr / 1000000).toFixed(2));
    });
    const targetSavingsMB = monthlyAgg.map(r => (r.pv > 0 ? Number((r.target / 1000000).toFixed(2)) : null));
    const rawCostReduction = monthlyAgg.map(r => Number((r.cr / 1000000).toFixed(2)));

    const validSavings = costReductionMB.filter(v => v !== null);
    const minSaving = validSavings.length > 0 ? Math.min(...validSavings) : 0;

    State.charts.monthlyTrend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthLabelsThai,
        datasets: [
          {
            type: 'bar',
            label: 'มูลค่าสั่งซื้อ (ล้านบาท)',
            data: purchaseValuesMB,
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(2, 132, 199, 0.18)',
            borderColor: isDark ? '#38bdf8' : '#0284c7',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'y',
            order: 3
          },
          {
            type: 'line',
            label: 'มูลค่าต่อรองได้จริง (ล้านบาท)',
            data: costReductionMB,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 3,
            pointRadius: costReductionMB.map(val => val === null ? 0 : 5),
            pointHoverRadius: 7,
            pointBackgroundColor: costReductionMB.map(val => (val !== null && val < 0) ? '#f43f5e' : '#10b981'),
            pointBorderColor: isDark ? '#0f172a' : '#ffffff',
            pointBorderWidth: 1.5,
            tension: 0.25,
            spanGaps: false,
            yAxisID: 'y1',
            order: 1
          },
          {
            type: 'line',
            label: `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}% (ล้านบาท)`,
            data: targetSavingsMB,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: targetSavingsMB.map(val => val === null ? 0 : 3.5),
            pointBackgroundColor: '#f59e0b',
            spanGaps: false,
            yAxisID: 'y1',
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '500' },
              boxWidth: 14,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                const m = monthlyAgg[idx]?.month;
                return `${THAI_MONTHS[m] || m} (${State.activeYear === 'ALL' ? 'ทุกปี' : State.activeYear})`;
              },
              label: (c) => {
                const idx = c.dataIndex;
                if (c.dataset.label.includes('ต่อรองได้')) {
                  const rawVal = rawCostReduction[idx];
                  if (rawVal < 0) return ` มูลค่าต่อรองได้จริง: ปรับปรุงรายการ -฿${Math.abs(rawVal)} ล้านบาท`;
                  if (purchaseValuesMB[idx] === null && rawVal === 0) return ` มูลค่าต่อรองได้จริง: ยังไม่มีข้อมูล`;
                  return ` มูลค่าต่อรองได้จริง: ฿${rawVal} ล้านบาท`;
                }
                if (c.raw === null || c.raw === undefined) return ` ${c.dataset.label}: ยังไม่มีข้อมูล`;
                return ` ${c.dataset.label}: ฿${c.raw} ล้านบาท`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { family: 'Prompt', size: 11 } },
            grid: { display: false }
          },
          y: {
            type: 'linear',
            position: 'left',
            suggestedMin: 0,
            title: {
              display: true,
              text: 'มูลค่าสั่งซื้อ (ล้านบาท)',
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '600' }
            },
            ticks: {
              color: textColor,
              callback: (val) => `${val}M`
            },
            grid: { color: gridColor }
          },
          y1: {
            type: 'linear',
            position: 'right',
            suggestedMin: minSaving < 0 ? minSaving * 1.3 : 0,
            title: {
              display: true,
              text: `ต่อรองได้ / เป้าหมาย ${(State.targetRate * 100).toFixed(1)}% (ล้านบาท)`,
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '600' }
            },
            ticks: {
              color: textColor,
              callback: (val) => `${val}M`
            },
            grid: { display: false }
          }
        }
      }
    });

  } else {
    let cumActual = 0;
    let cumTarget = 0;
    let lastActiveIndex = -1;

    monthlyAgg.forEach((r, idx) => {
      if (r.pv > 0 || r.cr !== 0) {
        lastActiveIndex = idx;
      }
    });

    const actualCumulative = [];
    const targetCumulative = [];

    monthlyAgg.forEach((r, idx) => {
      if (idx <= lastActiveIndex) {
        cumActual += r.cr;
        actualCumulative.push(Number((cumActual / 1000000).toFixed(2)));
      } else {
        actualCumulative.push(null);
      }

      if (r.pv > 0 || idx <= lastActiveIndex) {
        cumTarget += r.target;
        targetCumulative.push(Number((cumTarget / 1000000).toFixed(2)));
      } else {
        targetCumulative.push(null);
      }
    });

    State.charts.monthlyTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: monthLabelsThai,
        datasets: [
          {
            label: 'ยอดลดต้นทุนสะสมจริง (ล้านบาท)',
            data: actualCumulative,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: actualCumulative.map(val => val === null ? 0 : 5),
            pointHoverRadius: 7,
            pointBackgroundColor: '#10b981',
            pointBorderColor: isDark ? '#0f172a' : '#ffffff',
            pointBorderWidth: 1.5,
            spanGaps: false
          },
          {
            label: `เป้าหมายสะสม ${(State.targetRate * 100).toFixed(1)}% (ล้านบาท)`,
            data: targetCumulative,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: targetCumulative.map(val => val === null ? 0 : 3.5),
            pointBackgroundColor: '#f59e0b',
            fill: false,
            spanGaps: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '500' },
              boxWidth: 14,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                const m = monthlyAgg[idx]?.month;
                return `${THAI_MONTHS[m] || m} (${State.activeYear === 'ALL' ? 'ทุกปี' : State.activeYear})`;
              },
              label: (c) => {
                if (c.raw === null || c.raw === undefined) return ` ${c.dataset.label}: ยังไม่มีข้อมูล`;
                return ` ${c.dataset.label}: ฿${c.raw} ล้านบาท`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { family: 'Prompt', size: 11 } },
            grid: { color: gridColor }
          },
          y: {
            title: {
              display: true,
              text: 'มูลค่าสะสม (ล้านบาท)',
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '600' }
            },
            ticks: {
              color: textColor,
              callback: (val) => `${val}M`
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }
}

function renderStrategyDonutChart(scopedTxs) {
  const ctx = document.getElementById('strategyDonutChart')?.getContext('2d');
  if (!ctx) return;

  const stratMap = {};
  scopedTxs.forEach(t => {
    const s = t.strategy || 'Negotiate';
    stratMap[s] = (stratMap[s] || 0) + t.totalSaving;
  });

  const sortedKeys = Object.keys(stratMap).sort((a, b) => stratMap[b] - stratMap[a]);
  const labels = sortedKeys.map(k => THAI_STRATEGIES[k] || k);
  const dataValues = sortedKeys.map(k => stratMap[k]);

  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

  if (State.charts.strategyDonut) {
    State.charts.strategyDonut.destroy();
  }

  State.charts.strategyDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: State.theme === 'dark' ? '#131b26' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.label}: ฿${Number(c.raw).toLocaleString('th-TH', {maximumFractionDigits: 0})} บาท`
          }
        }
      }
    }
  });

  const total = dataValues.reduce((a, b) => a + b, 0) || 1;
  const listEl = document.getElementById('strategy-breakdown-list');
  if (listEl) {
    listEl.innerHTML = sortedKeys.map((k, idx) => {
      const amt = stratMap[k];
      const pct = ((amt / total) * 100).toFixed(1);
      const nameThai = THAI_STRATEGIES[k] || k;
      return `
        <div class="strat-item">
          <div class="strat-item-left">
            <span class="strat-dot" style="background: ${colors[idx % colors.length]};"></span>
            <span class="strat-name">${nameThai}</span>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div class="strat-val">${formatCurrency(amt, 0)}</div>
            <span style="font-size: 10px; color: var(--text-muted);">${pct}%</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderCompactPICList(scopedTxs) {
  const container = document.getElementById('pic-overview-list');
  if (!container) return;

  const picMap = {};
  scopedTxs.forEach(t => {
    const pic = t.pic || 'ไม่ระบุ';
    if (!picMap[pic]) picMap[pic] = { savings: 0, count: 0 };
    picMap[pic].savings += t.totalSaving;
    picMap[pic].count += 1;
  });

  const sorted = Object.keys(picMap).sort((a, b) => picMap[b].savings - picMap[a].savings);
  const totalTeamSavings = sorted.reduce((acc, p) => acc + picMap[p].savings, 0) || 1;

  container.innerHTML = sorted.map((p, idx) => {
    const share = ((picMap[p].savings / totalTeamSavings) * 100).toFixed(1);
    const thaiName = THAI_PIC_NAMES[p] || p;
    return `
      <div class="pic-compact-row">
        <div class="pic-compact-meta">
          <span class="rank-badge">#${idx + 1}</span>
          <div class="pic-title-box">
            <div class="name">${thaiName}</div>
            <div class="sub">${picMap[p].count} รายการ</div>
          </div>
        </div>
        <div class="pic-savings-box">
          <div class="amount">${formatCurrency(picMap[p].savings, 0)}</div>
          <div class="share">สัดส่วน ${share}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCompactTopSuppliers(scopedTxs) {
  const container = document.getElementById('top-suppliers-list');
  if (!container) return;

  const supMap = {};
  scopedTxs.forEach(t => {
    const s = t.supplier || 'ไม่ระบุ';
    if (!supMap[s]) supMap[s] = { savings: 0, count: 0, purchase: 0 };
    supMap[s].savings += t.totalSaving;
    supMap[s].purchase += t.totalPrice;
    supMap[s].count += 1;
  });

  const top5 = Object.keys(supMap).sort((a, b) => supMap[b].savings - supMap[a].savings).slice(0, 5);

  container.innerHTML = top5.map((s, idx) => {
    const avgDisc = supMap[s].purchase > 0 ? (supMap[s].savings / supMap[s].purchase) : 0;
    return `
      <div class="pic-compact-row">
        <div class="pic-compact-meta">
          <span class="rank-badge">#${idx + 1}</span>
          <div class="pic-title-box">
            <div class="name" title="${s}">${s}</div>
            <div class="sub">${supMap[s].count} รายการ | ลดเฉลี่ย ${(avgDisc * 100).toFixed(1)}%</div>
          </div>
        </div>
        <div class="pic-savings-box">
          <div class="amount">${formatCurrency(supMap[s].savings, 0)}</div>
          <div class="share">ยอดซื้อ: ${formatCurrency(supMap[s].purchase, 0)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 2. สรุป KPI รายเดือน & รายปี (ไดนามิกตามปีที่เลือก)
// -------------------------------------------------------------
function renderMonthlyKPITracking() {
  const tbody = document.getElementById('monthly-kpi-tbody');
  const creditTbody = document.getElementById('credit-extension-tbody');
  if (!tbody) return;

  const monthlyAgg = getMonthlyAggregatedData();
  let totalPV = 0;
  let totalCR = 0;
  let totalTarget = 0;
  let totalCreditSaving = 0;

  tbody.innerHTML = monthlyAgg.map(row => {
    totalPV += row.pv;
    totalCR += row.cr;
    totalTarget += row.target;
    totalCreditSaving += row.creditSaving;

    const varianceTHB = row.cr - row.target;

    return `
      <tr>
        <td><strong>${THAI_MONTHS[row.month] || row.month}</strong></td>
        <td>${formatCurrency(row.pv)}</td>
        <td class="highlight-col">${formatCurrency(row.cr)}</td>
        <td>${formatCurrency(row.target)}</td>
        <td><strong>${(row.pct * 100).toFixed(2)}%</strong></td>
        <td style="color: ${varianceTHB >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
          ${varianceTHB >= 0 ? '+' : ''}${formatCurrency(varianceTHB)}
        </td>
        <td>
          <span class="kpi-badge ${row.isPassed ? 'success' : 'danger'}">
            ${row.isPassed ? '✓ ได้ตามเป้า' : '✕ ต่ำกว่าเป้า'}
          </span>
        </td>
        <td>${formatCurrency(row.creditSaving)}</td>
      </tr>
    `;
  }).join('');

  const totalActualPct = totalPV > 0 ? (totalCR / totalPV) : 0;
  const isTotalPassed = totalActualPct >= State.targetRate;
  tbody.innerHTML += `
    <tr style="background: var(--bg-glass); font-weight: 700;">
      <td>รวมทั้งปี (GRAND TOTAL)</td>
      <td>${formatCurrency(totalPV)}</td>
      <td class="highlight-col">${formatCurrency(totalCR)}</td>
      <td>${formatCurrency(totalTarget)}</td>
      <td style="color: var(--accent-primary);">${(totalActualPct * 100).toFixed(2)}%</td>
      <td style="color: ${totalCR - totalTarget >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
        ${totalCR - totalTarget >= 0 ? '+' : ''}${formatCurrency(totalCR - totalTarget)}
      </td>
      <td>
        <span class="kpi-badge ${isTotalPassed ? 'success' : 'danger'}">
          ${isTotalPassed ? '✓ ได้ตามเป้า' : '✕ ต่ำกว่าเป้า'}
        </span>
      </td>
      <td>${formatCurrency(totalCreditSaving)}</td>
    </tr>
  `;

  const kpiSub = document.querySelector('#view-kpi-tracking .card-header-sub');
  if (kpiSub) {
    kpiSub.textContent = `เปรียบเทียบมูลค่าจริงเทียบเป้าหมายการลดต้นทุน ${(State.targetRate * 100).toFixed(1)}% (ปี ${State.activeYear === 'ALL' ? 'ทุกปี' : State.activeYear})`;
  }
  const targetTh = document.querySelector('#monthly-kpi-table th:nth-child(4)');
  if (targetTh) {
    targetTh.textContent = `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}% (บาท)`;
  }

  if (creditTbody) {
    const creditRows = monthlyAgg.filter(m => m.creditSaving > 0);
    if (creditRows.length > 0) {
      creditTbody.innerHTML = creditRows.map(m => `
        <tr>
          <td><strong>${THAI_MONTHS[m.month] || m.month}</strong></td>
          <td><span class="tier-tag tier-mid">+30 วัน</span></td>
          <td>${formatCurrency(m.pv)}</td>
          <td class="highlight-col">${formatCurrency(m.creditSaving)}</td>
        </tr>
      `).join('');
    } else {
      creditTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่มีรายการขยายเครดิตในปีที่เลือก</td></tr>`;
    }
  }

  renderMultiYearChart();
}

function renderMultiYearChart() {
  const ctx = document.getElementById('multiYearChart')?.getContext('2d');
  if (!ctx) return;

  const years = ['2023', '2024', '2025', '2026'];
  const multiYearData = years.map(yr => {
    const txs = State.transactions.filter(t => t.year === yr);
    let saving = txs.reduce((sum, t) => sum + (Number(t.totalSaving) || 0), 0);
    
    let purchase = 0;
    if (yr === '2026' && State.data?.monthlySummary) {
      purchase = State.data.monthlySummary.reduce((sum, m) => sum + (Number(m.pv2026) || 0), 0);
    } else if (State.data?.purchaseHistory) {
      const phs = State.data.purchaseHistory.filter(p => p.year === yr);
      purchase = phs.reduce((sum, p) => sum + (Number(p.purchaseValue) || 0), 0);
    }
    if (purchase === 0) {
      purchase = txs.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0);
    }
    
    const ys = State.data?.yearlySummary?.find(y => y.year === yr);
    if (ys) {
      if (saving === 0 && ys.costSaving > 0) saving = ys.costSaving;
      if (purchase === 0 && ys.purchaseValue > 0) purchase = ys.purchaseValue;
    }

    return {
      year: yr,
      purchaseMB: Number((purchase / 1000000).toFixed(2)),
      savingMB: Number((saving / 1000000).toFixed(2)),
      pct: purchase > 0 ? ((saving / purchase) * 100).toFixed(2) : '0.00'
    };
  });

  const labels = multiYearData.map(y => `ปี ${y.year}`);
  const purchaseValues = multiYearData.map(y => y.purchaseMB);
  const savingsValues = multiYearData.map(y => y.savingMB);

  if (State.charts.multiYear) {
    State.charts.multiYear.destroy();
  }

  const isDark = State.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  State.charts.multiYear = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'มูลค่าการสั่งซื้อรวม (ล้านบาท)',
          data: purchaseValues,
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(2, 132, 199, 0.18)',
          borderColor: isDark ? '#38bdf8' : '#0284c7',
          borderWidth: 1.5,
          borderRadius: 8,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'line',
          label: 'มูลค่าผลประหยัดต้นทุน (ล้านบาท)',
          data: savingsValues,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#10b981',
          pointBorderColor: isDark ? '#0f172a' : '#ffffff',
          pointBorderWidth: 2,
          yAxisID: 'y1',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor,
            font: { family: 'Prompt', size: 12, weight: '500' },
            boxWidth: 14,
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              const item = multiYearData[idx];
              if (item) {
                return `อัตราการประหยัด: ${item.pct}% ของยอดจัดซื้อ`;
              }
              return '';
            },
            label: (c) => ` ${c.dataset.label}: ฿${c.raw} ล้านบาท`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { family: 'Prompt', size: 12, weight: '600' } },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: 'มูลค่าสั่งซื้อ (ล้านบาท)',
            color: textColor,
            font: { family: 'Prompt', size: 11, weight: '600' }
          },
          ticks: {
            color: textColor,
            callback: (val) => `${val}M`
          },
          grid: { color: gridColor }
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: 'ผลประหยัดต้นทุน (ล้านบาท)',
            color: textColor,
            font: { family: 'Prompt', size: 11, weight: '600' }
          },
          ticks: {
            color: textColor,
            callback: (val) => `${val}M`
          },
          grid: { display: false }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// 3. ตารางรายการสั่งซื้อ (PO TRANSACTIONS)
// -------------------------------------------------------------
function initTableEvents() {
  const searchInput = document.getElementById('tx-search-input');
  const monthSelect = document.getElementById('filter-tx-month');
  const picSelect = document.getElementById('filter-tx-pic');
  const strategySelect = document.getElementById('filter-tx-strategy');
  const resetBtn = document.getElementById('reset-filter-btn');
  const exportBtn = document.getElementById('export-tx-btn');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  searchInput?.addEventListener('input', (e) => {
    State.filters.search = e.target.value.toLowerCase();
    State.tablePage = 1;
    filterTransactions();
    renderTransactionTable();
  });

  monthSelect?.addEventListener('change', (e) => {
    State.filters.month = e.target.value;
    State.tablePage = 1;
    filterTransactions();
    renderTransactionTable();
  });

  picSelect?.addEventListener('change', (e) => {
    State.filters.pic = e.target.value;
    State.tablePage = 1;
    filterTransactions();
    renderTransactionTable();
  });

  strategySelect?.addEventListener('change', (e) => {
    State.filters.strategy = e.target.value;
    State.tablePage = 1;
    filterTransactions();
    renderTransactionTable();
  });

  resetBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (monthSelect) monthSelect.value = 'ALL';
    if (picSelect) picSelect.value = 'ALL';
    if (strategySelect) strategySelect.value = 'ALL';
    State.filters = { search: '', month: 'ALL', pic: 'ALL', strategy: 'ALL' };
    State.tablePage = 1;
    filterTransactions();
    renderTransactionTable();
  });

  exportBtn?.addEventListener('click', () => exportFilteredTransactions());

  prevBtn?.addEventListener('click', () => {
    if (State.tablePage > 1) {
      State.tablePage--;
      renderTransactionTable();
    }
  });

  nextBtn?.addEventListener('click', () => {
    const totalPages = Math.ceil(State.filteredTransactions.length / State.pageSize);
    if (State.tablePage < totalPages) {
      State.tablePage++;
      renderTransactionTable();
    }
  });

  document.querySelectorAll('#transaction-data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (State.sortKey === key) {
        State.sortAsc = !State.sortAsc;
      } else {
        State.sortKey = key;
        State.sortAsc = false;
      }
      sortFilteredTransactions();
      renderTransactionTable();
    });
  });
}

function filterTransactions() {
  let list = State.transactions;

  if (State.activeYear !== 'ALL') {
    list = list.filter(t => t.year === State.activeYear);
  }

  if (State.activeQuarter !== 'ALL') {
    const allowed = QUARTER_MONTHS[State.activeQuarter] || [];
    list = list.filter(t => allowed.includes(t.month));
  }

  if (State.filters.month !== 'ALL') {
    list = list.filter(t => t.month === State.filters.month);
  }

  if (State.filters.pic !== 'ALL') {
    list = list.filter(t => t.pic.toLowerCase().includes(State.filters.pic.toLowerCase()));
  }

  if (State.filters.strategy !== 'ALL') {
    list = list.filter(t => t.strategy.toLowerCase().includes(State.filters.strategy.toLowerCase()));
  }

  if (State.filters.search) {
    const q = State.filters.search;
    list = list.filter(t => 
      (t.poNo && t.poNo.toLowerCase().includes(q)) ||
      (t.supplier && t.supplier.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.pic && t.pic.toLowerCase().includes(q))
    );
  }

  State.filteredTransactions = list;
  sortFilteredTransactions();
}

function sortFilteredTransactions() {
  const k = State.sortKey;
  const asc = State.sortAsc;

  State.filteredTransactions.sort((a, b) => {
    let valA = a[k];
    let valB = b[k];

    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (typeof valA === 'number' && typeof valB === 'number') {
      return asc ? valA - valB : valB - valA;
    }

    if (k === 'month') {
      const idxA = MONTH_ORDER.indexOf(String(valA).toUpperCase());
      const idxB = MONTH_ORDER.indexOf(String(valB).toUpperCase());
      if (idxA !== -1 && idxB !== -1) {
        return asc ? idxA - idxB : idxB - idxA;
      }
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (strA < strB) return asc ? -1 : 1;
    if (strA > strB) return asc ? 1 : -1;
    return 0;
  });
}

function renderTransactionTable() {
  const tbody = document.getElementById('transaction-tbody');
  const infoEl = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');
  const pageNumbersEl = document.getElementById('page-numbers');
  if (!tbody) return;

  // อัปเดตตัวบอกทิศทางการเรียงลำดับในหัวตาราง
  document.querySelectorAll('#transaction-data-table th.sortable').forEach(th => {
    const key = th.getAttribute('data-sort');
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (State.sortKey === key) {
      th.classList.add(State.sortAsc ? 'sorted-asc' : 'sorted-desc');
    }
  });

  const total = State.filteredTransactions.length;
  const totalPages = Math.ceil(total / State.pageSize) || 1;
  if (State.tablePage > totalPages) State.tablePage = totalPages;

  const startIdx = (State.tablePage - 1) * State.pageSize;
  const endIdx = Math.min(startIdx + State.pageSize, total);
  const pageData = State.filteredTransactions.slice(startIdx, endIdx);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 36px; color: var(--text-muted);">ไม่พบรายการข้อมูลตามเงื่อนไขที่ค้นหา</td></tr>`;
  } else {
    tbody.innerHTML = pageData.map(item => {
      const disc = item.percentDiscount;
      let tierHtml = '';
      if (disc >= 0.10) {
        tierHtml = '<span class="tier-tag tier-high">🟢 สูง (>10%)</span>';
      } else if (disc >= 0.03) {
        tierHtml = '<span class="tier-tag tier-mid">🔵 ตามเป้า (3-10%)</span>';
      } else {
        tierHtml = '<span class="tier-tag tier-low">⚪ ทั่วไป (<3%)</span>';
      }

      return `
        <tr onclick="openTxModal('${item.globalId}')">
          <td><span class="tier-tag tier-low">${THAI_MONTHS_SHORT[item.month] || item.month}</span></td>
          <td><strong>${item.poNo || '-'}</strong></td>
          <td style="max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.supplier}">${item.supplier || '-'}</td>
          <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.description}">${item.description || '-'}</td>
          <td>${formatNumber(item.qty)}</td>
          <td><span style="color: var(--text-muted); font-size: 11px;">${item.unit || '-'}</span></td>
          <td>${formatCurrency(item.totalPrice)}</td>
          <td class="highlight-col">${formatCurrency(item.totalSaving)}</td>
          <td><strong>${(item.percentDiscount * 100).toFixed(1)}%</strong></td>
          <td>${tierHtml}</td>
          <td><span class="tier-tag tier-low">${THAI_STRATEGIES[item.strategy] || item.strategy || '-'}</span></td>
          <td>${THAI_PIC_NAMES[item.pic] || item.pic || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  if (infoEl) {
    infoEl.textContent = total > 0 
      ? `แสดงรายการที่ ${startIdx + 1} ถึง ${endIdx} จากทั้งหมด ${formatNumber(total)} รายการ`
      : 'แสดง 0 ถึง 0 จากทั้งหมด 0 รายการ';
  }

  if (prevBtn) prevBtn.disabled = (State.tablePage <= 1);
  if (nextBtn) nextBtn.disabled = (State.tablePage >= totalPages);

  if (pageNumbersEl) {
    let pagesHtml = '';
    const maxVisible = 5;
    let startPage = Math.max(1, State.tablePage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pagesHtml += `
        <button class="page-num-btn ${p === State.tablePage ? 'active' : ''}" onclick="goToTablePage(${p})">${p}</button>
      `;
    }
    pageNumbersEl.innerHTML = pagesHtml;
  }
}

window.goToTablePage = function(page) {
  State.tablePage = page;
  renderTransactionTable();
};

// -------------------------------------------------------------
// ป๊อปอัปดูรายละเอียด PO
// -------------------------------------------------------------
window.openTxModal = function(globalId) {
  const item = State.transactions.find(t => t.globalId === globalId);
  if (!item) return;

  const modal = document.getElementById('tx-modal');
  const modalBody = document.getElementById('modal-tx-body');
  const modalTitle = document.getElementById('modal-tx-title');

  if (modalTitle) modalTitle.textContent = `รายละเอียด PO: ${item.poNo || 'ไม่ระบุ'}`;

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="detail-line"><span class="lbl">ชื่อซัพพลายเออร์ / คู่ค้า</span><span class="val">${item.supplier || '-'}</span></div>
      <div class="detail-line"><span class="lbl">รายละเอียดสินค้าหรือบริการ</span><span class="val">${item.description || '-'}</span></div>
      <div class="detail-line"><span class="lbl">งวดประจำเดือน / ปี</span><span class="val">${THAI_MONTHS[item.month] || item.month} / ปี ${item.year}</span></div>
      <div class="detail-line"><span class="lbl">จำนวนและหน่วยนับ</span><span class="val">${formatNumber(item.qty)} ${item.unit || '-'}</span></div>
      <div class="detail-line"><span class="lbl">ราคาต่อหน่วยต่ำสุดเดิม</span><span class="val">${formatCurrency(item.minUnitPrice)}</span></div>
      <div class="detail-line"><span class="lbl">ราคาต่อหน่วยที่ต่อรองได้</span><span class="val">${formatCurrency(item.negotiatedUnitPrice)}</span></div>
      <div class="detail-line"><span class="lbl">ส่วนต่างราคาต่อหน่วย</span><span class="val">${formatCurrency(item.unitDifference)}</span></div>
      <div class="detail-line"><span class="lbl">มูลค่าสั่งซื้อรวม (บาท)</span><span class="val">${formatCurrency(item.totalPrice)}</span></div>
      <div class="detail-line"><span class="lbl">รวมมูลค่าที่ต่อรองลดลงได้</span><span class="val" style="color: var(--accent-emerald); font-size: 15px; font-weight: 700;">${formatCurrency(item.totalSaving)}</span></div>
      <div class="detail-line"><span class="lbl">คิดเป็น % ส่วนลด</span><span class="val" style="color: var(--accent-primary); font-weight: 700;">${(item.percentDiscount * 100).toFixed(2)}%</span></div>
      <div class="detail-line"><span class="lbl">กลยุทธ์การต่อรองราคา</span><span class="val"><span class="tier-tag tier-mid">${THAI_STRATEGIES[item.strategy] || item.strategy || '-'}</span></span></div>
      <div class="detail-line"><span class="lbl">ผู้รับผิดชอบการจัดซื้อ</span><span class="val">${THAI_PIC_NAMES[item.pic] || item.pic || '-'}</span></div>
      ${item.remark ? `<div class="detail-line"><span class="lbl">หมายเหตุ / ข้อมูลเพิ่มเติม</span><span class="val" style="color: var(--accent-orange); font-weight: 600;">${item.remark}</span></div>` : ''}
    `;
  }

  modal?.classList.add('active');
};

window.closeTxModal = function() {
  document.getElementById('tx-modal')?.classList.remove('active');
};

document.getElementById('tx-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'tx-modal') closeTxModal();
});

// -------------------------------------------------------------
// 4. การวิเคราะห์ซัพพลายเออร์ (ไดนามิกตามปีที่เลือก)
// -------------------------------------------------------------
function initSupplierEvents() {
  const searchInput = document.getElementById('supplier-search-input');
  searchInput?.addEventListener('input', () => renderSuppliersView());
}

function renderSuppliersView() {
  const tbody = document.getElementById('supplier-ranking-tbody');
  const searchInput = document.getElementById('supplier-search-input');
  if (!tbody) return;

  const scopedTxs = getActiveScopeTransactions();
  const supplierMap = {};

  scopedTxs.forEach(t => {
    const s = t.supplier || 'ไม่ระบุ';
    if (!supplierMap[s]) {
      supplierMap[s] = { name: s, savings: 0, purchase: 0, count: 0, strategies: {} };
    }
    supplierMap[s].savings += t.totalSaving;
    supplierMap[s].purchase += t.totalPrice;
    supplierMap[s].count += 1;

    const strat = t.strategy || 'Negotiate';
    supplierMap[s].strategies[strat] = (supplierMap[s].strategies[strat] || 0) + 1;
  });

  let sorted = Object.values(supplierMap).sort((a, b) => b.savings - a.savings);

  const query = (searchInput?.value || '').toLowerCase().trim();
  if (query) {
    sorted = sorted.filter(s => s.name.toLowerCase().includes(query));
  }

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">ไม่พบข้อมูลซัพพลายเออร์ตามเงื่อนไขที่ค้นหา</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((sup, idx) => {
    const avgDisc = sup.purchase > 0 ? (sup.savings / sup.purchase) : 0;
    const topStrats = Object.keys(sup.strategies)
      .sort((a, b) => sup.strategies[b] - sup.strategies[a])
      .slice(0, 2)
      .map(s => `<span class="tier-tag tier-low">${THAI_STRATEGIES[s] || s}</span>`)
      .join(' ');

    return `
      <tr>
        <td><span class="rank-badge">#${idx + 1}</span></td>
        <td><strong>${sup.name}</strong></td>
        <td>${formatNumber(sup.count)}</td>
        <td>${formatCurrency(sup.purchase)}</td>
        <td class="highlight-col">${formatCurrency(sup.savings)}</td>
        <td><strong>${formatPercent(avgDisc, 1)}</strong></td>
        <td>${topStrats}</td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 5. ทีมจัดซื้อ & ตารางกลยุทธ์ (ไดนามิกตามปีที่เลือก)
// -------------------------------------------------------------
function renderPICLeaderboard() {
  const container = document.getElementById('pic-full-leaderboard');
  const tableBody = document.getElementById('pic-strategy-tbody');
  if (!container) return;

  const scopedTxs = getActiveScopeTransactions();
  const picMap = {};

  scopedTxs.forEach(t => {
    const pic = t.pic || 'ไม่ระบุ';
    if (!picMap[pic]) picMap[pic] = { name: pic, savings: 0, purchase: 0, count: 0 };
    picMap[pic].savings += t.totalSaving;
    picMap[pic].purchase += t.totalPrice;
    picMap[pic].count += 1;
  });

  const sortedPics = Object.values(picMap).sort((a, b) => b.savings - a.savings);
  const totalTeamSavings = sortedPics.reduce((acc, p) => acc + p.savings, 0) || 1;

  container.innerHTML = sortedPics.map((p, idx) => {
    const share = ((p.savings / totalTeamSavings) * 100).toFixed(1);
    const avgDisc = p.purchase > 0 ? (p.savings / p.purchase) : 0;
    const thaiName = THAI_PIC_NAMES[p.name] || p.name;

    return `
      <div class="card-box" style="padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="rank-badge">อันดับ #${idx + 1}</span>
          <span class="kpi-badge success">สัดส่วน ${share}%</span>
        </div>
        <div style="font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${thaiName}</div>
        <div style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 6px;">ผู้รับผิดชอบจัดซื้อ (${p.name})</div>
        <div style="font-size: 17px; font-weight: 700; color: var(--accent-emerald);">${formatCurrency(p.savings, 0)}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); margin-top: 6px; border-top: 1px dashed var(--border-subtle); padding-top: 6px;">
          <span>${p.count} รายการ</span>
          <span>ลดเฉลี่ย ${formatPercent(avgDisc, 1)}</span>
        </div>
      </div>
    `;
  }).join('');

  // ตารางกลยุทธ์จำแนกรายบุคคลแบบไดนามิก (Strategy x PIC Cross Matrix)
  if (tableBody) {
    const stratPicMatrix = {};
    scopedTxs.forEach(t => {
      const strat = t.strategy || 'Negotiate';
      const pic = t.pic || 'Pawina';
      if (!stratPicMatrix[strat]) {
        stratPicMatrix[strat] = { strategy: strat, Total: 0 };
        PIC_KEYS.forEach(k => stratPicMatrix[strat][k] = 0);
      }
      stratPicMatrix[strat].Total += t.totalSaving;
      if (stratPicMatrix[strat][pic] !== undefined) {
        stratPicMatrix[strat][pic] += t.totalSaving;
      }
    });

    const matrixRows = Object.values(stratPicMatrix).sort((a, b) => b.Total - a.Total);
    const totalAll = matrixRows.reduce((acc, row) => acc + (row.Total || 0), 0) || 1;

    if (matrixRows.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">ไม่มีข้อมูลสำหรับปีที่เลือก</td></tr>`;
      return;
    }

    tableBody.innerHTML = matrixRows.map(row => {
      const share = ((row.Total / totalAll) * 100).toFixed(2);
      const stratThai = THAI_STRATEGIES[row.strategy] || row.strategy;
      return `
        <tr>
          <td><strong>${stratThai}</strong></td>
          <td>${formatCurrency(row.Pawina, 0)}</td>
          <td>${formatCurrency(row.Tanida, 0)}</td>
          <td>${formatCurrency(row.Yuwanit, 0)}</td>
          <td>${formatCurrency(row.Dusit, 0)}</td>
          <td>${formatCurrency(row.Saniya, 0)}</td>
          <td class="highlight-col">${formatCurrency(row.Total, 0)}</td>
          <td><span class="kpi-badge success">${share}%</span></td>
        </tr>
      `;
    }).join('');
  }
}

// -------------------------------------------------------------
// 6. โปรแกรมคำนวณ Kaizen & ขยายเครดิตเทอม (พร้อม Slider + Number Sync)
// -------------------------------------------------------------
function initSimulators() {
  const setupSync = (numId, rangeId, badgeId, formatFn, onUpdate) => {
    const numEl = document.getElementById(numId);
    const rangeEl = document.getElementById(rangeId);
    const badgeEl = document.getElementById(badgeId);

    const updateUI = (val) => {
      if (badgeEl && formatFn) badgeEl.textContent = formatFn(val);
      if (onUpdate) onUpdate();
    };

    if (rangeEl && numEl) {
      rangeEl.addEventListener('input', () => {
        numEl.value = rangeEl.value;
        updateUI(Number(rangeEl.value));
      });

      numEl.addEventListener('input', () => {
        const val = Number(numEl.value);
        if (!isNaN(val)) {
          rangeEl.value = val;
          updateUI(val);
        }
      });
    }
  };

  const wageInput = document.getElementById('sim-hourly-wage');
  const minInput = document.getElementById('sim-minutes-saved');
  const jobsInput = document.getElementById('sim-jobs-month');
  const monthsInput = document.getElementById('sim-months-year');

  const calcKaizen = () => {
    const wage = Math.max(0, Number(wageInput?.value) || 117);
    const min = Math.max(0, Number(minInput?.value) || 10);
    const jobs = Math.max(0, Number(jobsInput?.value) || 16);
    const months = Math.max(0, Number(monthsInput?.value) || 1);

    const result = (min / 60) * jobs * wage * months;
    const resEl = document.getElementById('sim-kaizen-result');
    const formEl = document.getElementById('sim-kaizen-formula');
    if (resEl) resEl.textContent = formatCurrency(result);
    if (formEl) formEl.textContent = `(${min} / 60) × ${jobs} งาน × ฿${wage}/ชม. × ${months} เดือน`;
  };

  setupSync('sim-hourly-wage', 'sim-hourly-wage-range', 'sim-wage-badge', v => `${v} บาท`, calcKaizen);
  setupSync('sim-minutes-saved', 'sim-minutes-saved-range', 'sim-min-badge', v => `${v} นาที`, calcKaizen);
  setupSync('sim-jobs-month', 'sim-jobs-month-range', 'sim-jobs-badge', v => `${v} งาน`, calcKaizen);
  setupSync('sim-months-year', 'sim-months-year-range', 'sim-months-badge', v => `${v} เดือน`, calcKaizen);

  const poInput = document.getElementById('sim-credit-po');
  const origInput = document.getElementById('sim-credit-orig');
  const newInput = document.getElementById('sim-credit-new');
  const rateInput = document.getElementById('sim-credit-rate');

  const calcCredit = () => {
    const po = Math.max(0, Number(poInput?.value) || 3340000);
    const origDays = Math.max(0, Number(origInput?.value) || 30);
    const newDays = Math.max(0, Number(newInput?.value) || 60);
    const rate = Math.max(0, (Number(rateInput?.value) || 4.25)) / 100;

    const diffDays = Math.max(0, newDays - origDays);
    const saving = po * (diffDays / 360) * rate;

    const resEl = document.getElementById('sim-credit-result');
    const formEl = document.getElementById('sim-credit-formula');
    if (resEl) resEl.textContent = formatCurrency(saving);
    if (formEl) formEl.textContent = `${formatNumber(po)} × (${diffDays} / 360) × ${(rate * 100).toFixed(2)}%`;
  };

  setupSync('sim-credit-po', 'sim-credit-po-range', 'sim-po-badge', v => v >= 1000000 ? `${(v / 1000000).toFixed(2)}M ฿` : `${formatNumber(v)} ฿`, calcCredit);
  setupSync('sim-credit-orig', 'sim-credit-orig-range', 'sim-orig-badge', v => `${v} วัน`, calcCredit);
  setupSync('sim-credit-new', 'sim-credit-new-range', 'sim-new-badge', v => `${v} วัน`, calcCredit);
  setupSync('sim-credit-rate', 'sim-credit-rate-range', 'sim-rate-badge', v => `${v}%`, calcCredit);

  // คำนวณค่าตั้งต้นทันที
  calcKaizen();
  calcCredit();
}

// -------------------------------------------------------------
// 7. จัดการไฟล์ข้อมูล Excel (DROPZONE & EXPORT)
// -------------------------------------------------------------
function initDropzone() {
  const dropzone = document.getElementById('excel-dropzone');
  const fileInput = document.getElementById('excel-file-input');

  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-primary-light)';
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--accent-primary)';
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-primary)';
    if (e.dataTransfer.files.length > 0) {
      handleUploadedExcel(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleUploadedExcel(e.target.files[0]);
    }
  });
}

function handleUploadedExcel(file) {
  if (typeof XLSX === 'undefined') {
    alert("กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดไลบรารี SheetJS");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!jsonRows || jsonRows.length === 0) {
        alert("ไม่พบข้อมูลในไฟล์ Excel ที่อัปโหลด");
        return;
      }

      const parseNum = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/,/g, '').replace(/฿/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const newTransactions = [];

      jsonRows.forEach((r, idx) => {
        // ค้นหาคีย์ที่มีชื่อตรงกับคอลัมน์ (รองรับทั้งภาษาไทยและอังกฤษ)
        const getVal = (...keys) => {
          for (const k of keys) {
            for (const rowKey of Object.keys(r)) {
              if (rowKey.trim().toLowerCase() === k.trim().toLowerCase() || rowKey.includes(k)) {
                return r[rowKey];
              }
            }
          }
          return '';
        };

        const yr = String(getVal('Year', 'ปี', 'ปี (พ.ศ./ค.ศ.)') || '2026').trim();
        let mo = String(getVal('Month', 'เดือน', 'งวดเดือน') || 'JAN').toUpperCase().trim();
        if (mo.length > 3) mo = mo.slice(0, 3);

        const po = String(getVal('PO', 'PO No', 'เลขที่ PO', 'เลขที่ใบสั่งซื้อ') || `PO-UP-${idx + 1}`).trim();
        const supp = String(getVal('Supplier', 'ชื่อซัพพลายเออร์', 'ซัพพลายเออร์', 'คู่ค้า') || 'ไม่ระบุ').trim();
        const desc = String(getVal('Description', 'รายการ', 'รายละเอียด', 'รายละเอียดสินค้า') || '').trim();
        const qty = parseNum(getVal('Qty', 'Quantity', 'จำนวน'));
        const unit = String(getVal('Unit', 'หน่วย', 'หน่วยนับ') || 'EA').trim();
        const minPrice = parseNum(getVal('MinPrice', 'ราคาเดิม', 'ราคาต่อหน่วยเดิม', 'UnitPrice'));
        let totalPrice = parseNum(getVal('TotalPrice', 'ราคารวม', 'มูลค่ารวม (บาท)', 'มูลค่าสั่งซื้อ'));
        if (totalPrice === 0 && qty > 0 && minPrice > 0) totalPrice = qty * minPrice;

        const negPrice = parseNum(getVal('NegotiatedPrice', 'ราคาที่ต่อรองได้', 'ราคาใหม่')) || minPrice;
        let unitDiff = parseNum(getVal('UnitDifference', 'ส่วนต่างราคา')) || (minPrice - negPrice);
        let totalSaving = parseNum(getVal('TotalSaving', 'รวมที่ต่อรองได้', 'ส่วนลดรวม (บาท)', 'Savings'));
        if (totalSaving === 0 && unitDiff > 0 && qty > 0) totalSaving = unitDiff * qty;

        const pctDisc = parseNum(getVal('PercentDiscount', '% ส่วนลด', 'ส่วนลด%')) || (totalPrice > 0 ? totalSaving / totalPrice : 0);
        const method = String(getVal('Method', 'Strategy', 'กลยุทธ์', 'วิธีต่อรอง') || 'Negotiate').trim();
        const pic = String(getVal('PIC', 'ผู้รับผิดชอบ', 'Buyer', 'จัดซื้อ') || 'ไม่ระบุ').trim();
        const remark = String(getVal('Remark', 'หมายเหตุ') || '').trim();

        if (po || supp !== 'ไม่ระบุ' || totalPrice > 0 || totalSaving > 0) {
          newTransactions.push({
            id: `up-${idx + 1}`,
            globalId: `up-${idx + 1}`,
            year: yr,
            month: mo,
            poNo: po,
            supplier: supp,
            description: desc,
            qty: qty,
            unit: unit,
            minUnitPrice: minPrice,
            totalPrice: totalPrice,
            negotiatedUnitPrice: negPrice,
            unitDifference: unitDiff,
            totalSaving: totalSaving,
            percentDiscount: pctDisc > 1 ? pctDisc / 100 : pctDisc,
            strategy: method,
            pic: pic,
            remark: remark
          });
        }
      });

      if (newTransactions.length === 0) {
        alert("ไม่พบแถวข้อมูลที่สามารถนำเข้าได้ กรุณาตรวจสอบหัวคอลัมน์ของไฟล์");
        return;
      }

      State.transactions = newTransactions;
      filterTransactions();
      renderAllViews();

      alert(`✅ นำเข้าข้อมูลสำเร็จ ${newTransactions.length} รายการจากไฟล์ ${file.name} เรียบร้อยแล้ว!`);
      switchView('dashboard');
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportFilteredTransactions() {
  const headers = ["เดือน", "เลขที่ PO", "ชื่อซัพพลายเออร์", "รายละเอียดสินค้า/บริการ", "จำนวน", "หน่วย", "ราคารวม (บาท)", "รวมที่ต่อรองได้ (บาท)", "% ส่วนลด", "กลยุทธ์", "ผู้รับผิดชอบ"];
  const rows = State.filteredTransactions.map(t => [
    THAI_MONTHS[t.month] || t.month,
    `"${t.poNo}"`,
    `"${(t.supplier || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.qty,
    t.unit,
    t.totalPrice,
    t.totalSaving,
    (t.percentDiscount * 100).toFixed(2) + '%',
    `"${THAI_STRATEGIES[t.strategy] || t.strategy}"`,
    `"${THAI_PIC_NAMES[t.pic] || t.pic}"`
  ]);

  downloadCSV("รายงานรายการส่วนลดจัดซื้อ.csv", headers, rows);
}

window.exportMonthlyKPIToCSV = function() {
  const headers = ["เดือน", "มูลค่าสั่งซื้อ (บาท)", "มูลค่าต่อรองได้ (บาท)", `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}% (บาท)`, "% ส่วนลดจริง", "ผลต่างเทียบเป้าหมาย (บาท)", "สถานะ KPI", "ผลประหยัดเพิ่มเครดิต (บาท)"];
  const monthlyAgg = getMonthlyAggregatedData();
  let totalPV = 0, totalCR = 0, totalTarget = 0, totalCredit = 0;

  const rows = monthlyAgg.map(m => {
    totalPV += m.pv;
    totalCR += m.cr;
    totalTarget += m.target;
    totalCredit += m.creditSaving;
    const diff = m.cr - m.target;
    return [
      `"${THAI_MONTHS[m.month] || m.month}"`,
      m.pv.toFixed(2),
      m.cr.toFixed(2),
      m.target.toFixed(2),
      (m.pct * 100).toFixed(2) + '%',
      diff.toFixed(2),
      `"${m.isPassed ? 'ได้ตามเป้าหมาย' : 'ต่ำกว่าเป้าหมาย'}"`,
      m.creditSaving.toFixed(2)
    ];
  });

  const totalPct = totalPV > 0 ? (totalCR / totalPV) : 0;
  const totalDiff = totalCR - totalTarget;
  rows.push([
    '"รวมทั้งปี (GRAND TOTAL)"',
    totalPV.toFixed(2),
    totalCR.toFixed(2),
    totalTarget.toFixed(2),
    (totalPct * 100).toFixed(2) + '%',
    totalDiff.toFixed(2),
    `"${totalPct >= State.targetRate ? 'ได้ตามเป้าหมาย' : 'ต่ำกว่าเป้าหมาย'}"`,
    totalCredit.toFixed(2)
  ]);

  downloadCSV(`สรุปผลการลดต้นทุนรายเดือน_${State.activeYear}.csv`, headers, rows);
};

window.exportFullTransactionsCSV = function() {
  exportFilteredTransactions();
};

window.exportFullTransactionsJSON = function() {
  const blob = new Blob([JSON.stringify(State.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "kpi_dataset.json";
  a.click();
  URL.revokeObjectURL(url);
};

function downloadCSV(filename, headers, rows) {
  const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function updateChartsTheme() {
  renderMonthlyTrendChart();
  renderStrategyDonutChart(getActiveScopeTransactions());
  renderMultiYearChart();
}

// ==========================================================================
// ระบบซิงค์ข้อมูลสดจาก Google Sheets (Live Sync Engine)
// ==========================================================================

const GSHEET_STORAGE_KEY = 'qtc_gsheet_config';
const DEFAULT_GSHEET_URL = 'https://docs.google.com/spreadsheets/d/1iVgKgCdQRCz4_Vo1mdmM38xJHQI4B5mzKx7aJ9oBKn0/edit?usp=sharing';

function initGoogleSheetSync() {
  const saved = localStorage.getItem(GSHEET_STORAGE_KEY);
  let config = { url: DEFAULT_GSHEET_URL, autoSync: true };

  if (saved) {
    try {
      config = { ...config, ...JSON.parse(saved) };
    } catch (err) {
      console.error('Error parsing config:', err);
    }
  }

  const urlInput = document.getElementById('gsheet-url-input');
  const autoSyncCheck = document.getElementById('gsheet-auto-sync');

  if (urlInput) urlInput.value = config.url || DEFAULT_GSHEET_URL;
  if (autoSyncCheck && config.autoSync !== undefined) autoSyncCheck.checked = config.autoSync;

  const badge = document.getElementById('gsheet-status-badge');
  if (badge) {
    badge.textContent = `🟢 เชื่อมต่อ QTC Sheet สด`;
    badge.className = 'tier-tag tier-high';
  }

  // ดึงข้อมูลสดจาก Google Sheet อัตโนมัติทันทีที่เปิดเว็บ
  if (config.autoSync) {
    console.log('🔄 Auto-syncing live from embedded Google Sheet...');
    syncGoogleSheetNow(false);
  }
}

function extractGoogleSheetInfo(input) {
  const src = (input && input.trim()) ? input.trim() : DEFAULT_GSHEET_URL;
  const trimmed = src.trim();
  
  // Extract Sheet ID
  let sheetId = trimmed;
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1]) {
    sheetId = idMatch[1];
  }

  // Extract GID if user passed specific tab URL
  let gid = '';
  const gidMatch = trimmed.match(/[#&]gid=([0-9]+)/);
  if (gidMatch && gidMatch[1]) {
    gid = gidMatch[1];
  }

  return { sheetId, gid };
}

// ตัวแปลงผลลัพธ์ Google Visualization API เป็น Array of Objects
function parseGvizTextToRows(gvizText) {
  const jsonStart = gvizText.indexOf('{');
  const jsonEnd = gvizText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("รูปแบบข้อมูล Google Sheet ไม่ถูกต้อง");
  
  const rawJson = gvizText.substring(jsonStart, jsonEnd + 1);
  const data = JSON.parse(rawJson);
  
  if (data.status === 'error') {
    throw new Error(data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลชีต');
  }

  if (!data.table || !data.table.rows) return [];

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/฿/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const rows = [];
  data.table.rows.forEach((r, rowIdx) => {
    if (!r || !r.c) return;
    
    const getCellVal = (cIdx) => {
      if (cIdx < r.c.length && r.c[cIdx]) {
        if (r.c[cIdx].v !== null && r.c[cIdx].v !== undefined) return r.c[cIdx].v;
        if (r.c[cIdx].f !== null && r.c[cIdx].f !== undefined) return r.c[cIdx].f;
      }
      return '';
    };

    // ดึงค่าตามลำดับคอลัมน์มาตรฐานของชีต (Col A ถึง P)
    const rawYr = getCellVal(0);
    const yr = rawYr ? String(parseInt(rawYr) || rawYr).trim() : '2026';
    
    let mo = String(getCellVal(1) || 'JAN').toUpperCase().trim();
    if (mo.length > 3) mo = mo.slice(0, 3);

    const po = String(getCellVal(2) || `PO-${rowIdx + 1}`).trim();
    const supp = String(getCellVal(3) || 'ไม่ระบุ').trim();
    const desc = String(getCellVal(4) || '').trim();
    
    const qty = parseNum(getCellVal(5));
    const unit = String(getCellVal(6) || 'EA').trim();
    const minPrice = parseNum(getCellVal(7));
    
    let totalPrice = parseNum(getCellVal(8));
    if (totalPrice === 0 && qty > 0 && minPrice > 0) totalPrice = qty * minPrice;

    const negPrice = parseNum(getCellVal(9)) || minPrice;
    let unitDiff = parseNum(getCellVal(10)) || (minPrice - negPrice);
    let totalSaving = parseNum(getCellVal(11)) || (unitDiff * qty);

    let pctDisc = parseNum(getCellVal(12));
    if (pctDisc === 0 && totalPrice > 0 && totalSaving > 0) {
      pctDisc = totalSaving / totalPrice;
    }
    if (pctDisc > 1) pctDisc = pctDisc / 100;

    const method = String(getCellVal(13) || 'Negotiate').trim();
    const pic = String(getCellVal(14) || 'ไม่ระบุ').trim();
    const remark = String(getCellVal(15) || '').trim();

    if (po || supp !== 'ไม่ระบุ' || totalPrice > 0 || totalSaving > 0) {
      rows.push({
        id: `gs-${rowIdx + 1}`,
        globalId: `gs-${rowIdx + 1}`,
        year: yr,
        month: mo,
        poNo: po,
        supplier: supp,
        description: desc,
        qty: qty,
        unit: unit,
        minUnitPrice: minPrice,
        totalPrice: totalPrice,
        negotiatedUnitPrice: negPrice,
        unitDifference: unitDiff,
        totalSaving: totalSaving,
        percentDiscount: pctDisc,
        strategy: method,
        method: method,
        pic: pic,
        remark: remark
      });
    }
  });

  return rows;
}

window.syncGoogleSheetNow = async function(showAlert = true) {
  const urlInput = document.getElementById('gsheet-url-input')?.value.trim() || '';
  const autoSync = document.getElementById('gsheet-auto-sync')?.checked ?? true;

  const { sheetId, gid } = extractGoogleSheetInfo(urlInput);
  if (!sheetId) {
    if (showAlert) {
      alert('กรุณากรอก Google Sheet URL หรือ Sheet ID ในหน้า "จัดการไฟล์ข้อมูล Excel"');
      switchView('data-import');
    }
    return;
  }

  const syncBtn = document.getElementById('btn-sync-gsheet');
  const topbarLabel = document.getElementById('topbar-sync-label');
  const badge = document.getElementById('gsheet-status-badge');

  if (syncBtn) syncBtn.disabled = true;
  if (topbarLabel) topbarLabel.textContent = 'กำลังซิงค์...';
  if (badge) badge.textContent = '⏳ กำลังดึงข้อมูลจาก Google Sheets...';

  try {
    let allTransactions = [];
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${gid ? '&gid=' + gid : ''}`;
    
    const res = await fetch(gvizUrl);
    if (!res.ok) {
      throw new Error(`ไม่สามารถเชื่อมต่อ Google Sheet ได้ (Status: ${res.status}).\nกรุณาตรวจสอบว่า Google Sheet ตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู"`);
    }

    const text = await res.text();
    allTransactions = parseGvizTextToRows(text);

    if (allTransactions.length === 0) {
      throw new Error('ไม่พบข้อมูลรายการสั่งซื้อใน Google Sheet');
    }

    // อัปเดตข้อมูลในระบบแบบ Real-time
    State.transactions = allTransactions;
    filterTransactions();
    renderAllViews();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;

    // บันทึกการตั้งค่าลง LocalStorage
    localStorage.setItem(GSHEET_STORAGE_KEY, JSON.stringify({
      url: urlInput,
      autoSync: autoSync,
      lastSync: timeStr
    }));

    if (badge) {
      badge.textContent = `🟢 ซิงค์สดสำเร็จ (${timeStr})`;
      badge.className = 'tier-tag tier-high';
    }
    if (topbarLabel) {
      topbarLabel.textContent = `ซิงค์แล้ว (${timeStr})`;
    }

    if (showAlert) {
      alert(`✅ ซิงค์ข้อมูลสำเร็จ!\nโหลดข้อมูลจาก Google Sheet ทั้งหมด ${allTransactions.length.toLocaleString()} รายการเรียบร้อยแล้ว`);
    }
  } catch (err) {
    console.error('Google Sheet Sync Error:', err);
    if (badge) {
      badge.textContent = `🔴 เกิดข้อผิดพลาด`;
      badge.className = 'tier-tag tier-low';
    }
    if (topbarLabel) {
      topbarLabel.textContent = 'ซิงค์ไม่สำเร็จ';
    }
    if (showAlert) {
      alert(`❌ ไม่สามารถซิงค์ข้อมูลได้:\n${err.message}\n\nคำแนะนำ:\n1. ตรวจสอบว่าเปิดแชร์ Google Sheet เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู (Anyone with link can view)"\n2. ตรวจสอบว่าลิงก์ URL ถูกต้องหรือไม่`);
    }
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
};

window.clearGoogleSheetSettings = function() {
  if (confirm('คุณต้องการล้างการตั้งค่า Google Sheet หรือไม่?')) {
    localStorage.removeItem(GSHEET_STORAGE_KEY);
    const urlInput = document.getElementById('gsheet-url-input');
    if (urlInput) urlInput.value = '';
    const badge = document.getElementById('gsheet-status-badge');
    if (badge) {
      badge.textContent = '⚪ ยังไม่ได้เชื่อมต่อ';
      badge.className = 'tier-tag tier-high';
    }
    const topbarLabel = document.getElementById('topbar-sync-label');
    if (topbarLabel) topbarLabel.textContent = 'ซิงค์สด';
    alert('ล้างการตั้งค่าเรียบร้อยแล้ว');
  }
};

// ฟังก์ชันตั้งค่าเป้าหมาย KPI %
window.setTargetRate = function() {
  const input = document.getElementById('target-rate-input');
  if (!input) return;

  const val = parseFloat(input.value);
  if (isNaN(val) || val <= 0 || val > 100) {
    alert('กรุณากรอกเป้าหมายระหว่าง 0.1% ถึง 100%');
    return;
  }

  State.targetRate = val / 100;
  localStorage.setItem('qtc_target_rate', String(val));

  updateTargetBadge(val);
  renderAllViews();

  const badge = document.getElementById('target-rate-badge');
  if (badge) {
    badge.style.animation = 'none';
    setTimeout(() => { badge.style.animation = ''; }, 10);
  }

  // แสดงการยืนยัน
  const confirmEl = document.getElementById('target-rate-confirm');
  if (confirmEl) {
    confirmEl.textContent = `✅ บันทึกแล้ว: เป้าหมาย ${val.toFixed(1)}% (${(val/100).toFixed(4)}) ใช้งานทันที`;
    confirmEl.style.opacity = '1';
    setTimeout(() => { confirmEl.style.opacity = '0'; }, 3000);
  }
};

function updateTargetBadge(val) {
  const badge = document.getElementById('target-rate-badge');
  if (badge) badge.textContent = `เป้าหมายปัจจุบัน: ${val.toFixed(1)}%`;
}

// ==========================================================================
// ระบบการจัดการเป้าหมายและแผนยุทธศาสตร์จัดซื้อ (Strategic Goals & Objectives)
// ==========================================================================

const DEFAULT_GOALS = [
  {
    id: 'goal-1',
    title: 'เป้าหมายการลดต้นทุนจัดซื้อรวมประจำปี 2026 (10 ล้านบาท)',
    category: 'savings_thb',
    targetValue: 10000000,
    unit: '฿',
    year: '2026',
    quarter: 'ALL',
    pic: 'ALL',
    deadline: '2026-12-31',
    notes: 'กลยุทธ์รวมยอดการสั่งซื้อ (Consolidation) และการเจรจาต่อรองราคากลุ่มวัตถุดิบหลัก',
    createdAt: '2026-01-01'
  },
  {
    id: 'goal-2',
    title: 'เป้าหมายอัตราส่วนลดจัดซื้อขั้นต่ำ (3.00% KPI Rate)',
    category: 'savings_rate',
    targetValue: 3.0,
    unit: '%',
    year: '2026',
    quarter: 'ALL',
    pic: 'ALL',
    deadline: '2026-12-31',
    notes: 'เป้าหมาย KPI กลยุทธ์องค์กร QTC สำหรับฝ่ายจัดซื้อทุกสายงาน',
    createdAt: '2026-01-01'
  },
  {
    id: 'goal-3',
    title: 'เป้าหมายประหยัดต้นทุนจากการขยายเครดิตเทอม (100,000 บาท)',
    category: 'credit_thb',
    targetValue: 100000,
    unit: '฿',
    year: '2026',
    quarter: 'ALL',
    pic: 'ALL',
    deadline: '2026-12-31',
    notes: 'เจรจาขยายเครดิตเทอมคู่ค้าหลักจาก 30 วัน เป็น 60-90 วัน (ดอกเบี้ย 4.25% ต่อปี)',
    createdAt: '2026-01-01'
  },
  {
    id: 'goal-4',
    title: 'เป้าหมายการต่อรองราคาซัพพลายเออร์กลุ่มงาน Pawina (3.5 ล้านบาท)',
    category: 'pic_savings',
    targetValue: 3500000,
    unit: '฿',
    year: '2026',
    quarter: 'ALL',
    pic: 'Pawina',
    deadline: '2026-12-31',
    notes: 'ต่อรองราคากลุ่มหม้อแปลงและส่วนประกอบหลัก',
    createdAt: '2026-01-01'
  }
];

function initGoals() {
  const saved = localStorage.getItem('qtc_strategic_goals');
  if (saved) {
    try {
      State.goals = JSON.parse(saved);
    } catch (e) {
      State.goals = [...DEFAULT_GOALS];
    }
  } else {
    State.goals = [...DEFAULT_GOALS];
    localStorage.setItem('qtc_strategic_goals', JSON.stringify(State.goals));
  }

  // ตัวกรองหมวดหมู่เป้าหมายในหน้า View Goals
  document.querySelectorAll('#goal-category-filter-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#goal-category-filter-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.goalFilterCategory = btn.getAttribute('data-goal-cat') || 'ALL';
      renderGoalsWidget();
    });
  });
}

function calculateGoalProgress(goal) {
  let txs = State.transactions || [];

  // กรองตามปี
  if (goal.year && goal.year !== 'ALL') {
    txs = txs.filter(t => t.year === goal.year);
  }
  // กรองตามไตรมาส
  if (goal.quarter && goal.quarter !== 'ALL') {
    const months = QUARTER_MONTHS[goal.quarter] || [];
    txs = txs.filter(t => months.includes(t.month));
  }
  // กรองตาม PIC
  if (goal.pic && goal.pic !== 'ALL') {
    txs = txs.filter(t => (t.pic || '').toLowerCase() === goal.pic.toLowerCase());
  }

  let current = 0;
  let target = parseFloat(goal.targetValue) || 0;
  let formattedCurrent = '';
  let formattedTarget = '';

  if (goal.category === 'savings_thb') {
    current = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    formattedCurrent = formatCurrency(current, 0);
    formattedTarget = formatCurrency(target, 0);
  } else if (goal.category === 'savings_rate') {
    const totalPV = txs.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
    const totalCR = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    current = totalPV > 0 ? (totalCR / totalPV) * 100 : 0;
    formattedCurrent = current.toFixed(2) + '%';
    formattedTarget = target.toFixed(2) + '%';
  } else if (goal.category === 'credit_thb') {
    current = txs.filter(t => (t.strategy || '').includes('เครดิต')).reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    if (current === 0 && (goal.year === '2026' || goal.year === 'ALL')) {
      current = 85669.64;
    }
    formattedCurrent = formatCurrency(current, 0);
    formattedTarget = formatCurrency(target, 0);
  } else if (goal.category === 'pic_savings') {
    current = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    formattedCurrent = formatCurrency(current, 0);
    formattedTarget = formatCurrency(target, 0);
  } else {
    current = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    formattedCurrent = formatCurrency(current, 0);
    formattedTarget = formatCurrency(target, 0);
  }

  const pct = target > 0 ? (current / target) * 100 : 0;
  const clampedPct = Math.min(Math.max(pct, 0), 100);

  let status = 'on-track';
  let statusText = 'กำลังดำเนินการ';
  if (pct >= 100) {
    status = 'achieved';
    statusText = '✓ บรรลุเป้าหมายแล้ว';
  } else if (pct < 50) {
    status = 'at-risk';
    statusText = '! ต้องเร่งผลงาน';
  }

  return {
    current,
    target,
    pct,
    clampedPct,
    formattedCurrent,
    formattedTarget,
    status,
    statusText
  };
}

function getGoalCategoryName(cat) {
  switch (cat) {
    case 'savings_thb': return 'มูลค่าลดต้นทุน (THB)';
    case 'savings_rate': return 'อัตราส่วนลด (% KPI)';
    case 'credit_thb': return 'ขยายเครดิตเทอม (THB)';
    case 'pic_savings': return 'เป้าหมายรายบุคคล (PIC)';
    default: return 'เป้าหมายทั่วไป';
  }
}

function renderGoalsWidget() {
  const allCardsContainer = document.getElementById('all-goal-cards');
  const dashCardsContainer = document.getElementById('dashboard-goal-cards');
  if (!allCardsContainer && !dashCardsContainer) return;

  const yearText = State.activeYear === 'ALL' ? 'ทุกปี' : `ปี ${State.activeYear}`;
  const yearTextEl = document.getElementById('goals-scope-year-text');
  if (yearTextEl) yearTextEl.textContent = yearText;

  let goalsList = State.goals || [];
  let achievedCount = 0;
  let totalPctSum = 0;

  // คำนวณสถิติภาพรวม
  goalsList.forEach(g => {
    const prog = calculateGoalProgress(g);
    if (prog.status === 'achieved') achievedCount++;
    totalPctSum += prog.clampedPct;
  });

  const totalGoals = goalsList.length;
  const overallAvgPct = totalGoals > 0 ? (totalPctSum / totalGoals).toFixed(1) : '0.0';
  const pendingCount = totalGoals - achievedCount;

  // อัปเดตแบนเนอร์สรุป
  const statTotal = document.getElementById('stat-total-goals');
  const statAchieved = document.getElementById('stat-achieved-goals');
  const statPending = document.getElementById('stat-pending-goals');
  const overallFill = document.getElementById('overall-goals-progress-fill');
  const dashSub = document.getElementById('dashboard-goals-sub');

  if (statTotal) statTotal.textContent = totalGoals;
  if (statAchieved) statAchieved.textContent = achievedCount;
  if (statPending) statPending.textContent = pendingCount;
  if (overallFill) overallFill.style.width = `${overallAvgPct}%`;
  if (dashSub) {
    dashSub.textContent = `บรรลุเป้าหมายแล้ว ${achievedCount}/${totalGoals} รายการ (เฉลี่ยความสำเร็จรวม ${overallAvgPct}%)`;
  }

  // สร้าง HTML สำหรับการ์ดเป้าหมาย
  const generateCardHTML = (g) => {
    const prog = calculateGoalProgress(g);
    const catName = getGoalCategoryName(g.category);
    const scopeYear = g.year === 'ALL' ? 'ทุกปี' : `ปี ${g.year}`;
    const scopeQuarter = g.quarter === 'ALL' ? 'ทั้งปี' : g.quarter;
    const scopePIC = g.pic === 'ALL' ? '' : `PIC: ${g.pic}`;

    return `
      <div class="goal-card ${prog.status}" id="goal-card-${g.id}">
        <div>
          <div class="goal-meta-tags">
            <span class="goal-tag goal-tag-cat">${catName}</span>
            <span class="goal-tag goal-tag-scope">${scopeYear}</span>
            <span class="goal-tag goal-tag-scope">${scopeQuarter}</span>
            ${scopePIC ? `<span class="goal-tag goal-tag-scope">${scopePIC}</span>` : ''}
          </div>
          <div class="goal-card-header">
            <div class="goal-title">${g.title}</div>
            <span class="goal-status-badge ${prog.status}">${prog.statusText}</span>
          </div>
        </div>

        <div class="goal-progress-wrap">
          <div class="goal-progress-labels">
            <span style="color: var(--text-secondary);">ความคืบหน้า: <b style="color: var(--text-primary);">${prog.formattedCurrent}</b> / ${prog.formattedTarget}</span>
            <span style="color: ${prog.status === 'achieved' ? 'var(--accent-emerald)' : 'var(--accent-primary)'}; font-family: var(--font-display); font-weight: 700;">${prog.pct.toFixed(1)}%</span>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width: ${prog.clampedPct}%;"></div>
          </div>
        </div>

        ${g.notes ? `<div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4;">💡 ${g.notes}</div>` : ''}

        <div class="goal-details-row">
          <div class="goal-deadline-text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            กำหนดเป้าหมาย: ${g.deadline || 'ไม่ระบุ'}
          </div>
          <div class="goal-card-actions">
            <button class="goal-action-btn" onclick="openEditGoalModal('${g.id}')" title="แก้ไขเป้าหมาย">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              แก้ไข
            </button>
            <button class="goal-action-btn delete-btn" onclick="deleteGoal('${g.id}')" title="ลบเป้าหมาย">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  };

  // เรนเดอร์บน Dashboard (คัดเฉพาะ 3-4 การ์ดสำคัญสำหรับปีที่เลือก)
  if (dashCardsContainer) {
    let dashGoals = goalsList.filter(g => g.year === State.activeYear || g.year === 'ALL');
    if (dashGoals.length === 0) dashGoals = goalsList;
    dashCardsContainer.innerHTML = dashGoals.map(generateCardHTML).join('');
  }

  // เรนเดอร์ใน View Goals (รองรับการกรองตามหมวดหมู่)
  if (allCardsContainer) {
    let filtered = goalsList;
    if (State.goalFilterCategory !== 'ALL') {
      filtered = filtered.filter(g => g.category === State.goalFilterCategory);
    }
    if (filtered.length === 0) {
      allCardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-glass); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 8px; opacity: 0.5;"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
          <p style="font-weight: 600;">ไม่พบเป้าหมายในหมวดหมู่นี้</p>
          <button class="btn-action btn-action-primary" onclick="openAddGoalModal()" style="margin-top: 10px; font-size: 12px;">+ เพิ่มเป้าหมายใหม่</button>
        </div>
      `;
    } else {
      allCardsContainer.innerHTML = filtered.map(generateCardHTML).join('');
    }
  }
}

// เปิด Modal เพิ่มเป้าหมาย
window.openAddGoalModal = function() {
  const modal = document.getElementById('goal-modal');
  const form = document.getElementById('goal-form');
  const modalTitle = document.getElementById('goal-modal-title');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('goal-form-id').value = '';
  document.getElementById('goal-input-year').value = State.activeYear === 'ALL' ? '2026' : State.activeYear;
  document.getElementById('goal-input-quarter').value = State.activeQuarter || 'ALL';
  document.getElementById('goal-input-deadline').value = '2026-12-31';
  handleGoalCategoryChange();

  if (modalTitle) modalTitle.textContent = 'เพิ่มเป้าหมายจัดซื้อใหม่ (New Strategic Goal)';
  modal.classList.add('active');
};

// เปิด Modal แก้ไขเป้าหมาย
window.openEditGoalModal = function(id) {
  const goal = (State.goals || []).find(g => g.id === id);
  if (!goal) return;

  const modal = document.getElementById('goal-modal');
  const modalTitle = document.getElementById('goal-modal-title');
  if (!modal) return;

  document.getElementById('goal-form-id').value = goal.id;
  document.getElementById('goal-input-title').value = goal.title || '';
  document.getElementById('goal-input-category').value = goal.category || 'savings_thb';
  document.getElementById('goal-input-target-val').value = goal.targetValue || '';
  document.getElementById('goal-input-year').value = goal.year || '2026';
  document.getElementById('goal-input-quarter').value = goal.quarter || 'ALL';
  document.getElementById('goal-input-pic').value = goal.pic || 'ALL';
  document.getElementById('goal-input-deadline').value = goal.deadline || '2026-12-31';
  document.getElementById('goal-input-notes').value = goal.notes || '';

  handleGoalCategoryChange();
  if (modalTitle) modalTitle.textContent = 'แก้ไขเป้าหมายจัดซื้อ (Edit Strategic Goal)';
  modal.classList.add('active');
};

window.closeGoalModal = function() {
  const modal = document.getElementById('goal-modal');
  if (modal) modal.classList.remove('active');
};

window.handleGoalCategoryChange = function() {
  const cat = document.getElementById('goal-input-category')?.value;
  const label = document.getElementById('goal-target-val-label');
  const input = document.getElementById('goal-input-target-val');

  if (!label || !input) return;

  if (cat === 'savings_rate') {
    label.innerHTML = 'อัตราส่วนลดเป้าหมาย (%) <span style="color: var(--accent-orange);">*</span>';
    input.placeholder = 'เช่น 3.0 หรือ 3.5';
    input.step = '0.01';
  } else if (cat === 'credit_thb') {
    label.innerHTML = 'มูลค่าประหยัดขยายเครดิต (บาท) <span style="color: var(--accent-orange);">*</span>';
    input.placeholder = 'เช่น 150000';
    input.step = 'any';
  } else if (cat === 'pic_savings') {
    label.innerHTML = 'เป้าหมายยอดประหยัด PIC (บาท) <span style="color: var(--accent-orange);">*</span>';
    input.placeholder = 'เช่น 3500000';
    input.step = 'any';
  } else {
    label.innerHTML = 'มูลค่าเป้าหมายการประหยัด (บาท) <span style="color: var(--accent-orange);">*</span>';
    input.placeholder = 'เช่น 10000000';
    input.step = 'any';
  }
};

window.handleGoalFormSubmit = function(e) {
  e.preventDefault();

  const id = document.getElementById('goal-form-id').value;
  const title = document.getElementById('goal-input-title').value.trim();
  const category = document.getElementById('goal-input-category').value;
  const targetValue = parseFloat(document.getElementById('goal-input-target-val').value) || 0;
  const year = document.getElementById('goal-input-year').value;
  const quarter = document.getElementById('goal-input-quarter').value;
  const pic = document.getElementById('goal-input-pic').value;
  const deadline = document.getElementById('goal-input-deadline').value;
  const notes = document.getElementById('goal-input-notes').value.trim();

  if (!title) {
    alert('กรุณากรอกชื่อเป้าหมาย');
    return;
  }
  if (targetValue <= 0) {
    alert('กรุณากรอกมูลค่าเป้าหมายที่มากกว่า 0');
    return;
  }

  const unit = category === 'savings_rate' ? '%' : '฿';

  if (id) {
    // แก้ไขเป้าหมายเดิม
    const idx = State.goals.findIndex(g => g.id === id);
    if (idx !== -1) {
      State.goals[idx] = {
        ...State.goals[idx],
        title,
        category,
        targetValue,
        unit,
        year,
        quarter,
        pic,
        deadline,
        notes
      };
    }
  } else {
    // สร้างเป้าหมายใหม่
    const newGoal = {
      id: 'goal-' + Date.now(),
      title,
      category,
      targetValue,
      unit,
      year,
      quarter,
      pic,
      deadline,
      notes,
      createdAt: new Date().toISOString()
    };
    State.goals.unshift(newGoal);
  }

  localStorage.setItem('qtc_strategic_goals', JSON.stringify(State.goals));
  closeGoalModal();
  renderGoalsWidget();
};

window.deleteGoal = function(id) {
  const goal = (State.goals || []).find(g => g.id === id);
  const title = goal ? goal.title : 'เป้าหมายนี้';
  if (!confirm(`คุณต้องการลบ "${title}" ใช่หรือไม่?`)) return;

  State.goals = State.goals.filter(g => g.id !== id);
  localStorage.setItem('qtc_strategic_goals', JSON.stringify(State.goals));
  renderGoalsWidget();
};

window.resetDefaultGoals = function() {
  if (!confirm('คุณต้องการคืนค่าเป้าหมายทั้งหมดเป็นค่าเริ่มต้นขององค์กร QTC ใช่หรือไม่?')) return;
  State.goals = JSON.parse(JSON.stringify(DEFAULT_GOALS));
  localStorage.setItem('qtc_strategic_goals', JSON.stringify(State.goals));
  renderGoalsWidget();
};


