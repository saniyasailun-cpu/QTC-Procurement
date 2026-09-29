/**
 * ==========================================================================
 * ระบบแดชบอร์ดติดตาม KPI การลดต้นทุนจัดซื้อและส่วนลดซัพพลายเออร์
 * Procurement KPI & Supplier Discount Management Engine (Dynamic & Responsive)
 * ==========================================================================
 */

const IS_GITHUB_PAGES = location.hostname.endsWith('.github.io');
const LIVE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1iVgKgCdQRCz4_Vo1mdmM38xJHQI4B5mzKx7aJ9oBKn0/edit?gid=543596522#gid=543596522';

// สถานะการทำงานของระบบ (Application Global State)
const State = {
  data: null,
  dataQuality: null,
  activeYear: '2026',
  activeMonth: 'ALL',
  activeQuarter: 'ALL',
  activeView: 'dashboard',
  chartMode: 'bar', // 'bar' | 'curve'
  theme: localStorage.getItem('app-theme') || 'light',
  targetRate: (() => {
    const raw = localStorage.getItem('qtc_target_rate');
    if (!raw) return 0.03;
    let n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return 0.03;
    if (n > 0 && n <= 0.1) n = n * 100; // แปลงกรณีใส่ 0.03 ให้เป็น 3.0%
    return (n >= 0.1 && n <= 100) ? n / 100 : 0.03;
  })(),
  
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

// การตั้งค่าความสมูทของ Chart.js ทั่วทั้งระบบ (Low Cortisol Smooth Transitions)
if (typeof Chart !== 'undefined') {
  Chart.defaults.animation.duration = 750;
  Chart.defaults.animation.easing = 'easeOutQuart';
  Chart.defaults.elements.line.tension = 0.35;
}

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

// จานสีที่โดดเด่น คมชัด แตกต่างกันอย่างชัดเจน ไม่ซ้ำกัน (Distinct Multi-Hue Color Palette)
const DISTINCT_PALETTE = [
  '#0284c7', // 1. Sky/Ocean Blue
  '#10b981', // 2. Emerald Green
  '#f59e0b', // 3. Amber Gold
  '#8b5cf6', // 4. Royal Violet
  '#ec4899', // 5. Rose Pink
  '#06b6d4', // 6. Vibrant Cyan
  '#f97316', // 7. Sunset Orange
  '#84cc16', // 8. Lime Green
  '#d946ef', // 9. Fuchsia Magenta
  '#6366f1', // 10. Deep Indigo
  '#14b8a6', // 11. Teal
  '#ef4444', // 12. Crimson Coral
  '#3b82f6', // 13. Cobalt Blue
  '#eab308', // 14. Golden Yellow
  '#a855f7', // 15. Bright Purple
  '#059669', // 16. Forest Mint
  '#fb7185', // 17. Coral Blush
  '#38bdf8'  // 18. Electric Cyan
];

// สีประจำ 12 เดือน ให้มีสีที่แตกต่างกันชัดเจนครบทุกเดือน (12 Distinct Months Palette)
const MONTH_COLOR_MAP = {
  'JAN': '#0284c7', // ม.ค. - Ocean Blue
  'FEB': '#06b6d4', // ก.พ. - Vivid Cyan
  'MAR': '#10b981', // มี.ค. - Emerald Green
  'APR': '#84cc16', // เม.ย. - Lime Green
  'MAY': '#eab308', // พ.ค. - Amber Yellow
  'JUN': '#f97316', // มิ.ย. - Sunset Orange
  'JUL': '#ef4444', // ก.ค. - Crimson Red
  'AUG': '#ec4899', // ส.ค. - Rose Pink
  'SEP': '#d946ef', // ก.ย. - Fuchsia Magenta
  'OCT': '#8b5cf6', // ต.ค. - Royal Violet
  'NOV': '#6366f1', // พ.ย. - Indigo Blue
  'DEC': '#14b8a6'  // ธ.ค. - Teal
};

// สีประจำกลยุทธ์การจัดซื้อ (Dedicated Strategy Colors)
const STRATEGY_COLOR_MAP = {
  'Negotiate': '#0284c7',
  'Compare + Negotiate': '#10b981',
  'Avoidance': '#8b5cf6',
  'Rebate': '#f59e0b',
  'เพิ่มเครดิต': '#ec4899',
  'Credit Extension': '#ec4899',
  'Change Spec': '#06b6d4',
  'Change Supplier': '#f97316',
  'Volume Discount': '#84cc16',
  'Direct Import': '#d946ef',
  'Contract Term': '#6366f1'
};

// สีประจำเจ้าหน้าที่จัดซื้อ (Dedicated PIC Colors)
const PIC_COLOR_MAP = {
  'Pawina': '#0284c7',
  'Tanida': '#10b981',
  'Yuwanit': '#f59e0b',
  'Dusit': '#8b5cf6',
  'Saniya': '#ec4899'
};

// เริ่มต้นการทำงานเมื่อโหลดหน้าเสร็จ
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('svg').forEach(svg => {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  });

  if (IS_GITHUB_PAGES) {
    document.body.classList.add('static-host');
    document.querySelectorAll('[data-static-hide]').forEach(el => { el.hidden = true; });
  }

  // โหลดเป้าหมายที่บันทึกไว้
  const savedRate = IS_GITHUB_PAGES ? null : localStorage.getItem('qtc_target_rate');
  const rateInput = document.getElementById('target-rate-input');
  let currentVal = 3.0;
  if (savedRate) {
    let parsed = parseFloat(savedRate);
    if (!isNaN(parsed) && parsed > 0) {
      if (parsed > 0 && parsed <= 0.1) parsed = parsed * 100;
      if (parsed >= 0.1 && parsed <= 100) currentVal = parsed;
    }
  }
  State.targetRate = currentVal / 100;
  if (rateInput) rateInput.value = currentVal.toFixed(1);
  updateTargetBadge(currentVal);

  initTheme();
  initGoals();
  await loadData();
  initNavigation();
  initFilterPills();
  initTableEvents();
  initSupplierEvents();
  initSimulators();
  applyWorkbookSimulatorInputs();
  if (!IS_GITHUB_PAGES) {
    initDropzone();
    initGlobalDragAndDrop();
  }
  await initGoogleSheetSync();

  // ปิด Modal ด้วยปุ่ม ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeTxModal(); closeGoalChartModal(); }
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
async function loadData() {
  if (IS_GITHUB_PAGES) {
    try {
      const json = window.KPI_DATA || await fetch(`data.json?_t=${Date.now()}`, { cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error(`data.json status ${res.status}`);
        return res.json();
      });
      window.KPI_DATA = json;
      State.data = json;
      setupDataset();
      renderAllViews();
    } catch (err) {
      console.error('Static fallback data failed:', err);
    }
    return;
  }

  // 1. ตรวจสอบข้อมูลล่าสุดจาก Backend API (/api/data) เป็นอันดับแรก (ป้องกันแคชเบราว์เซอร์ 100%)
  try {
    const res = await fetch(`/api/data?_t=${Date.now()}`, { 
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const json = await res.json();
      if (json && (json.recentTransactions || json.historicalTransactions)) {
        window.KPI_DATA = json;
        State.data = json;
        try {
          localStorage.setItem('qtc_custom_dataset', JSON.stringify(json));
        } catch (e) {}
        setupDataset();
        renderAllViews();
        console.log('✅ โหลดข้อมูลชุดล่าสุดจาก Backend ถาวรสำเร็จ (ทุกคนเห็นข้อมูลเดียวกัน)');
        return;
      }
    }
  } catch (err) {
    console.log('Backend /api/data not available, checking local cache or data.js');
  }

  // 2. ตรวจสอบข้อมูลจาก LocalStorage (หากเคยอัปโหลดไฟล์ Excel ไว้)
  try {
    const localSaved = localStorage.getItem('qtc_custom_dataset');
    if (localSaved) {
      const json = JSON.parse(localSaved);
      if (json && (json.recentTransactions || json.historicalTransactions)) {
        window.KPI_DATA = json;
        State.data = json;
        setupDataset();
        renderAllViews();
        console.log('✅ โหลดข้อมูลจาก LocalStorage Cache สำเร็จ');
        return;
      }
    }
  } catch (err) {
    console.warn('LocalStorage data parse failed:', err);
  }

  // 3. ใช้ window.KPI_DATA จากไฟล์ data.js
  if (window.KPI_DATA) {
    State.data = window.KPI_DATA;
    setupDataset();
    renderAllViews();
    return;
  }

  // 4. กรณี window.KPI_DATA ยังไม่โหลด (เช่น บน GitHub Pages หรือโฮสต์ภายนอก)
  try {
    const res = await fetch(`data.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      window.KPI_DATA = json;
      State.data = json;
      setupDataset();
      renderAllViews();
      return;
    }
  } catch (err) {
    console.warn('Fallback data.json fetch failed:', err);
  }

  // 5. ลองตรวจสอบซ้ำเป็นระยะเผื่อสคริปต์ data.js โหลดช้า
  let attempts = 0;
  const pollTimer = setInterval(() => {
    attempts++;
    if (window.KPI_DATA) {
      clearInterval(pollTimer);
      State.data = window.KPI_DATA;
      setupDataset();
      renderAllViews();
    } else if (attempts >= 20) {
      clearInterval(pollTimer);
    }
  }, 100);
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
      remark: item.remark || remarkNote
    };
  });

  filterTransactions();

  // ป้องกันกรณีมีข้อมูลตกค้างของเดือนที่ยังไม่มีรายการสั่งซื้อจริงในปี 2026 (เช่น ก.ย. เป็นต้นไป)
  if (State.data.monthlySummary && !State.data.workbookSource) {
    const active2026Months = new Set(
      State.transactions.filter(t => t.year === '2026').map(t => t.month)
    );
    State.data.monthlySummary.forEach(ms => {
      if (!active2026Months.has(ms.month)) {
        ms.pv2026 = 0;
        ms.cr2026 = 0;
        ms.target2026 = 0;
        ms.pct2026 = 0;
        ms.status2026 = '-';
        ms.savingVsTarget = 0;
        ms.pctDiffTarget = 0;
        ms.creditDiffDays = 0;
        ms.creditPOVal = 0;
        ms.creditSaving = 0;
      }
    });
  }
}

// ระบบสลับเมนู
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
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
    const isActive = el.getAttribute('data-view') === viewName;
    el.classList.toggle('active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  const titles = {
    'dashboard': { title: 'ภาพรวมผู้บริหาร', desc: 'สรุปผลการต่อรองลดต้นทุนจัดซื้อและติดตามผลการดำเนินงานตามเป้าหมาย' },
    'goals': { title: 'เป้าหมายและแผนยุทธศาสตร์', desc: 'กำหนดและติดตามเป้าหมายการลดต้นทุนจัดซื้อประจำปีและรายบุคคล' },
    'kpi-tracking': { title: 'สรุปผล KPI รายเดือน & รายปี', desc: 'เปรียบเทียบผลการประหยัดต้นทุนเทียบเป้าหมาย 3.0% ประจำปี' },
    'transactions': { title: 'รายการสั่งซื้อ & ส่วนลด (PO Data)', desc: 'ค้นหาและตรวจสอบรายการสั่งซื้อกว่า 5,800+ รายการ' },
    'suppliers': { title: 'การวิเคราะห์ข้อมูลคู่ค้า (ซัพพลายเออร์)', desc: 'สรุปยอดสั่งซื้อและมูลค่าส่วนลดที่ได้รับจากคู่ค้าแต่ละราย' },
    'pic-team': { title: 'สรุปผลงานทีมจัดซื้อรายบุคคล', desc: 'สถิติและกลยุทธ์การต่อรองของเจ้าหน้าที่จัดซื้อแต่ละท่าน' },
    'simulators': { title: 'โปรแกรมคำนวณ Kaizen & ขยายเครดิตเทอม', desc: 'เครื่องมือจำลองผลประหยัดเวลาและผลประโยชน์ทางการเงิน' },
    'data-import': { title: 'แหล่งข้อมูลและส่งออก', desc: 'ตรวจสอบการซิงค์ Google Sheet และดาวน์โหลดข้อมูลที่กำลังแสดง' }
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

  // ตัวกรองเดือนจริง (Real Month Filter Pills)
  document.querySelectorAll('#month-filter-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#month-filter-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeMonth = btn.getAttribute('data-month');
      renderAllViews();
    });
  });

  // ตัวกรองไตรมาสเดิม (Fallback สำหรับชุดคำสั่งเดิม)
  document.querySelectorAll('#quarter-filter-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quarter-filter-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeQuarter = btn.getAttribute('data-quarter');
      renderAllViews();
    });
  });
}

// ดึงรายการสั่งซื้อที่กรองตามปีและเดือนจริงที่เลือก
function getActiveScopeTransactions() {
  let list = State.transactions;
  if (State.activeYear !== 'ALL') {
    list = list.filter(t => t.year === State.activeYear);
  }
  if (State.activeMonth && State.activeMonth !== 'ALL') {
    list = list.filter(t => t.month === State.activeMonth);
  } else if (State.activeQuarter && State.activeQuarter !== 'ALL') {
    const allowedMonths = QUARTER_MONTHS[State.activeQuarter] || [];
    list = list.filter(t => allowedMonths.includes(t.month));
  }
  return list;
}

// คำนวณสรุปรายเดือนแบบไดนามิกสำหรับปีที่เลือก
function getMonthlyAggregatedData() {
  if (State.data?.workbookSource) {
    return MONTH_ORDER.map(month => {
      const periods = State.data.workbookSource.periods.filter(p => p.month === month && (State.activeYear === 'ALL' || p.year === State.activeYear));
      const pv = periods.reduce((s,p) => s + (p.purchase ?? 0), 0);
      const cr = periods.reduce((s,p) => s + p.savings, 0);
      const count = periods.reduce((s,p) => s + p.count, 0);
      const missingPurchase = periods.some(p => p.count > 0 && p.purchase === null);
      const pct = pv > 0 && !missingPurchase ? cr / pv : null;
      return { month, pv, cr, count, missingPurchase, partial: periods.some(p => p.partial), target: missingPurchase ? null : pv * State.targetRate,
        pct, isPassed: pct !== null && pct >= State.targetRate,
        creditSaving: periods.reduce((s,p) => s + p.creditSaving, 0),
        creditPOVal: periods.reduce((s,p) => s + p.creditPOVal, 0),
        creditDiffDays: periods.length === 1 ? periods[0].creditDiffDays : null };
    });
  }
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
  renderWorkbookSources();
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
  
  const rawPrev = el.dataset.currVal;
  cancelAnimationFrame(el._valueAnimationFrame);
  const start = rawPrev !== undefined ? (parseFloat(rawPrev) || 0) : 0;
  el.dataset.currVal = String(endValue);

  const duration = 650;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Cubic Out Easing curve for luxurious and low-cortisol smooth counting
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = start + (endValue - start) * easeProgress;

    if (isCurrency) el.textContent = formatCurrency(currentVal, decimals);
    else el.textContent = (currentVal * 100).toFixed(decimals) + '%';

    if (progress < 1) {
      el._valueAnimationFrame = requestAnimationFrame(update);
    } else {
      if (isCurrency) el.textContent = formatCurrency(endValue, decimals);
      else el.textContent = (endValue * 100).toFixed(decimals) + '%';
    }
  }

  el._valueAnimationFrame = requestAnimationFrame(update);
}

// -------------------------------------------------------------
// 1. ภาพรวมผู้บริหาร (DASHBOARD)
// -------------------------------------------------------------
function renderExecutiveDashboard() {
  const scopedTxs = getActiveScopeTransactions();
  const poCount = scopedTxs.length;

  const monthlyAgg = getMonthlyAggregatedData();
  const isMonthFiltered = State.activeMonth && State.activeMonth !== 'ALL';
  const isQuarterFiltered = State.activeQuarter && State.activeQuarter !== 'ALL';
  const targetMonths = isMonthFiltered
    ? [State.activeMonth]
    : (isQuarterFiltered ? (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER) : MONTH_ORDER);

  const scopedMonthly = (isMonthFiltered || isQuarterFiltered)
    ? monthlyAgg.filter(r => targetMonths.includes(r.month))
    : monthlyAgg;

  let totalPurchase = scopedMonthly.reduce((sum, r) => sum + r.pv, 0);
  let totalSavings = scopedMonthly.reduce((sum, r) => sum + r.cr, 0);

  // Fallback คำนวณจากรายการสั่งซื้อกรณีที่ไม่มีข้อมูล summary
  if (!State.data.workbookSource && totalPurchase === 0 && scopedTxs.length > 0) {
    scopedTxs.forEach(t => {
      totalPurchase += t.totalPrice;
      totalSavings += t.totalSaving;
    });
  }

  let totalCreditSavings = scopedMonthly.reduce((sum, m) => sum + (m.creditSaving || 0), 0);

  const savingRate = totalPurchase > 0 ? (totalSavings / totalPurchase) : 0;
  const targetRate = State.targetRate || 0.03;
  const isMet = savingRate >= targetRate;

  animateValue('kpi-total-savings', totalSavings, true, 2);
  const purchaseUnavailable = State.data.workbookSource && (scopedMonthly.some(r => r.missingPurchase) || totalPurchase <= 0);
  if (purchaseUnavailable) {
    const purchaseEl = document.getElementById('kpi-total-purchase');
    cancelAnimationFrame(purchaseEl._valueAnimationFrame);
    purchaseEl.textContent = '—';
  }
  else animateValue('kpi-total-purchase', totalPurchase, true, 2);

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
    targetBadge.textContent = 'ได้ตามเป้าหมาย';
    targetDiff.textContent = `+${((savingRate - targetRate) * 100).toFixed(2)}% สูงกว่าเป้าหมาย (${(targetRate * 100).toFixed(1)}%)`;
  } else {
    targetBadge.className = 'kpi-badge danger';
    targetBadge.textContent = 'ต่ำกว่าเป้าหมาย';
    targetDiff.textContent = `${((savingRate - targetRate) * 100).toFixed(2)}% ต่ำกว่าเป้าหมาย (${(targetRate * 100).toFixed(1)}%)`;
  }

  document.getElementById('kpi-credit-savings').textContent = formatCurrency(totalCreditSavings);
  if (scopedMonthly.some(r => r.partial)) {
    document.getElementById('kpi-purchase-mb').textContent = 'รวมยอดที่มีแล้ว · บางเดือนใช้ยอด PO แทนมูลค่าซื้อรวม';
    document.getElementById('kpi-savings-rate').textContent += ' · ชั่วคราว';
    targetBadge.textContent += ' · ชั่วคราว';
    targetDiff.textContent += ' · คำนวณจากข้อมูลที่มีแล้ว';
  }

  if (State.data.workbookSource && (scopedMonthly.some(r => r.missingPurchase) || totalPurchase <= 0)) {
    document.getElementById('kpi-savings-rate').textContent = 'รอมูลค่าซื้อรวม';
    document.getElementById('kpi-purchase-mb').textContent = 'มูลค่าซื้อรวมยังไม่ครบทุกเดือนที่มี PO';
    targetPctDisplay.textContent = '—';
    targetRateDisplay.textContent = 'ไม่พร้อมคำนวณ';
    targetBadge.textContent = 'ข้อมูลไม่ครบ';
    targetBadge.className = 'kpi-badge neutral';
    targetDiff.textContent = 'ยังไม่มีมูลค่าซื้อรวมครบช่วงที่เลือก';
    gaugeFill?.setAttribute('stroke-dasharray', '0, 100');
  }

  renderQuickInsight();
  renderMonthlyTrendChart();
  renderStrategyDonutChart(scopedTxs);
  renderCompactPICList(scopedTxs);
  renderCompactTopSuppliers(scopedTxs);
}

// -------------------------------------------------------------
// Quick Insight Analytical Engine (สรุปวิเคราะห์ด่วนอัจฉริยะตามข้อมูลจริง 100%)
// -------------------------------------------------------------
function renderQuickInsight(isManualTrigger = false) {
  const insightBox = document.getElementById('quick-insight-box');
  const scopeEl = document.getElementById('quick-insight-scope');
  const summaryEl = document.getElementById('quick-insight-summary');
  const chipsEl = document.getElementById('quick-insight-chips');
  const refreshBtn = document.querySelector('.quick-insight-refresh-btn');
  if (!insightBox || !summaryEl) return;

  if (isManualTrigger && refreshBtn) {
    refreshBtn.classList.add('rotating');
    setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
    summaryEl.style.opacity = '0.3';
    setTimeout(() => { summaryEl.style.opacity = '1'; }, 150);
  }

  const activeYear = State.activeYear;
  const activeMonth = State.activeMonth;
  const activeQuarter = State.activeQuarter;
  const scopedTxs = getActiveScopeTransactions();
  const monthlyAgg = getMonthlyAggregatedData();
  const targetRate = State.targetRate || 0.03;

  const isMonthFiltered = activeMonth && activeMonth !== 'ALL';
  const isQuarterFiltered = activeQuarter && activeQuarter !== 'ALL';
  const targetMonths = isMonthFiltered
    ? [activeMonth]
    : (isQuarterFiltered ? (QUARTER_MONTHS[activeQuarter] || MONTH_ORDER) : MONTH_ORDER);

  const scopedMonthly = (isMonthFiltered || isQuarterFiltered)
    ? monthlyAgg.filter(r => targetMonths.includes(r.month))
    : monthlyAgg;

  // คำนวณยอดจัดซื้อและยอดประหยัดที่ตรงกับ Executive Dashboard 100%
  let totalPurchase = scopedMonthly.reduce((sum, r) => sum + (r.pv || 0), 0);
  let totalSavings = scopedMonthly.reduce((sum, r) => sum + (r.cr || 0), 0);

  if (!State.data.workbookSource && totalPurchase === 0 && scopedTxs.length > 0) {
    scopedTxs.forEach(t => {
      totalPurchase += (t.totalPrice || 0);
      totalSavings += (t.totalSaving || 0);
    });
  }

  const savingRate = totalPurchase > 0 ? (totalSavings / totalPurchase) : 0;
  const isMet = savingRate >= targetRate;
  const rateDeltaPct = ((savingRate - targetRate) * 100).toFixed(2);
  const savingMB = (totalSavings / 1000000).toFixed(2);
  const purchaseMB = (totalPurchase / 1000000).toFixed(2);

  // ป้ายกำกับขอบเขตข้อมูล
  let scopeText = activeYear === 'ALL' ? 'ภาพรวมทุกปี' : formatYearBE(activeYear);
  if (isMonthFiltered) scopeText += ` • เดือน ${THAI_MONTHS[activeMonth] || activeMonth}`;
  else if (isQuarterFiltered) scopeText += ` • ไตรมาส ${activeQuarter}`;
  if (scopeEl) scopeEl.textContent = scopeText;
  if (State.data.workbookSource && scopedMonthly.some(r => r.missingPurchase)) {
    summaryEl.textContent = `ผลลดต้นทุนจาก PO ที่สมบูรณ์ ${formatCurrency(totalSavings)} · รอมูลค่าซื้อรวมครบช่วงที่เลือกเพื่อคำนวณ KPI · ตรวจสอบข้อแตกต่างได้ที่แหล่งข้อมูลและส่งออก`;
    if (chipsEl) chipsEl.replaceChildren();
    return;
  }

  // วิเคราะห์ผลงานรายไตรมาส
  const qStats = {
    Q1: { pv: 0, cr: 0, name: 'Q1' },
    Q2: { pv: 0, cr: 0, name: 'Q2' },
    Q3: { pv: 0, cr: 0, name: 'Q3' },
    Q4: { pv: 0, cr: 0, name: 'Q4' }
  };

  monthlyAgg.forEach(m => {
    let qKey = 'Q1';
    if (['APR', 'MAY', 'JUN'].includes(m.month)) qKey = 'Q2';
    else if (['JUL', 'AUG', 'SEP'].includes(m.month)) qKey = 'Q3';
    else if (['OCT', 'NOV', 'DEC'].includes(m.month)) qKey = 'Q4';

    qStats[qKey].pv += (m.pv || 0);
    qStats[qKey].cr += (m.cr || 0);
  });

  const validQuarters = Object.values(qStats)
    .filter(q => q.pv > 0)
    .map(q => ({
      ...q,
      rate: q.cr / q.pv,
      ratePct: ((q.cr / q.pv) * 100).toFixed(2),
      savingMB: (q.cr / 1000000).toFixed(2)
    }))
    .sort((a, b) => b.rate - a.rate);

  const topQuarter = validQuarters[0] || null;

  // วิเคราะห์เดือนที่ทำผลงานลดต้นทุนสูงสุด
  const validMonths = scopedMonthly
    .filter(m => m.pv > 0 && m.cr > 0)
    .map(m => ({
      ...m,
      ratePct: ((m.cr / m.pv) * 100).toFixed(2),
      savingMB: (m.cr / 1000000).toFixed(2),
      nameTH: THAI_MONTHS_SHORT[m.month] || m.month
    }))
    .sort((a, b) => (b.cr / b.pv) - (a.cr / a.pv));

  const topMonth = validMonths[0] || null;

  // วิเคราะห์กลยุทธ์หลักจากรายการสั่งซื้อจริง
  const strategyMap = {};
  let totalStrategySaving = 0;
  scopedTxs.forEach(t => {
    const strat = (t.strategy || 'Negotiate').trim();
    if (!strategyMap[strat]) strategyMap[strat] = { cr: 0, pv: 0, count: 0 };
    strategyMap[strat].cr += (t.totalSaving || 0);
    strategyMap[strat].pv += (t.totalPrice || 0);
    strategyMap[strat].count += 1;
    totalStrategySaving += (t.totalSaving || 0);
  });

  const sortedStrategies = Object.entries(strategyMap)
    .map(([name, val]) => ({
      name,
      ...val,
      pctOfTotal: totalStrategySaving > 0 ? (val.cr / totalStrategySaving) : 0,
      savingMB: (val.cr / 1000000).toFixed(2)
    }))
    .sort((a, b) => b.cr - a.cr);

  const topStrategy = sortedStrategies[0] || null;

  // วิเคราะห์ผู้รับผิดชอบหลัก
  const picMap = {};
  scopedTxs.forEach(t => {
    const p = (t.pic || 'ไม่ระบุ').trim();
    if (!picMap[p]) picMap[p] = { cr: 0, count: 0 };
    picMap[p].cr += (t.totalSaving || 0);
    picMap[p].count += 1;
  });

  const topPIC = Object.entries(picMap)
    .filter(([p]) => p !== 'ไม่ระบุ')
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.cr - a.cr)[0] || null;

  // สังเคราะห์ข้อความเชิงลึกที่แม่นยำตามข้อมูลจริง 100%
  let insightText = '';
  const currentRateStr = (savingRate * 100).toFixed(2);
  const targetRateStr = (targetRate * 100).toFixed(1);

  if (isMonthFiltered) {
    const stratNote = topStrategy ? ` ขับเคลื่อนหลักโดยกลยุทธ์ <em>"${topStrategy.name}"</em> (${(topStrategy.pctOfTotal * 100).toFixed(0)}%)` : '';
    const mName = THAI_MONTHS[activeMonth] || activeMonth;
    if (isMet) {
      insightText = `เดือน <strong>${mName}</strong> ทะลุเป้า KPI: อัตราลดต้นทุนแตะ <span class="highlight-metric">${currentRateStr}%</span> (ประหยัด ฿${savingMB}M จากยอดซื้อ ฿${purchaseMB}M)${stratNote}`;
    } else {
      insightText = `เดือน <strong>${mName}</strong> อัตราลดต้นทุนอยู่ที่ <span class="highlight-metric">${currentRateStr}%</span> (ประหยัด ฿${savingMB}M ขาดอีก ${Math.abs(Number(rateDeltaPct))}% สู่เป้า ${targetRateStr}%)${stratNote}`;
    }
  } else if (isQuarterFiltered) {
    const stratNote = topStrategy ? ` ขับเคลื่อนหลักโดยกลยุทธ์ <em>"${topStrategy.name}"</em> (${(topStrategy.pctOfTotal * 100).toFixed(0)}%)` : '';
    if (isMet) {
      insightText = `ไตรมาส <strong>${activeQuarter}</strong> ทะลุเป้า KPI: อัตราลดต้นทุนแตะ <span class="highlight-metric">${currentRateStr}%</span> (ประหยัด ฿${savingMB}M จากยอดซื้อ ฿${purchaseMB}M)${stratNote}`;
    } else {
      insightText = `ไตรมาส <strong>${activeQuarter}</strong> อัตราลดต้นทุนอยู่ที่ <span class="highlight-metric">${currentRateStr}%</span> (ประหยัด ฿${savingMB}M ขาดอีก ${Math.abs(Number(rateDeltaPct))}% สู่เป้า ${targetRateStr}%)${stratNote}`;
    }
  } else if (topMonth && (topMonth.cr / topMonth.pv) > targetRate && topStrategy) {
    insightText = `ผลงานเด่นในเดือน <strong>${topMonth.nameTH}</strong> อัตราลดต้นทุนสูงถึง <span class="highlight-metric">${topMonth.ratePct}%</span> (ประหยัด ฿${topMonth.savingMB}M) กลยุทธ์หลัก <em>"${topStrategy.name}"</em> ทำได้ ฿${topStrategy.savingMB}M (${(topStrategy.pctOfTotal * 100).toFixed(0)}% ของยอดรวม)`;
  } else if (isMet) {
    insightText = `ภาพรวมทำได้ตามเป้าหมาย: อัตราลดต้นทุนจริง <span class="highlight-metric">${currentRateStr}%</span> (<span class="highlight-metric">+${rateDeltaPct}%</span> เหนือเป้าหมาย KPI ${targetRateStr}%) ยอดประหยัดรวม ฿${savingMB} ล้านบาท`;
  } else {
    insightText = `อัตราลดต้นทุนรวมอยู่ที่ <span class="highlight-metric">${currentRateStr}%</span> จากยอดซื้อ ฿${purchaseMB}M (ต่ำกว่าเป้าหมาย KPI ${targetRateStr}% อยู่ ${Math.abs(Number(rateDeltaPct))}%) `;
  }

  // สร้างป้ายข้อมูลประกอบ (Chips)
  const chips = [];

  if (topMonth) {
    chips.push(`
      <span class="insight-chip chip-orange" title="เดือนที่ทำผลงานลดต้นทุนสูงสุด">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        <strong>Top: ${topMonth.nameTH} (${topMonth.ratePct}%)</strong>
      </span>
    `);
  }

  if (topStrategy) {
    chips.push(`
      <span class="insight-chip chip-accent" title="กลยุทธ์ที่สร้างผลประหยัดสูงสุด">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        <strong>${topStrategy.name}</strong> (${(topStrategy.pctOfTotal * 100).toFixed(0)}%)
      </span>
    `);
  }

  if (topPIC) {
    chips.push(`
      <span class="insight-chip" title="ผู้รับผิดชอบที่ทำผลงานลดต้นทุนสูงสุด">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <strong>${topPIC.name}</strong> (฿${(topPIC.cr / 1000000).toFixed(2)}M)
      </span>
    `);
  }

  chips.push(`
    <span class="insight-chip ${isMet ? 'chip-positive' : ''}" title="สถานะเทียบเป้าหมาย KPI">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      <strong>${isMet ? '+' : ''}${rateDeltaPct}%</strong> vs KPI
    </span>
  `);

  summaryEl.innerHTML = insightText + (scopedMonthly.some(r => r.partial) ? ' · KPI ชั่วคราว: บางเดือนใช้ยอด PO ที่บันทึกแล้วแทนมูลค่าซื้อรวม' : '');
  if (chipsEl) chipsEl.innerHTML = chips.join('');
}

window.renderQuickInsight = renderQuickInsight;

window.setChartMode = function(mode) {
  State.chartMode = mode;
  ['bar', 'curve'].forEach(chartMode => {
    const button = document.getElementById(`btn-chart-${chartMode}`);
    const isActive = mode === chartMode;
    button?.classList.toggle('active', isActive);
    button?.setAttribute('aria-selected', String(isActive));
  });
  renderMonthlyTrendChart();
};

function renderMonthlyTrendChart() {
  const ctx = document.getElementById('monthlyTrendChart')?.getContext('2d');
  if (!ctx) return;

  const rawMonthlyAgg = getMonthlyAggregatedData();
  const isMonthFiltered = State.activeMonth && State.activeMonth !== 'ALL';
  const isQuarterFiltered = State.activeQuarter && State.activeQuarter !== 'ALL';
  const targetMonths = isMonthFiltered
    ? [State.activeMonth]
    : (isQuarterFiltered ? (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER) : MONTH_ORDER);

  const monthlyAgg = (isMonthFiltered || isQuarterFiltered)
    ? rawMonthlyAgg.filter(r => targetMonths.includes(r.month))
    : rawMonthlyAgg;

  const monthLabelsThai = monthlyAgg.map(r => THAI_MONTHS_SHORT[r.month] || r.month);

  const totalPurchase = monthlyAgg.reduce((sum, row) => sum + row.pv, 0);
  const totalActual = monthlyAgg.reduce((sum, row) => sum + row.cr, 0);
  const totalTarget = monthlyAgg.reduce((sum, row) => sum + row.target, 0);
  const variance = totalActual - totalTarget;
  const hasData = monthlyAgg.some(row => row.pv > 0 || row.cr !== 0);
  const missingPurchase = monthlyAgg.some(row => row.missingPurchase);
  const partial = monthlyAgg.some(row => row.partial);
  const statusText = !hasData ? 'ยังไม่มีข้อมูล' : missingPurchase ? 'รอมูลค่าซื้อรวม' : `${variance >= 0 ? 'สูงกว่าเป้า' : 'ต่ำกว่าเป้า'}${partial ? ' · ชั่วคราว (ยอด PO)' : ''}`;
  const actualEl = document.getElementById('chart-actual-total');
  const targetEl = document.getElementById('chart-target-total');
  const varianceEl = document.getElementById('chart-variance-total');
  const statusEl = document.getElementById('chart-status-badge');
  const summaryEl = document.getElementById('monthly-chart-summary');

  if (actualEl) actualEl.textContent = formatCurrency(totalActual);
  if (targetEl) targetEl.textContent = missingPurchase || !hasData ? '—' : formatCurrency(totalTarget);
  if (varianceEl) varianceEl.textContent = missingPurchase || !hasData ? '—' : `${variance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(variance))}`;
  if (statusEl) {
    statusEl.textContent = statusText;
    statusEl.className = `chart-status-badge ${hasData && !missingPurchase ? (variance >= 0 ? 'is-positive' : 'is-negative') : ''}`;
  }
  if (summaryEl) {
    summaryEl.textContent = missingPurchase ? `ลดต้นทุนจริง ${formatCurrency(totalActual)} ยังไม่มีมูลค่าซื้อรวมครบช่วงที่เลือก จึงไม่คำนวณเป้าหมายและส่วนต่าง` : hasData
      ? `ยอดลดต้นทุนจริง ${formatCurrency(totalActual)} เป้าหมาย ${formatCurrency(totalTarget)} ${statusText} ${formatCurrency(Math.abs(variance))} จากมูลค่าสั่งซื้อ ${formatCurrency(totalPurchase)}`
      : 'ยังไม่มีข้อมูลผลลดต้นทุนสำหรับช่วงเวลาที่เลือก';
  }

  if (State.charts.monthlyTrend) {
    State.charts.monthlyTrend.destroy();
  }

  const isDark = State.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const rootStyles = getComputedStyle(document.documentElement);
  const actualColor = rootStyles.getPropertyValue('--accent-primary').trim() || '#0284c7';
  const targetColor = rootStyles.getPropertyValue('--qtc-orange').trim() || '#f97316';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chartAnimation = reducedMotion ? false : { duration: 350, easing: 'easeOutQuart' };
  const axisNumber = value => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 1 });

  if (State.chartMode === 'bar') {
    const costReductionMB = monthlyAgg.map(r => {
      if (r.pv === 0 && r.cr === 0) return null;
      return r.cr / 1000000;
    });
    const targetSavingsMB = monthlyAgg.map(r => (r.pv > 0 && !r.missingPurchase ? r.target / 1000000 : null));

    const validSavings = costReductionMB.filter(v => v !== null);
    const minSaving = validSavings.length > 0 ? Math.min(...validSavings) : 0;

    State.charts.monthlyTrend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthLabelsThai,
        datasets: [
          {
            type: 'bar',
            label: 'ลดต้นทุนจริง',
            data: costReductionMB,
            backgroundColor: costReductionMB.map(value => value !== null && value < 0 ? '#e11d48' : actualColor),
            borderRadius: 5,
            borderSkipped: false,
            maxBarThickness: 34,
            order: 1
          },
          {
            type: 'line',
            label: `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}%`,
            data: targetSavingsMB,
            borderColor: targetColor,
            borderWidth: 2.5,
            borderDash: [7, 5],
            pointRadius: targetSavingsMB.map(val => val === null ? 0 : 3),
            pointHoverRadius: 6,
            pointStyle: 'rectRot',
            pointBackgroundColor: targetColor,
            spanGaps: false,
            // Chart.js draws lower orders last, above the bars.
            order: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimation,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: {
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '500' },
              usePointStyle: true,
              pointStyleWidth: 12,
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
                if (c.raw === null || c.raw === undefined) return ` ${c.dataset.label}: ยังไม่มีข้อมูล`;
                const value = c.datasetIndex === 0 ? monthlyAgg[idx].cr : monthlyAgg[idx].target;
                return ` ${c.dataset.label}: ${formatCurrency(value)}`;
              },
              afterBody: (items) => {
                const idx = items[0]?.dataIndex;
                const row = monthlyAgg[idx];
                if (!row || row.pv <= 0 || row.missingPurchase) return ['ยังไม่มีมูลค่าซื้อรวม'];
                const gap = row.cr - row.target;
                return [
                  `มูลค่าสั่งซื้อ: ${formatCurrency(row.pv)}`,
                  `${gap >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}เป้า: ${formatCurrency(Math.abs(gap))}`
                ];
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
            suggestedMin: minSaving < 0 ? minSaving * 1.15 : 0,
            title: {
              display: true,
              text: 'มูลค่าลดต้นทุน (ล้านบาท)',
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '600' }
            },
            ticks: {
              color: textColor,
              callback: (val) => axisNumber(val)
            },
            grid: { color: gridColor }
          }
        }
      }
    });

  } else {
    let cumActual = 0;
    let cumTarget = 0;
    let incompleteTarget = false;
    let lastActiveIndex = -1;

    monthlyAgg.forEach((r, idx) => {
      if (r.pv > 0 || r.cr !== 0) {
        lastActiveIndex = idx;
      }
    });

    const actualCumulative = [];
    const targetCumulative = [];

    monthlyAgg.forEach((r, idx) => {
      incompleteTarget ||= Boolean(r.missingPurchase);
      if (idx <= lastActiveIndex) {
        cumActual += r.cr;
        actualCumulative.push(cumActual / 1000000);
      } else {
        actualCumulative.push(null);
      }

      if (r.pv > 0 || idx <= lastActiveIndex) {
        cumTarget += r.target;
        targetCumulative.push(incompleteTarget ? null : cumTarget / 1000000);
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
            label: 'ลดต้นทุนสะสมจริง',
            data: actualCumulative,
            borderColor: actualColor,
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.10)',
            fill: true,
            tension: 0.25,
            borderWidth: 3,
            pointRadius: actualCumulative.map(val => val === null ? 0 : 4),
            pointHoverRadius: 7,
            pointBackgroundColor: actualColor,
            pointBorderColor: isDark ? '#0f172a' : '#ffffff',
            pointBorderWidth: 1.5,
            spanGaps: false,
            order: 1
          },
          {
            label: `เป้าหมายสะสม ${(State.targetRate * 100).toFixed(1)}%`,
            data: targetCumulative,
            borderColor: targetColor,
            borderWidth: 2.5,
            borderDash: [7, 5],
            pointRadius: targetCumulative.map(val => val === null ? 0 : 3),
            pointStyle: 'rectRot',
            pointBackgroundColor: targetColor,
            fill: false,
            spanGaps: false,
            order: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimation,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: {
              color: textColor,
              font: { family: 'Prompt', size: 11, weight: '500' },
              usePointStyle: true,
              pointStyleWidth: 12,
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
                return ` ${c.dataset.label}: ${formatCurrency(c.raw * 1000000)}`;
              },
              afterBody: (items) => {
                const actual = items.find(item => item.datasetIndex === 0)?.raw;
                const target = items.find(item => item.datasetIndex === 1)?.raw;
                if (actual === null || actual === undefined || target === null || target === undefined) return [];
                const gap = (actual - target) * 1000000;
                return [`${gap >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}เป้าสะสม: ${formatCurrency(Math.abs(gap))}`];
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
              callback: (val) => axisNumber(val)
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
  const total = dataValues.reduce((a, b) => a + b, 0);

  const colors = sortedKeys.map((k, idx) => STRATEGY_COLOR_MAP[k] || DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length]);
  const totalEl = document.getElementById('strategy-chart-total');
  const summaryEl = document.getElementById('strategy-chart-summary');
  if (totalEl) totalEl.textContent = formatCurrency(total, 0);
  if (summaryEl) {
    const topStrategy = sortedKeys[0];
    summaryEl.textContent = total > 0
      ? `ผลลดต้นทุนรวม ${formatCurrency(total)} กลยุทธ์สูงสุด ${THAI_STRATEGIES[topStrategy] || topStrategy} ${formatCurrency(stratMap[topStrategy])}`
      : 'ยังไม่มีข้อมูลกลยุทธ์สำหรับช่วงเวลาที่เลือก';
  }

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
        hoverBackgroundColor: colors,
        borderWidth: 2,
        borderColor: State.theme === 'dark' ? '#131b26' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
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

  const safeTotal = total || 1;
  const listEl = document.getElementById('strategy-breakdown-list');
  if (listEl) {
    listEl.innerHTML = sortedKeys.map((k, idx) => {
      const amt = stratMap[k];
      const pct = ((amt / safeTotal) * 100).toFixed(1);
      const nameThai = THAI_STRATEGIES[k] || k;
      const dotColor = colors[idx] || DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length];
      return `
        <div class="strat-item">
          <div class="strat-item-left">
            <span class="strat-dot" style="background: ${dotColor};"></span>
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

  const rawMonthlyAgg = getMonthlyAggregatedData();
  const selectedMonths = State.activeMonth && State.activeMonth !== 'ALL'
    ? [State.activeMonth]
    : (State.activeQuarter && State.activeQuarter !== 'ALL' ? (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER) : MONTH_ORDER);
  const monthlyAgg = selectedMonths.length === MONTH_ORDER.length
    ? rawMonthlyAgg
    : rawMonthlyAgg.filter(row => selectedMonths.includes(row.month));
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
    const hasData = row.pv > 0 || row.cr !== 0 || row.count > 0;
    const statusBadge = row.missingPurchase ? '<span class="kpi-badge neutral">รอมูลค่าซื้อรวม</span>' : hasData
      ? `<span class="kpi-badge ${row.isPassed ? 'success' : 'danger'}">${row.isPassed ? '✓ ได้ตามเป้า' : '✕ ต่ำกว่าเป้า'}</span>`
      : `<span class="kpi-badge neutral">-</span>`;

    return `
      <tr>
        <td><strong>${THAI_MONTHS[row.month] || row.month}</strong>${row.partial ? '<br><small>ชั่วคราว · ยอด PO ที่บันทึกแล้ว</small>' : ''}</td>
        <td>${row.missingPurchase ? 'ไม่ครบ / รอข้อมูล' : formatCurrency(row.pv)}</td>
        <td class="highlight-col">${formatCurrency(row.cr)}</td>
        <td>${row.missingPurchase ? '—' : formatCurrency(row.target)}</td>
        <td><strong>${hasData && !row.missingPurchase ? (row.pct * 100).toFixed(2) + '%' : '-'}</strong></td>
        <td style="color: ${hasData ? (varianceTHB >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)') : 'var(--text-muted)'}">
          ${hasData && !row.missingPurchase ? (varianceTHB >= 0 ? '+' + formatCurrency(varianceTHB) : 'ขาด ' + formatCurrency(Math.abs(varianceTHB))) : '-'}
        </td>
        <td>${statusBadge}</td>
        <td>${formatCurrency(row.creditSaving)}</td>
      </tr>
    `;
  }).join('');

  const totalActualPct = totalPV > 0 ? (totalCR / totalPV) : 0;
  const incomplete = !totalPV || monthlyAgg.some(row => row.missingPurchase);
  const isTotalPassed = totalActualPct >= State.targetRate;
  tbody.innerHTML += `
    <tr style="background: var(--bg-glass); font-weight: 700;">
      <td>${monthlyAgg.length === MONTH_ORDER.length ? 'รวมทั้งปี' : 'รวมช่วงที่เลือก'} (GRAND TOTAL)${monthlyAgg.some(r => r.partial) ? ' · ชั่วคราว' : ''}</td>
      <td>${incomplete ? 'ไม่ครบ / รอข้อมูล' : formatCurrency(totalPV)}</td>
      <td class="highlight-col">${formatCurrency(totalCR)}</td>
      <td>${incomplete ? '—' : formatCurrency(totalTarget)}</td>
      <td style="color: var(--accent-primary);">${incomplete ? '—' : (totalActualPct * 100).toFixed(2) + '%'}</td>
      <td style="color: ${totalCR - totalTarget >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
        ${incomplete ? 'รอมูลค่าซื้อรวม' : totalCR - totalTarget >= 0 ? '+' + formatCurrency(totalCR - totalTarget) : 'ขาด ' + formatCurrency(Math.abs(totalCR - totalTarget))}
      </td>
      <td>
        <span class="kpi-badge ${incomplete ? 'neutral' : isTotalPassed ? 'success' : 'danger'}">
          ${incomplete ? 'ข้อมูลไม่ครบ' : isTotalPassed ? '✓ ได้ตามเป้า' : '✕ ต่ำกว่าเป้า'}
        </span>
      </td>
      <td>${formatCurrency(totalCreditSaving)}</td>
    </tr>
  `;

  const kpiSub = document.querySelector('#view-kpi-tracking .card-header-sub');
  if (kpiSub) {
    kpiSub.textContent = `เปรียบเทียบมูลค่าจริงเทียบเป้าหมายการลดต้นทุน ${(State.targetRate * 100).toFixed(1)}% (${formatYearBE(State.activeYear)})`;
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
          <td><span class="tier-tag tier-mid">${m.creditDiffDays ?? '—'} วัน</span></td>
          <td>${formatCurrency(m.creditPOVal ?? m.pv)}</td>
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
  const selectedMonths = State.activeMonth && State.activeMonth !== 'ALL'
    ? [State.activeMonth]
    : (State.activeQuarter && State.activeQuarter !== 'ALL' ? (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER) : MONTH_ORDER);
  const isFullYear = selectedMonths.length === MONTH_ORDER.length;
  const scopeLabel = State.activeMonth && State.activeMonth !== 'ALL'
    ? THAI_MONTHS[State.activeMonth]
    : (State.activeQuarter && State.activeQuarter !== 'ALL' ? `ไตรมาส ${State.activeQuarter}` : 'ทั้งปี');
  const multiYearData = years.map(yr => {
    if (State.data.workbookSource) {
      const periods = State.data.workbookSource.periods.filter(p => p.year === yr && selectedMonths.includes(p.month));
      const purchase = periods.reduce((s,p) => s + (p.purchase ?? 0), 0);
      const saving = periods.reduce((s,p) => s + p.savings, 0);
      const incomplete = periods.some(p => p.count > 0 && p.purchase === null);
      return { year: yr, purchase, saving, target: incomplete || !purchase ? null : purchase * State.targetRate,
        savingMB: saving / 1000000, pct: incomplete || !purchase ? 'ไม่พร้อมคำนวณ' : (saving / purchase * 100).toFixed(2), partial: periods.some(p => p.partial) };
    }
    const txs = State.transactions.filter(t => t.year === yr && selectedMonths.includes(t.month));
    let saving = txs.reduce((sum, t) => sum + (Number(t.totalSaving) || 0), 0);

    let purchase = 0;
    if (yr === '2026' && State.data?.monthlySummary) {
      purchase = State.data.monthlySummary
        .filter(m => selectedMonths.includes(String(m.month || '').toUpperCase()))
        .reduce((sum, m) => sum + (Number(m.pv2026) || 0), 0);
    } else if (State.data?.purchaseHistory) {
      const phs = State.data.purchaseHistory.filter(p => p.year === yr && selectedMonths.includes(String(p.month || '').toUpperCase()));
      purchase = phs.reduce((sum, p) => sum + (Number(p.purchaseValue) || 0), 0);
    }
    if (purchase === 0) {
      purchase = txs.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0);
    }

    const ys = isFullYear ? State.data?.yearlySummary?.find(y => y.year === yr) : null;
    if (ys) {
      if (saving === 0 && ys.costSaving > 0) saving = ys.costSaving;
      if (purchase === 0 && ys.purchaseValue > 0) purchase = ys.purchaseValue;
    }

    return {
      year: yr,
      purchase,
      saving,
      target: purchase * State.targetRate,
      savingMB: saving / 1000000,
      pct: purchase > 0 ? ((saving / purchase) * 100).toFixed(2) : '0.00'
    };
  });

  const labels = multiYearData.map(y => `${formatYearBE(y.year)}${y.partial ? ' (ชั่วคราว)' : ''}`);
  const savingsValues = multiYearData.map(y => y.savingMB);
  const targetValues = multiYearData.map(y => y.target === null ? null : y.target / 1000000);
  const subtitleEl = document.getElementById('multi-year-chart-subtitle');
  const summaryEl = document.getElementById('multi-year-chart-summary');
  if (subtitleEl) subtitleEl.textContent = `ผลลดต้นทุนจริงเทียบเป้าหมาย ${(State.targetRate * 100).toFixed(1)}% · ${scopeLabel}`;
  if (summaryEl) {
    summaryEl.textContent = `เปรียบเทียบ ${scopeLabel}: ${multiYearData.map(item => `${formatYearBE(item.year)} ลดต้นทุน ${formatCurrency(item.saving)} เป้าหมาย ${item.target === null ? 'รอมูลค่าซื้อรวม' : formatCurrency(item.target)}`).join(', ')}`;
  }

  if (State.charts.multiYear) {
    State.charts.multiYear.destroy();
  }

  const isDark = State.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const rootStyles = getComputedStyle(document.documentElement);
  const actualColor = rootStyles.getPropertyValue('--accent-primary').trim() || '#0284c7';
  const targetColor = rootStyles.getPropertyValue('--qtc-orange').trim() || '#f97316';

  State.charts.multiYear = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'ลดต้นทุนจริง',
          data: savingsValues,
          backgroundColor: actualColor,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 52,
          order: 1
        },
        {
          type: 'line',
          label: `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}%`,
          data: targetValues,
          borderColor: targetColor,
          borderDash: [7, 5],
          fill: false,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: 4,
          pointStyle: 'rectRot',
          pointHoverRadius: 7,
          pointBackgroundColor: targetColor,
          pointBorderColor: isDark ? '#0f172a' : '#ffffff',
          pointBorderWidth: 1.5,
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            color: textColor,
            font: { family: 'Prompt', size: 12, weight: '500' },
            usePointStyle: true,
            pointStyleWidth: 12,
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
            label: (context) => {
              const item = multiYearData[context.dataIndex];
              const value = context.datasetIndex === 0 ? item.saving : item.target;
              return ` ${context.dataset.label}: ${formatCurrency(value)}`;
            },
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              const item = multiYearData[idx];
              if (item) {
                return [`มูลค่าสั่งซื้อ: ${formatCurrency(item.purchase)}`, `อัตราลดต้นทุน: ${item.pct}%`];
              }
              return [];
            }
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
            text: 'มูลค่าลดต้นทุน (ล้านบาท)',
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

  if (State.activeMonth && State.activeMonth !== 'ALL') {
    list = list.filter(t => t.month === State.activeMonth);
  } else if (State.activeQuarter && State.activeQuarter !== 'ALL') {
    const allowed = QUARTER_MONTHS[State.activeQuarter] || [];
    list = list.filter(t => allowed.includes(t.month));
  }

  if (State.filters.month !== 'ALL') {
    list = list.filter(t => t.month === State.filters.month);
  }

  if (State.filters.pic !== 'ALL') {
    list = list.filter(t => (t.pic || '').toLowerCase().includes(State.filters.pic.toLowerCase()));
  }

  if (State.filters.strategy !== 'ALL') {
    list = list.filter(t => (t.strategy || '').toLowerCase().includes(State.filters.strategy.toLowerCase()));
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
    supplierMap[s].savings += (Number(t.totalSaving) || 0);
    supplierMap[s].purchase += (Number(t.totalPrice) || 0);
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
    picMap[pic].savings += (Number(t.totalSaving) || 0);
    picMap[pic].purchase += (Number(t.totalPrice) || 0);
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
      const saving = Number(t.totalSaving) || 0;
      stratPicMatrix[strat].Total += saving;
      if (stratPicMatrix[strat][pic] !== undefined) {
        stratPicMatrix[strat][pic] += saving;
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
    const wage = Math.max(0, Number(wageInput?.value) || 0);
    const min = Math.max(0, Number(minInput?.value) || 0);
    const jobs = Math.max(0, Number(jobsInput?.value) || 0);
    const months = Math.max(0, Number(monthsInput?.value) || 0);

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

function initGlobalDragAndDrop() {
  const overlay = document.getElementById('global-dropzone-overlay');
  if (!overlay) return;

  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounter++;
      overlay.classList.add('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('active');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        handleUploadedExcel(file);
      } else {
        alert("กรุณาวางไฟล์ Excel (.xlsx, .xls) หรือ CSV เท่านั้น");
      }
    }
  });
}

// ฟังก์ชันแปลง ArrayBuffer เป็น Base64 แบบปลอดภัยสำหรับไฟล์ขนาดใหญ่
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

// แยกดึงรายการจาก Sheet ข้อมูลรายการจัดซื้อ (Data, Improve#1 หรือ Sheet ทั่วไป)
function parseTransactionsFromWorksheet(sheet, idPrefix = 'TX', defaultYear = '2026') {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) return [];

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/฿/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // ตรวจสอบหาแถว Header ใน 10 แถวแรก
  let headerRowIndex = -1;
  const colMap = {};

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (
      (rowStr.includes('po') || rowStr.includes('เลขที่') || rowStr.includes('ใบสั่งซื้อ')) &&
      (rowStr.includes('supp') || rowStr.includes('ซัพพลาย') || rowStr.includes('คู่ค้า') || rowStr.includes('รายการ') || rowStr.includes('goods'))
    ) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
      if (rowStr.includes('qty') || rowStr.includes('ราคา') || rowStr.includes('amount') || rowStr.includes('ต่อรอง')) {
        headerRowIndex = r;
        break;
      }
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0;

  const headerRow = rows[headerRowIndex].map(h => String(h || '').trim());
  headerRow.forEach((h, colIdx) => {
    const lower = h.toLowerCase();
    if (lower === 'year' || lower.includes('ปี')) colMap.year = colIdx;
    else if (lower === 'month' || lower === 'jul' || lower.includes('เดือน')) colMap.month = colIdx;
    else if (lower.includes('po no') || lower.includes('po') || lower.includes('เลขที่')) colMap.poNo = colIdx;
    else if (lower.includes('supplier') || lower.includes('ซัพพลาย')) colMap.supplier = colIdx;
    else if (lower.includes('description') || lower.includes('goods') || lower.includes('รายละเอียด') || lower.includes('รายการ')) colMap.description = colIdx;
    else if (lower === 'qty' || lower.includes('quantity') || lower.includes('จำนวน')) colMap.qty = colIdx;
    else if (lower === 'unit' || lower.includes('หน่วย')) colMap.unit = colIdx;
    else if (lower.includes('ราคาต่ำสุด') || lower.includes('unit price') || lower.includes('ราคาต่อหน่วยเดิม')) colMap.minUnitPrice = colIdx;
    else if (lower.includes('ราคารวม') || lower.includes('total price') || lower.includes('มูลค่ารวม')) colMap.totalPrice = colIdx;
    else if (lower.includes('ต่อรองได้') && !lower.includes('รวม') || lower.includes('ราคาใหม่') || lower.includes('negotiated')) colMap.negotiatedUnitPrice = colIdx;
    else if (lower.includes('ผลต่าง') || lower.includes('ส่วนต่าง') || lower.includes('difference')) colMap.unitDifference = colIdx;
    else if (lower.includes('รวมที่ต่อรองได้') || lower.includes('savings') || lower.includes('ส่วนลดรวม')) colMap.totalSaving = colIdx;
    else if (lower.includes('% discount') || lower.includes('ส่วนลด%') || lower.includes('% ส่วนลด')) colMap.percentDiscount = colIdx;
    else if (lower.includes('method') || lower.includes('strategy') || lower.includes('กลยุทธ์')) colMap.method = colIdx;
    else if (lower.includes('person in charge') || lower.includes('pic') || lower.includes('ผู้รับผิดชอบ') || lower.includes('buyer')) colMap.pic = colIdx;
    else if (lower.includes('remark') || lower.includes('หมายเหตุ')) colMap.remark = colIdx;
  });

  const txs = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const getCol = (idx, fallback = '') => (idx !== undefined && row[idx] !== undefined && row[idx] !== '') ? row[idx] : fallback;

    const poVal = String(getCol(colMap.poNo, '')).trim();
    const suppVal = String(getCol(colMap.supplier, '')).trim();
    const totalP = parseNum(getCol(colMap.totalPrice, 0));
    const totalS = parseNum(getCol(colMap.totalSaving, 0));

    if (!poVal && !suppVal && totalP === 0 && totalS === 0) continue;

    let yr = String(getCol(colMap.year, defaultYear)).trim();
    if (!yr || yr === 'undefined') yr = defaultYear;
    if (yr.length === 4 && parseInt(yr) > 2500) yr = String(parseInt(yr) - 543);

    let mo = String(getCol(colMap.month, 'JAN')).trim().toUpperCase();
    if (mo.includes('ม.ค.') || mo.includes('มกรา')) mo = 'JAN';
    else if (mo.includes('ก.พ.') || mo.includes('กุมภา')) mo = 'FEB';
    else if (mo.includes('มี.ค.') || mo.includes('มีนา')) mo = 'MAR';
    else if (mo.includes('เม.ย.') || mo.includes('เมษา')) mo = 'APR';
    else if (mo.includes('พ.ค.') || mo.includes('พฤษภา')) mo = 'MAY';
    else if (mo.includes('มิ.ย.') || mo.includes('มิถุนา')) mo = 'JUN';
    else if (mo.includes('ก.ค.') || mo.includes('กรกฎา')) mo = 'JUL';
    else if (mo.includes('ส.ค.') || mo.includes('สิงหา')) mo = 'AUG';
    else if (mo.includes('ก.ย.') || mo.includes('กันยา')) mo = 'SEP';
    else if (mo.includes('ต.ค.') || mo.includes('ตุลา')) mo = 'OCT';
    else if (mo.includes('พ.ย.') || mo.includes('พฤศจิกา')) mo = 'NOV';
    else if (mo.includes('ธ.ค.') || mo.includes('ธันวา')) mo = 'DEC';
    else if (mo.length > 3) mo = mo.slice(0, 3);

    const desc = String(getCol(colMap.description, '')).trim();
    const qty = parseNum(getCol(colMap.qty, 0));
    const unit = String(getCol(colMap.unit, 'EA')).trim() || 'EA';
    const minP = parseNum(getCol(colMap.minUnitPrice, 0));
    let tPrice = totalP;
    if (tPrice === 0 && qty > 0 && minP > 0) tPrice = qty * minP;

    const negP = parseNum(getCol(colMap.negotiatedUnitPrice, minP)) || minP;
    let uDiff = parseNum(getCol(colMap.unitDifference, 0)) || (minP - negP);
    let tSaving = totalS;
    if (tSaving === 0 && uDiff > 0 && qty > 0) tSaving = uDiff * qty;

    let pDisc = parseNum(getCol(colMap.percentDiscount, 0));
    if (pDisc === 0 && tPrice > 0 && tSaving > 0) pDisc = tSaving / tPrice;
    if (pDisc > 1) pDisc = pDisc / 100;

    const method = String(getCol(colMap.method, 'Negotiate')).trim() || 'Negotiate';
    const pic = String(getCol(colMap.pic, 'ไม่ระบุ')).trim() || 'ไม่ระบุ';
    const remark = String(getCol(colMap.remark, '')).trim();

    txs.push({
      id: `${idPrefix}-${r}`,
      globalId: `${idPrefix}-${r}`,
      year: yr,
      month: mo,
      poNo: poVal || `PO-${idPrefix}-${r}`,
      supplier: suppVal || 'ไม่ระบุ',
      description: desc,
      qty: qty,
      unit: unit,
      minUnitPrice: minP,
      totalPrice: tPrice,
      negotiatedUnitPrice: negP,
      unitDifference: uDiff,
      totalSaving: tSaving,
      percentDiscount: pDisc,
      strategy: method,
      method: method,
      pic: pic,
      remark: remark
    });
  }

  return txs;
}

// ฟังก์ชันหลัก: ประมวลผลและอัปเดตไฟล์ Excel ทุกชีต พร้อมบันทึกลง Backend
async function handleUploadedExcel(file) {
  if (typeof XLSX === 'undefined') {
    alert("กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดไลบรารี SheetJS");
    return;
  }

  // แสดง Modal สถานะความคืบหน้า
  const statusModal = document.getElementById('upload-status-modal');
  const step1 = document.getElementById('upload-step-1');
  const step2 = document.getElementById('upload-step-2');
  const step3 = document.getElementById('upload-step-3');

  const setStep = (activeStep) => {
    if (!statusModal) return;
    statusModal.classList.add('show');
    [step1, step2, step3].forEach((s, idx) => {
      if (!s) return;
      s.classList.remove('active', 'done');
      if (idx + 1 < activeStep) s.classList.add('done');
      else if (idx + 1 === activeStep) s.classList.add('active');
    });
  };

  setStep(1);

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetNames = workbook.SheetNames || [];

      if (sheetNames.length === 0) {
        throw new Error("ไม่พบแผ่นงาน (Sheet) ในไฟล์ Excel นี้");
      }

      setStep(2);

      const parseNum = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/,/g, '').replace(/฿/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      // 1. ตรวจสอบ Sheet ข้อมูลรายการจัดซื้อ
      let recentTransactions = [];
      let historicalTransactions = [];

      const hasDataSheet = sheetNames.includes('Data');
      const hasImproveSheet = sheetNames.some(s => s.toLowerCase().includes('improve'));

      if (hasDataSheet || hasImproveSheet) {
        if (hasDataSheet) {
          historicalTransactions = parseTransactionsFromWorksheet(workbook.Sheets['Data'], 'D', '2024');
        }
        const improveSheetName = sheetNames.find(s => s.toLowerCase().includes('improve')) || 'Improve#1';
        if (workbook.Sheets[improveSheetName]) {
          recentTransactions = parseTransactionsFromWorksheet(workbook.Sheets[improveSheetName], 'IMP', '2026');
        }
      } else {
        // หากเป็นไฟล์แบบชีตเดี่ยว หรือชื่อชีตทั่วไป ให้ดึงรายการทั้งหมดแล้วแบ่งตามปี
        let allTxs = [];
        sheetNames.forEach((sName, sIdx) => {
          const sTxs = parseTransactionsFromWorksheet(workbook.Sheets[sName], `S${sIdx}`, '2026');
          allTxs = allTxs.concat(sTxs);
        });

        if (allTxs.length === 0) {
          throw new Error("ไม่พบรายการข้อมูลจัดซื้อในไฟล์ Excel กรุณาตรวจสอบหัวคอลัมน์");
        }

        allTxs.forEach(t => {
          const yrNum = parseInt(t.year) || 2026;
          if (yrNum >= 2025) recentTransactions.push(t);
          else historicalTransactions.push(t);
        });
      }

      const allCombined = [...recentTransactions, ...historicalTransactions];

      // 2. ดึงหรือคำนวณ สรุปผลรายเดือน (Monthly Summary)
      let monthlySummary = [];
      const monthlySheetName = sheetNames.find(s => s.includes('สรุป-รายเดือน') || s.includes('รายเดือน'));
      
      if (monthlySheetName && workbook.Sheets[monthlySheetName]) {
        const mRows = XLSX.utils.sheet_to_json(workbook.Sheets[monthlySheetName], { header: 1, defval: '' });
        // สแกนแถวข้อมูล JAN-DEC (มักจะเริ่มแถวที่ 2 หรือ 3)
        for (let r = 1; r < Math.min(25, mRows.length); r++) {
          const row = mRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;
          const monthCode = String(row[0] || '').trim().toUpperCase();
          const validMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          if (validMonths.includes(monthCode)) {
            const pv2021 = parseNum(row[1]);
            const cr2021 = parseNum(row[2]);
            const pct2021 = parseNum(row[3]);
            const status2021 = String(row[4] || (pct2021 >= 3 ? 'ได้ตามเป้าหมาย' : 'ไม่ได้ตามเป้าหมาย'));
            const pv2026 = parseNum(row[5]);
            const cr2026 = parseNum(row[6]);
            const target2026 = parseNum(row[7]) || (pv2026 * (State.targetRate || 0.03));
            const pct2026 = parseNum(row[8]) || (pv2026 > 0 ? (cr2026 / pv2026) * 100 : 0);
            const status2026 = String(row[9] || (cr2026 >= target2026 ? 'ได้ตามเป้าหมาย' : 'ไม่ได้ตามเป้าหมาย'));
            const savingVsTarget = parseNum(row[11]);
            const pctDiffTarget = parseNum(row[12]);
            const creditDiffDays = parseNum(row[19]);
            const creditPOVal = parseNum(row[20]);
            const creditSaving = parseNum(row[21]);

            monthlySummary.push({
              month: monthCode,
              pv2021, cr2021, pct2021, status2021,
              pv2026, cr2026, target2026, pct2026, status2026,
              savingVsTarget, pctDiffTarget,
              creditDiffDays, creditPOVal, creditSaving
            });
          }
        }
      }

      // หากไม่มี Sheet สรุปรายเดือน ให้คำนวณอัตโนมัติจากรายการทั้งหมด
      if (monthlySummary.length === 0) {
        const monthCodes = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        monthlySummary = monthCodes.map(mo => {
          const moTxs2026 = allCombined.filter(t => t.month === mo && t.year === '2026');
          const pv = moTxs2026.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
          const cr = moTxs2026.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
          const target = pv * (State.targetRate || 0.03);
          const pct = pv > 0 ? (cr / pv) * 100 : 0;
          const status = pv > 0 ? (cr >= target ? 'ได้ตามเป้าหมาย' : 'ไม่ได้ตามเป้าหมาย') : '-';

          const creditTxs = moTxs2026.filter(t => (t.strategy || '').includes('เครดิต'));
          const creditSaving = creditTxs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);

          return {
            month: mo,
            pv2021: 0, cr2021: 0, pct2021: 0, status2021: '-',
            pv2026: pv, cr2026: cr, target2026: target, pct2026: pct, status2026: status,
            savingVsTarget: cr - target,
            pctDiffTarget: target > 0 ? (cr - target) / target : 0,
            creditDiffDays: creditTxs.length > 0 ? 15 : 0,
            creditPOVal: creditTxs.reduce((sum, t) => sum + (t.totalPrice || 0), 0),
            creditSaving: creditSaving
          };
        });
      }

      // 3. ดึงหรือคำนวณ สรุปผลรายปี (Yearly Summary)
      let yearlySummary = [];
      const yearlySheetName = sheetNames.find(s => s.includes('สรุป-รายปี') || s.includes('รายปี'));
      if (yearlySheetName && workbook.Sheets[yearlySheetName]) {
        const yRows = XLSX.utils.sheet_to_json(workbook.Sheets[yearlySheetName], { header: 1, defval: '' });
        for (let r = 1; r < Math.min(15, yRows.length); r++) {
          const row = yRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;
          const yr = String(row[0] || '').trim();
          if (yr && yr.match(/^20\d\d$/)) {
            yearlySummary.push({
              year: yr,
              purchaseValue: parseNum(row[1]),
              costSaving: parseNum(row[2]),
              percentSaving: parseNum(row[3])
            });
          }
        }
      }

      if (yearlySummary.length === 0) {
        const years = ['2023', '2024', '2025', '2026', '2027'];
        yearlySummary = years.map(yr => {
          const yrTxs = allCombined.filter(t => t.year === yr);
          const pv = yrTxs.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
          const cs = yrTxs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
          return {
            year: yr,
            purchaseValue: pv,
            costSaving: cs,
            percentSaving: pv > 0 ? cs / pv : 0
          };
        });
      }

      // 4. ดึงหรือคำนวณ ประวัติมูลค่าซื้อ (Purchase History)
      let purchaseHistory = [];
      const purchaseSheetName = sheetNames.find(s => s.includes('มูลค่าซื้อ'));
      if (purchaseSheetName && workbook.Sheets[purchaseSheetName]) {
        const pRows = XLSX.utils.sheet_to_json(workbook.Sheets[purchaseSheetName], { header: 1, defval: '' });
        for (let r = 1; r < pRows.length; r++) {
          const row = pRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;
          const yr = String(row[0] || '').trim();
          const mo = String(row[1] || '').trim().toUpperCase();
          const val = parseNum(row[2]);
          if (yr && mo && val > 0) {
            purchaseHistory.push({ year: yr, month: mo, purchaseValue: val });
          }
        }
      }

      if (purchaseHistory.length === 0) {
        const years = Array.from(new Set(allCombined.map(t => t.year))).sort();
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        years.forEach(yr => {
          months.forEach(mo => {
            const sumPV = allCombined.filter(t => t.year === yr && t.month === mo).reduce((s, t) => s + (t.totalPrice || 0), 0);
            if (sumPV > 0) {
              purchaseHistory.push({ year: yr, month: mo, purchaseValue: sumPV });
            }
          });
        });
      }

      // 5. ดึงหรือคำนวณ Matrix กลยุทธ์ (Strategy Matrix)
      let strategyMatrix = [];
      const strategySheetName = sheetNames.find(s => s.includes('Sheet4') || s.includes('Matrix') || s.includes('กลยุทธ์'));
      if (strategySheetName && workbook.Sheets[strategySheetName]) {
        const sRows = XLSX.utils.sheet_to_json(workbook.Sheets[strategySheetName], { header: 1, defval: '' });
        for (let r = 2; r < Math.min(15, sRows.length); r++) {
          const row = sRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;
          const stratName = String(row[0] || '').trim();
          if (stratName && !stratName.toLowerCase().includes('total') && !stratName.toLowerCase().includes('sum')) {
            strategyMatrix.push({
              strategy: stratName,
              Dusit: parseNum(row[1]),
              Pawina: parseNum(row[2]),
              Saniya: parseNum(row[3]),
              Tanida: parseNum(row[4]),
              Yuwanit: parseNum(row[5]),
              Total: parseNum(row[6])
            });
          }
        }
      }

      if (strategyMatrix.length === 0) {
        const strategies = ['Avoidance', 'Compare + Negotiate', 'Negotiate', 'Rebate', 'เพิ่มเครดิต'];
        const pics = ['Dusit', 'Pawina', 'Saniya', 'Tanida', 'Yuwanit'];
        strategyMatrix = strategies.map(strat => {
          const item = { strategy: strat };
          let rowTotal = 0;
          pics.forEach(p => {
            const pSavings = allCombined
              .filter(t => (t.strategy || t.method || '').includes(strat) && (t.pic || '').toLowerCase().includes(p.toLowerCase()))
              .reduce((s, t) => s + (t.totalSaving || 0), 0);
            item[p] = pSavings;
            rowTotal += pSavings;
          });
          item.Total = rowTotal;
          return item;
        });
      }

      // 6. สร้าง Complete Dataset สอดคล้องตามมาตรฐาน KPI_DATA
      const completeDataset = {
        title: "QTC ENERGY PCL - KPI Discount Supplier & Procurement Cost Reduction",
        generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        config: State.data?.config || {
          targetRate: State.targetRate || 0.03,
          creditInterestRate: 0.0425,
          kaizenParams: {
            hourlyWage: 117,
            savedMinutesPerJob: 10,
            jobsPerMonth: 16,
            workDaysPerMonth: 20,
            monthsPerYear: 1,
            paperCostPerPage: 0.15,
            colorPrintPerPage: 3,
            blackWhitePrintPerPage: 0.3,
            electricityRatePerKwh: 4
          }
        },
        monthlySummary,
        yearlySummary,
        purchaseHistory,
        strategyMatrix,
        historicalTransactions,
        recentTransactions
      };

      setStep(3);

      // 7. บันทึกและซิงค์ลง Backend API (/api/upload-excel)
      let backendSuccess = false;
      let backendMsg = '';

      try {
        // ส่งไฟล์ Binary ตัวจริงขึ้น Backend (ขนาดกะทัดรัดเพียง ~900KB รวดเร็ว และบันทึกไฟล์ .xlsx / data.json / data.js บน Server ถาวร)
        const apiResponse = await fetch('/api/upload-excel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name)
          },
          body: data
        });

        if (apiResponse.ok) {
          const resJson = await apiResponse.json();
          backendSuccess = true;
          backendMsg = resJson.message || 'บันทึกลง Backend สำเร็จ';
          if (resJson.dataset) {
            completeDataset = resJson.dataset;
          }
          console.log('✅ Backend updated permanently with binary file:', resJson);
        } else {
          // หาก Binary API มีปัญหา ให้ลองส่งแบบ JSON Fallback
          const base64Data = arrayBufferToBase64(data);
          const fallbackRes = await fetch('/api/upload-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              fileBase64: base64Data,
              dataset: completeDataset
            })
          });
          if (fallbackRes.ok) {
            backendSuccess = true;
          }
        }
      } catch (backendErr) {
        console.warn('Backend upload API error:', backendErr);
      }

      // ปิดการทำงาน Google Sheet auto-sync เพื่อให้ไฟล์ Excel เป็น Source of Truth ถาวร
      try {
        localStorage.setItem(GSHEET_STORAGE_KEY, JSON.stringify({ url: '', autoSync: false }));
        const autoSyncCheck = document.getElementById('gsheet-auto-sync');
        if (autoSyncCheck) autoSyncCheck.checked = false;
        const badge = document.getElementById('gsheet-status-badge');
        if (badge) {
          badge.textContent = `💾 ข้อมูลซิงค์กับเซิร์ฟเวอร์หลักแล้ว`;
          badge.className = 'tier-tag tier-high';
        }
      } catch (e) {}

      // 8. เก็บใน LocalStorage ด้วย เพื่อให้โหลดได้ทันทีแบบออฟไลน์
      try {
        localStorage.setItem('qtc_custom_dataset', JSON.stringify(completeDataset));
      } catch (lsErr) {
        console.warn('LocalStorage save error:', lsErr);
      }

      // 9. อัปเดต In-Memory State และเรนเดอร์แดชบอร์ดใหม่ทั้งหมด
      window.KPI_DATA = completeDataset;
      State.data = completeDataset;
      setupDataset();
      filterTransactions();
      renderAllViews();

      // ปิด modal ความคืบหน้า
      setTimeout(() => {
        if (statusModal) statusModal.classList.remove('show');
      }, 500);

      // 10. แจ้งเตือนยืนยันความสำเร็จ
      const totalCount = recentTransactions.length + historicalTransactions.length;
      const sheetCount = sheetNames.length;
      const backendStatusText = backendSuccess 
        ? "💾 ข้อมูลถูกบันทึกลง Backend Server (data.json, data.js และไฟล์ .xlsx) ถาวรแล้ว ทุกคนที่เปิดเว็บจะเห็นข้อมูลชุดนี้ร่วมกันทันที" 
        : "⚡ ข้อมูลอัปเดตบนหน้าจอและ Local Storage เรียบร้อยแล้ว";

      alert(
        `🎉 อัปเดตข้อมูลทั้งชีตและระบบ Backend เรียบร้อยแล้ว!\n\n` +
        `• ไฟล์: ${file.name}\n` +
        `• แผ่นงานที่ตรวจพบ (${sheetCount} ชีต): ${sheetNames.join(', ')}\n` +
        `• รายการจัดซื้อทั้งหมด: ${totalCount.toLocaleString()} รายการ (ล่าสุด: ${recentTransactions.length.toLocaleString()}, ประวัติเดิม: ${historicalTransactions.length.toLocaleString()})\n` +
        `• สรุปผลรายเดือนและรายปี: อัปเดตครบถ้วน\n` +
        `• สถานะการบันทึก: ${backendStatusText}`
      );

      switchView('dashboard');
    } catch (err) {
      console.error("Error processing Excel file:", err);
      if (statusModal) statusModal.classList.remove('show');
      alert("เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

function exportFilteredTransactions() {
  const headers = ["เดือน", "เลขที่ PO", "ชื่อซัพพลายเออร์", "รายละเอียดสินค้า/บริการ", "จำนวน", "หน่วย", "ราคารวม (บาท)", "รวมที่ต่อรองได้ (บาท)", "% ส่วนลด", "กลยุทธ์", "ผู้รับผิดชอบ"];
  const rows = State.filteredTransactions.map(t => [
    THAI_MONTHS[t.month] || t.month || '-',
    `"${(t.poNo || '').replace(/"/g, '""')}"`,
    `"${(t.supplier || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.qty || 0,
    `"${(t.unit || '').replace(/"/g, '""')}"`,
    t.totalPrice || 0,
    t.totalSaving || 0,
    ((t.percentDiscount || 0) * 100).toFixed(2) + '%',
    `"${(THAI_STRATEGIES[t.strategy] || t.strategy || '').replace(/"/g, '""')}"`,
    `"${(THAI_PIC_NAMES[t.pic] || t.pic || '').replace(/"/g, '""')}"`
  ]);

  downloadCSV("รายงานรายการส่วนลดจัดซื้อ.csv", headers, rows);
}

window.exportMonthlyKPIToCSV = function() {
  const headers = ["เดือน", "มูลค่าสั่งซื้อ (บาท)", "มูลค่าต่อรองได้ (บาท)", `เป้าหมาย ${(State.targetRate * 100).toFixed(1)}% (บาท)`, "% ส่วนลดจริง", "ผลต่างเทียบเป้าหมาย (บาท)", "สถานะ KPI", "ผลประหยัดเพิ่มเครดิต (บาท)"];
  const selectedMonths = State.activeMonth !== 'ALL' ? [State.activeMonth] : (QUARTER_MONTHS[State.activeQuarter] || MONTH_ORDER);
  const monthlyAgg = getMonthlyAggregatedData().filter(m => selectedMonths.includes(m.month));
  const incomplete = monthlyAgg.some(m => m.missingPurchase);
  let totalPV = 0, totalCR = 0, totalTarget = 0, totalCredit = 0;

  const rows = monthlyAgg.map(m => {
    totalPV += m.pv;
    totalCR += m.cr;
    totalTarget += m.target;
    totalCredit += m.creditSaving;
    const diff = m.cr - m.target;
    return [
      `"${THAI_MONTHS[m.month] || m.month}${m.partial ? ' (ชั่วคราว: ยอด PO ที่บันทึกแล้ว)' : ''}"`,
      m.missingPurchase ? 'ไม่ครบ' : m.pv.toFixed(2),
      m.cr.toFixed(2),
      m.pct === null ? 'ไม่พร้อมคำนวณ' : m.target.toFixed(2),
      m.pct === null ? 'ไม่พร้อมคำนวณ' : (m.pct * 100).toFixed(2) + '%',
      m.pct === null ? 'ไม่พร้อมคำนวณ' : diff.toFixed(2),
      `"${m.pct === null ? 'ข้อมูลไม่ครบ' : m.isPassed ? 'ได้ตามเป้าหมาย' : 'ต่ำกว่าเป้าหมาย'}"`,
      m.creditSaving.toFixed(2)
    ];
  });

  const totalPct = totalPV > 0 ? (totalCR / totalPV) : 0;
  const totalDiff = totalCR - totalTarget;
  rows.push([
    `"รวมช่วงที่เลือก${monthlyAgg.some(m => m.partial) ? ' (ชั่วคราว)' : ''}"`,
    incomplete ? 'ไม่ครบ' : totalPV.toFixed(2),
    totalCR.toFixed(2),
    incomplete || !totalPV ? 'ไม่พร้อมคำนวณ' : totalTarget.toFixed(2),
    incomplete || !totalPV ? 'ไม่พร้อมคำนวณ' : (totalPct * 100).toFixed(2) + '%',
    incomplete || !totalPV ? 'ไม่พร้อมคำนวณ' : totalDiff.toFixed(2),
    `"${incomplete || !totalPV ? 'ข้อมูลไม่ครบ' : totalPct >= State.targetRate ? 'ได้ตามเป้าหมาย' : 'ต่ำกว่าเป้าหมาย'}"`,
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

window.downloadServerExcel = function() {
  const link = document.createElement('a');
  link.href = '/api/download-excel';
  link.download = '2026 KPI-Discount Supplier.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.refreshLatestData = async function(showFeedback = true) {
  if (IS_GITHUB_PAGES) return window.syncGoogleSheetNow(showFeedback);

  const topbarLabel = document.getElementById('topbar-sync-label');
  if (topbarLabel) topbarLabel.textContent = 'กำลังโหลด...';

  try {
    const res = await fetch(`/api/data?_t=${Date.now()}`, { 
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const json = await res.json();
      if (json && (json.recentTransactions || json.historicalTransactions)) {
        window.KPI_DATA = json;
        State.data = json;
        try { localStorage.setItem('qtc_custom_dataset', JSON.stringify(json)); } catch (e) {}
        setupDataset();
        renderAllViews();

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;
        if (topbarLabel) topbarLabel.textContent = `อัปเดต (${timeStr})`;
        
        const total = (json.recentTransactions?.length || 0) + (json.historicalTransactions?.length || 0);
        if (showFeedback) {
          alert(`✅ โหลดข้อมูลชุดล่าสุดจากเซิร์ฟเวอร์สำเร็จ!\nจำนวนรายการสั่งซื้อทั้งหมด: ${total.toLocaleString()} รายการ\nทุกคนที่เปิดเว็บนี้จะเห็นข้อมูลชุดเดียวกัน`);
        }
        return;
      }
    }
    throw new Error('ไม่พบชุดข้อมูลล่าสุดจาก Backend');
  } catch (err) {
    console.warn('refreshLatestData error:', err);
    if (topbarLabel) topbarLabel.textContent = 'ซิงค์ไม่สำเร็จ';
    if (showFeedback) {
      alert(`⚠️ ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้: ${err.message}\nระบบกำลังใช้งานข้อมูลที่แคชไว้ในเครื่อง`);
    }
  }
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

// ฟังก์ชันสร้างชุดข้อมูล (Complete Dataset) จากรายการสั่งซื้อทั้งหมด
function renderWorkbookSources() {
  const source = State.data?.workbookSource;
  const status = document.getElementById('workbook-dashboard-status');
  if (status) {
    status.hidden = !source;
    status.textContent = source ? `ข้อมูลจาก ${source.tabs.length} แท็บ · ${source.periods.some(p => p.partial) ? 'แสดงข้อมูลล่าสุดที่มีแล้ว: เดือนที่ขาดยอดซื้อรวมใช้ยอด PO ชั่วคราว ไม่ใช่ KPI สรุปปิดเดือน · ' : ''}พบ ${source.issues.length} ข้อแตกต่าง / ข้อผิดพลาดต้นทาง · ข้อมูล ณ ${new Date(State.data.generatedAt).toLocaleString('th-TH')}` : '';
  }
  const panel = document.getElementById('workbook-sources');
  if (!panel) return;
  panel.hidden = !source;
  if (!source) return;
  document.getElementById('workbook-source-status').textContent = `อ่าน ${source.tabs.length} แท็บ · ${source.importedRows.toLocaleString()} รายการ · ไม่นับซ้ำข้ามแท็บ ${source.tabs.reduce((s,t) => s + (t.duplicates || 0), 0)} แถว · ไม่สมบูรณ์ ${source.excluded.length} แถว · ${State.data.generatedAt}`;
  const issues = document.getElementById('workbook-source-issues');
  const reviewItems = [...source.issues, ...source.excluded.map(row => `${row.sheet} แถว ${row.row}: ${row.poNo || 'ไม่มี PO'} — ข้อมูลไม่สมบูรณ์ ไม่นำมารวม KPI`)];
  issues.replaceChildren(...reviewItems.map(issue => { const li = document.createElement('li'); li.textContent = issue; return li; }));
  const select = document.getElementById('workbook-tab-select');
  const selected = select.value;
  select.replaceChildren(...source.tabs.map(t => { const option = document.createElement('option'); option.value = t.name; option.textContent = `${t.name} (${t.rows.length} แถว)`; return option; }));
  if (source.tabs.some(t => t.name === selected)) select.value = selected;
  renderWorkbookTab();
}

window.renderWorkbookTab = function(more = false) {
  const select = document.getElementById('workbook-tab-select');
  const tab = State.data?.workbookSource?.tabs.find(t => t.name === select?.value);
  if (!tab) return;
  const table = document.getElementById('workbook-tab-table');
  const limit = more ? Number(table.dataset.limit || 100) + 100 : 100;
  table.dataset.limit = String(limit);
  document.getElementById('workbook-tab-role').textContent = `${tab.role} · ช่วง ${tab.range} · ข้อมูลต้นทาง รวมแถวที่ยังไม่สมบูรณ์`;
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  const width = Math.max(0, ...tab.rows.map(r => r.values.length));
  for (let i = -1; i < width; i++) { const th = document.createElement('th'); th.textContent = i < 0 ? 'แถว' : XLSX.utils.encode_col(tab.startColumn + i); header.append(th); }
  head.append(header);
  const body = document.createElement('tbody');
  for (const row of tab.rows.slice(0, limit)) {
    const tr = document.createElement('tr');
    for (const value of [row.row, ...row.values]) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
    body.append(tr);
  }
  table.replaceChildren(head, body);
  document.getElementById('workbook-more-rows').hidden = limit >= tab.rows.length;
};

function applyWorkbookSimulatorInputs() {
  const params = State.data?.workbookSource?.kaizenParams;
  if (!params) return;
  for (const [key, id] of Object.entries({ hourlyWage:'sim-hourly-wage', savedMinutesPerJob:'sim-minutes-saved', jobsPerMonth:'sim-jobs-month', monthsPerYear:'sim-months-year' })) {
    const input = document.getElementById(id);
    if (input && params[key] !== undefined) { input.value = params[key]; input.dispatchEvent(new Event('input')); }
  }
}

function buildDatasetFromTransactions(allTransactions, customConfig = {}, source = null) {
  const recentTransactions = [];
  const historicalTransactions = [];

  allTransactions.forEach(t => {
    const yrNum = parseInt(t.year) || 2026;
    if (yrNum >= 2025) recentTransactions.push(t);
    else historicalTransactions.push(t);
  });

  const allCombined = [...recentTransactions, ...historicalTransactions];

  // 1. คำนวณสรุปผลรายเดือน (Monthly Summary)
  const monthCodes = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthlySummary = monthCodes.map(mo => {
    const moTxs2026 = allCombined.filter(t => t.month === mo && t.year === '2026');
    const pv = moTxs2026.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0);
    const cr = moTxs2026.reduce((sum, t) => sum + (Number(t.totalSaving) || 0), 0);
    const target = pv * (State.targetRate || 0.03);
    const pct = pv > 0 ? (cr / pv) * 100 : 0;
    const status = pv > 0 ? (cr >= target ? 'ได้ตามเป้าหมาย' : 'ไม่ได้ตามเป้าหมาย') : '-';

    const creditTxs = moTxs2026.filter(t => (t.strategy || t.method || '').includes('เครดิต'));
    const creditSaving = creditTxs.reduce((sum, t) => sum + (Number(t.totalSaving) || 0), 0);

    return {
      month: mo,
      pv2021: 0, cr2021: 0, pct2021: 0, status2021: '-',
      pv2026: pv, cr2026: cr, target2026: target, pct2026: pct, status2026: status,
      savingVsTarget: pv > 0 ? (cr - target) : 0,
      pctDiffTarget: target > 0 ? (cr - target) / target : 0,
      creditDiffDays: creditTxs.length > 0 ? 15 : 0,
      creditPOVal: creditTxs.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0),
      creditSaving: creditSaving
    };
  });

  // 2. คำนวณสรุปผลรายปี (Yearly Summary)
  const years = Array.from(new Set(allCombined.map(t => String(t.year || '')))).filter(y => y.match(/^20\d\d$/)).sort();
  if (!years.includes('2026')) years.push('2026');
  const yearlySummary = years.map(yr => {
    const yrTxs = allCombined.filter(t => t.year === yr);
    const pv = yrTxs.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0);
    const cs = yrTxs.reduce((sum, t) => sum + (Number(t.totalSaving) || 0), 0);
    return {
      year: yr,
      purchaseValue: pv,
      costSaving: cs,
      percentSaving: pv > 0 ? cs / pv : 0
    };
  });

  // 3. คำนวณประวัติมูลค่าซื้อ (Purchase History)
  const purchaseHistory = [];
  years.forEach(yr => {
    monthCodes.forEach(mo => {
      const sumPV = allCombined.filter(t => t.year === yr && t.month === mo).reduce((s, t) => s + (Number(t.totalPrice) || 0), 0);
      if (sumPV > 0) {
        purchaseHistory.push({ year: yr, month: mo, purchaseValue: sumPV });
      }
    });
  });

  // 4. คำนวณ Matrix กลยุทธ์ (Strategy Matrix)
  const strategies = ['Avoidance', 'Compare + Negotiate', 'Negotiate', 'Rebate', 'เพิ่มเครดิต'];
  const pics = ['Dusit', 'Pawina', 'Saniya', 'Tanida', 'Yuwanit'];
  const strategyMatrix = strategies.map(strat => {
    const item = { strategy: strat };
    let rowTotal = 0;
    pics.forEach(p => {
      const pSavings = allCombined
        .filter(t => (t.strategy || t.method || '').includes(strat) && (t.pic || '').toLowerCase().includes(p.toLowerCase()))
        .reduce((s, t) => s + (Number(t.totalSaving) || 0), 0);
      item[p] = pSavings;
      rowTotal += pSavings;
    });
    item.Total = rowTotal;
    return item;
  });

  const dataset = {
    title: "QTC ENERGY PCL - KPI Discount Supplier & Procurement Cost Reduction",
    generatedAt: new Date().toISOString(),
    config: {
      targetRate: State.targetRate || 0.03,
      ...customConfig
    },
    monthlySummary,
    yearlySummary,
    purchaseHistory,
    strategyMatrix,
    historicalTransactions,
    recentTransactions
  };
  if (source) {
    const { transactions, ...metadata } = source;
    dataset.workbookSource = { ...metadata, importedRows: transactions.length };
    dataset.config.kaizenParams = source.kaizenParams;
    dataset.purchaseHistory = source.periods.map(p => ({year:p.year, month:p.month, purchaseValue:p.purchase, source:p.purchaseSource}));
    dataset.monthlySummary = monthlySummary.map(row => {
      const p = source.periods.find(p => p.year === '2026' && p.month === row.month);
      if (!p) return row;
      const target = p.purchase === null ? null : p.purchase * State.targetRate;
      return { ...row, partial:p.partial, purchaseSource:p.purchaseSource, pv2026:p.purchase, cr2026:p.savings, target2026:target,
        pct2026:p.purchase > 0 ? p.savings / p.purchase * 100 : null,
        status2026:p.purchase === null ? 'ไม่พร้อมคำนวณ' : p.savings >= target ? 'ได้ตามเป้าหมาย' : 'ไม่ได้ตามเป้าหมาย',
        savingVsTarget:target === null ? null : p.savings - target,
        pctDiffTarget:target > 0 ? (p.savings - target) / target : null,
        creditDiffDays:p.creditDiffDays, creditPOVal:p.creditPOVal, creditSaving:p.creditSaving };
    });
    dataset.yearlySummary = [...new Set(source.periods.map(p => p.year))].map(year => {
      const periods = source.periods.filter(p => p.year === year);
      const knownPurchaseValue = periods.reduce((s,p) => s + (p.purchase ?? 0), 0);
      const incomplete = periods.some(p => p.count > 0 && p.purchase === null);
      const costSaving = periods.reduce((s,p) => s + p.savings, 0);
      return { year, purchaseValue:incomplete ? null : knownPurchaseValue, knownPurchaseValue, costSaving, partial:periods.some(p => p.partial),
        percentSaving:!incomplete && knownPurchaseValue > 0 ? costSaving / knownPurchaseValue : null };
    });
  }
  return dataset;
}

async function initGoogleSheetSync() {
  let config = IS_GITHUB_PAGES
    ? { url: LIVE_SHEET_URL, autoSync: true }
    : { url: '', autoSync: false };

  // 1. อ่านจาก Server ก่อน เพื่อให้ทุกเครื่องที่เปิดใช้การตั้งค่าเดียวกัน
  if (!IS_GITHUB_PAGES) {
    try {
      const res = await fetch('/api/sheet-config');
      if (res.ok) {
        const serverConfig = await res.json();
        if (serverConfig.url) {
          config.url = serverConfig.url;
          config.autoSync = !!serverConfig.autoSync;
        }
      }
    } catch (e) {}
  }

  // 2. ถ้าใน Server ไม่มี ให้อ่านจาก LocalStorage หรือ State.data
  if (!IS_GITHUB_PAGES && !config.url) {
    const saved = localStorage.getItem(GSHEET_STORAGE_KEY);
    if (saved) {
      try {
        config = { ...config, ...JSON.parse(saved) };
      } catch (err) {
        console.error('Error parsing config:', err);
      }
    }
    if (!config.url && State.data?.config?.gsheetUrl) {
      config.url = State.data.config.gsheetUrl;
      config.autoSync = !!State.data.config.gsheetAutoSync;
    }
  }

  const urlInput = document.getElementById('gsheet-url-input');
  const autoSyncCheck = document.getElementById('gsheet-auto-sync');

  if (urlInput) {
    urlInput.value = config.url || '';
    urlInput.readOnly = IS_GITHUB_PAGES;
  }
  if (autoSyncCheck && config.autoSync !== undefined) {
    autoSyncCheck.checked = config.autoSync;
    autoSyncCheck.disabled = IS_GITHUB_PAGES;
  }

  const badge = document.getElementById('gsheet-status-badge');
  if (badge) {
    if (config.url && config.url.trim() !== '') {
      badge.textContent = IS_GITHUB_PAGES ? `🟢 แหล่งข้อมูล Google Sheet สด` : (config.autoSync ? `🟢 ซิงค์ชีตสดอัตโนมัติ` : `🟢 พร้อมซิงค์จาก Google Sheet`);
      badge.className = 'tier-tag tier-high';
    } else {
      badge.textContent = `⚪ ยังไม่มีลิงก์ชีต (รอใส่ URL)`;
      badge.className = 'tier-tag';
    }
  }

  // ดึงข้อมูลสดจาก Google Sheet เฉพาะเมื่อผู้ใช้ระบุ URL ไว้อย่างชัดเจนเท่านั้น (ไม่มีค่าฮาร์ดโค้ดเดิม)
  if (config.autoSync && config.url && config.url.trim() !== '') {
    console.log('🔄 Auto-syncing live from configured Google Sheet URL...');
    await syncGoogleSheetNow(false);
    State.sheetSyncTimer ??= setInterval(() => {
      if (!document.hidden && (IS_GITHUB_PAGES || document.getElementById('gsheet-auto-sync')?.checked)) syncGoogleSheetNow(false);
    }, 5 * 60 * 1000);
  }
}

function extractGoogleSheetInfo(input) {
  if (!input || !input.trim()) {
    return { sheetId: '', gid: '' };
  }
  const trimmed = input.trim();
  
  // Extract Sheet ID
  let sheetId = '';
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1]) {
    sheetId = idMatch[1];
  } else if (!trimmed.includes('/') && trimmed.length > 15) {
    sheetId = trimmed;
  }

  // Extract GID if user passed specific tab URL
  let gid = '';
  const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/);
  if (gidMatch && gidMatch[1]) {
    gid = gidMatch[1];
  }

  return { sheetId, gid };
}


// ตัวแปลงข้อความ CSV เป็นรายการสั่งซื้อ
function parseCSVTextToTransactions(csvText) {
  if (!csvText || !csvText.trim()) return [];
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const parseLine = (text) => {
    const re = /(?!\s*$)\s*(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"]*(?:\\.[^"]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    const items = [];
    text.replace(re, (m0, m1, m2, m3) => {
      if (m1 !== undefined) items.push(m1.replace(/\\'/g, "'"));
      else if (m2 !== undefined) items.push(m2.replace(/\\"/g, '"'));
      else if (m3 !== undefined) items.push(m3);
      return '';
    });
    return items;
  };

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/฿/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const rows = [];
  const startIdx = lines[0].toLowerCase().includes('year') || lines[0].includes('ราคา') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseLine(line);
    if (cells.length < 3) continue;

    const rawYr = cells[0];
    const yr = rawYr ? String(parseInt(rawYr) || rawYr).trim() : '2026';
    let mo = String(cells[1] || 'JAN').toUpperCase().trim();
    if (mo.length > 3) mo = mo.slice(0, 3);

    const po = String(cells[2] || `PO-CSV-${i}`).trim();
    const supp = String(cells[3] || 'ไม่ระบุ').trim();
    const desc = String(cells[4] || '').trim();
    const qty = parseNum(cells[5]);
    const unit = String(cells[6] || 'EA').trim();
    const minPrice = parseNum(cells[7]);
    let totalPrice = parseNum(cells[8]);
    if (totalPrice === 0 && qty > 0 && minPrice > 0) totalPrice = qty * minPrice;

    const negPrice = parseNum(cells[9]) || minPrice;
    let unitDiff = parseNum(cells[10]) || (minPrice - negPrice);
    let totalSaving = parseNum(cells[11]) || (unitDiff * qty);

    let pctDisc = parseNum(cells[12]);
    if (pctDisc === 0 && totalPrice > 0 && totalSaving > 0) {
      pctDisc = totalSaving / totalPrice;
    }
    if (pctDisc > 1) pctDisc = pctDisc / 100;

    const method = String(cells[13] || 'Negotiate').trim();
    const pic = String(cells[14] || 'ไม่ระบุ').trim();
    const remark = String(cells[15] || '').trim();

    if (po || supp !== 'ไม่ระบุ' || totalPrice > 0 || totalSaving > 0) {
      rows.push({
        id: `csv-${i}`,
        globalId: `csv-${i}`,
        year: yr,
        month: mo,
        poNo: po,
        supplier: supp,
        description: desc,
        qty,
        unit,
        minUnitPrice: minPrice,
        totalPrice,
        negotiatedUnitPrice: negPrice,
        unitDifference: unitDiff,
        totalSaving,
        percentDiscount: pctDisc,
        strategy: method,
        method,
        pic,
        remark
      });
    }
  }

  return rows;
}

// นำเข้าข้อมูลจากการวางข้อความ CSV โดยตรง
window.importPastedCSVData = async function() {
  const textarea = document.getElementById('csv-paste-input');
  const text = textarea?.value?.trim() || '';

  if (!text) {
    alert('กรุณาวางข้อมูล CSV หรือข้อความตารางจาก Google Sheet ในช่องข้อความ');
    return;
  }

  try {
    const rows = parseCSVTextToTransactions(text);
    if (rows.length === 0) {
      throw new Error('ไม่สามารถแปลงข้อมูล CSV ได้ กรุณาตรวจสอบหัวคอลัมน์');
    }

    const completeDataset = buildDatasetFromTransactions(rows, { source: 'csv-paste' });

    window.KPI_DATA = completeDataset;
    State.data = completeDataset;
    setupDataset();
    renderAllViews();

    try {
      localStorage.setItem('qtc_custom_dataset', JSON.stringify(completeDataset));
      await fetch('/api/upload-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'Pasted_CSV_Data.xlsx',
          dataset: completeDataset
        })
      });
    } catch (e) {
      console.warn('Saving CSV to backend warning:', e);
    }

    alert(`✅ นำเข้าข้อมูลสำเร็จ!\nแปลงข้อมูลทั้งหมด ${rows.length.toLocaleString()} รายการ และบันทึกลงเซิร์ฟเวอร์เรียบร้อยแล้ว`);
    switchView('dashboard');
  } catch (err) {
    alert(`❌ เกิดข้อผิดพลาด: ${err.message}`);
  }
};

window.syncGoogleSheetNow = async function(showAlert = true) {
  if (State.sheetSyncInProgress) return;
  const urlInput = IS_GITHUB_PAGES
    ? LIVE_SHEET_URL
    : (document.getElementById('gsheet-url-input')?.value.trim() || '');
  const autoSync = IS_GITHUB_PAGES
    ? true
    : (document.getElementById('gsheet-auto-sync')?.checked ?? true);

  const { sheetId } = extractGoogleSheetInfo(urlInput);
  if (!sheetId) {
    if (showAlert) {
      alert('กรุณากรอก Google Sheet URL หรือ Sheet ID ในหน้า "จัดการไฟล์ข้อมูล Excel"\n(ระบบได้ยกเลิกลิงก์เริ่มต้นแล้ว กรุณาวางลิงก์ Google Sheet ของคุณ)');
      switchView('data-import');
      const inputEl = document.getElementById('gsheet-url-input');
      if (inputEl) inputEl.focus();
    }
    return;
  }

  const syncBtn = document.getElementById('btn-sync-gsheet');
  const topbarLabel = document.getElementById('topbar-sync-label');
  const badge = document.getElementById('gsheet-status-badge');

  State.sheetSyncInProgress = true;
  if (syncBtn) syncBtn.disabled = true;
  if (topbarLabel) topbarLabel.textContent = 'กำลังซิงค์...';
  if (badge) badge.textContent = '⏳ กำลังดึงข้อมูลจาก Google Sheets...';

  try {
    const workbookUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    
    const res = await fetch(workbookUrl, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      throw new Error(`ไม่สามารถเชื่อมต่อ Google Sheet ได้ (Status: ${res.status}).\nกรุณาตรวจสอบว่า Google Sheet ตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู (Anyone with the link can view)"`);
    }

    const workbook = XLSX.read(await res.arrayBuffer(), { type: 'array' });
    const source = QTCWorkbook.read(workbook, XLSX);
    const allTransactions = source.transactions;

    if (allTransactions.length === 0) {
      throw new Error('ไม่พบข้อมูลรายการสั่งซื้อใน Google Sheet');
    }

    // สร้างชุดข้อมูลเต็มรูปแบบ (Monthly, Yearly, Matrix, Transactions)
    const completeDataset = buildDatasetFromTransactions(allTransactions, {
      gsheetUrl: urlInput,
      gsheetAutoSync: autoSync
    }, source);
    State.dataQuality = { importedRows: allTransactions.length, skippedRows: source.excluded.length };

    // อัปเดตข้อมูลในระบบแบบ Real-time
    window.KPI_DATA = completeDataset;
    State.data = completeDataset;
    setupDataset();
    renderAllViews();
    applyWorkbookSimulatorInputs();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;

    if (!IS_GITHUB_PAGES) {
      localStorage.setItem(GSHEET_STORAGE_KEY, JSON.stringify({
        url: urlInput,
        autoSync: autoSync,
        lastSync: timeStr
      }));
      try {
        localStorage.setItem('qtc_custom_dataset', JSON.stringify(completeDataset));
      } catch (e) {}
    }

    // บันทึกถาวรลง Backend Server (data.json, data.js และ sheet-config)
    if (!IS_GITHUB_PAGES) try {
      const uploadRes = await fetch('/api/upload-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'Google_Sheets_Live.xlsx',
          dataset: completeDataset
        })
      });

      const configRes = await fetch('/api/sheet-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput,
          autoSync: autoSync
        })
      });
      if (!uploadRes.ok || !configRes.ok) throw new Error('Backend rejected Google Sheet sync');
    } catch (backendErr) {
      console.warn('Backend sync error:', backendErr);
    }

    const quality = document.getElementById('gsheet-quality-summary');
    if (quality && State.dataQuality) {
      quality.textContent = `อ่านครบ ${source.tabs.length} แท็บ • ${State.dataQuality.importedRows.toLocaleString()} รายการ • ไม่สมบูรณ์ ${State.dataQuality.skippedRows.toLocaleString()} แถว • ข้อสังเกต ${source.issues.length} รายการ`;
      quality.style.color = State.dataQuality.skippedRows > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
    }

    if (badge) {
      badge.textContent = `🟢 ซิงค์สดสำเร็จ (${timeStr})`;
      badge.className = 'tier-tag tier-high';
    }
    if (topbarLabel) {
      topbarLabel.textContent = `ซิงค์แล้ว (${timeStr})`;
    }

    if (showAlert) {
      const storageMessage = IS_GITHUB_PAGES
        ? '• หน้าเว็บนี้อ่านข้อมูลสดจาก Google Sheet โดยตรง'
        : '• ข้อมูลถูกบันทึกลงเซิร์ฟเวอร์หลักถาวรแล้ว';
      alert(`✅ ซิงค์ข้อมูลจาก Google Sheet สำเร็จ!\n• นำเข้า: ${allTransactions.length.toLocaleString()} รายการ\n• ไม่รวมแถวว่าง/ไม่สมบูรณ์: ${(State.dataQuality?.skippedRows || 0).toLocaleString()} แถว\n${storageMessage}`);
    }
  } catch (err) {
    console.error('Google Sheet Sync Error:', err);
    const quality = document.getElementById('gsheet-quality-summary');
    if (quality) {
      quality.textContent = `โหลดชีตสดไม่สำเร็จ — แสดงข้อมูลล่าสุดที่โหลดสำเร็จ ณ ${State.data?.generatedAt || 'ไม่ทราบเวลา'}`;
      quality.style.color = 'var(--accent-rose)';
    }
    if (badge) {
      badge.textContent = `🔴 ซิงค์ไม่สำเร็จ`;
      badge.className = 'tier-tag tier-low';
    }
    if (topbarLabel) {
      topbarLabel.textContent = 'ซิงค์ไม่สำเร็จ';
    }
    if (showAlert) {
      alert(`❌ ไม่สามารถซิงค์ข้อมูลได้:\n${err.message}\n\nคำแนะนำ:\n1. ตรวจสอบว่าเปิดแชร์ Google Sheet เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู (Anyone with link can view)"\n2. ตรวจสอบว่าลิงก์ URL ถูกต้องหรือไม่`);
    }
  } finally {
    State.sheetSyncInProgress = false;
    if (syncBtn) syncBtn.disabled = false;
  }
};

window.clearGoogleSheetSettings = async function() {
  if (confirm('คุณต้องการล้างการตั้งค่า Google Sheet หรือไม่?')) {
    localStorage.removeItem(GSHEET_STORAGE_KEY);
    const urlInput = document.getElementById('gsheet-url-input');
    if (urlInput) urlInput.value = '';
    const badge = document.getElementById('gsheet-status-badge');
    if (badge) {
      badge.textContent = '⚪ ยังไม่ได้ตั้งค่าลิงก์ชีต';
      badge.className = 'tier-tag';
    }
    const topbarLabel = document.getElementById('topbar-sync-label');
    if (topbarLabel) topbarLabel.textContent = 'ซิงค์เซิร์ฟเวอร์';

    try {
      await fetch('/api/sheet-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '', autoSync: false })
      });
    } catch (e) {}

    alert('ล้างการตั้งค่าเรียบร้อยแล้ว');
  }
};

// ฟังก์ชันตั้งค่าเป้าหมาย KPI %
window.setTargetRate = function() {
  const input = document.getElementById('target-rate-input');
  if (!input) return;

  let val = parseFloat(input.value);
  if (isNaN(val) || val <= 0 || val > 100) {
    alert('กรุณากรอกเป้าหมายระหว่าง 0.1% ถึง 100% เช่น 3 หรือ 3.0');
    return;
  }

  // หากผู้ใช้เผลอกรอกเป็นทศนิยม เช่น 0.03 ให้ปรับเป็น 3% โดยอัตโนมัติ
  if (val > 0 && val <= 0.1) {
    val = val * 100;
    input.value = val.toFixed(1);
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
    month: 'ALL',
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
    month: 'ALL',
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
    month: 'ALL',
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
    month: 'ALL',
    quarter: 'ALL',
    pic: 'Pawina',
    deadline: '2026-12-31',
    notes: 'ต่อรองราคากลุ่มหม้อแปลงและส่วนประกอบหลัก',
    createdAt: '2026-01-01'
  }
];

function initGoals() {
  const saved = IS_GITHUB_PAGES ? null : localStorage.getItem('qtc_strategic_goals');
  if (saved) {
    try {
      State.goals = JSON.parse(saved);
    } catch (e) {
      State.goals = [...DEFAULT_GOALS];
    }
  } else {
    State.goals = [...DEFAULT_GOALS];
    if (!IS_GITHUB_PAGES) localStorage.setItem('qtc_strategic_goals', JSON.stringify(State.goals));
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

function formatYearBE(yr) {
  if (!yr || yr === 'ALL') return 'ทุกปี';
  const yNum = parseInt(yr, 10);
  if (!isNaN(yNum)) {
    return `ปี ${yNum + 543} (${yNum})`;
  }
  return `ปี ${yr}`;
}

function calculateGoalProgress(goal) {
  let txs = State.transactions || [];

  // กรองตามปี
  if (goal.year && goal.year !== 'ALL') {
    txs = txs.filter(t => t.year === goal.year);
  }
  // กรองตามเดือนจริง หรือไตรมาสเดิม
  if (goal.month && goal.month !== 'ALL') {
    txs = txs.filter(t => t.month === goal.month);
  } else if (goal.quarter && goal.quarter !== 'ALL') {
    const months = QUARTER_MONTHS[goal.quarter] || [];
    txs = txs.filter(t => months.includes(t.month));
  }
  // กรองตาม PIC
  if (goal.pic && goal.pic !== 'ALL') {
    txs = txs.filter(t => (t.pic || '').toLowerCase() === goal.pic.toLowerCase());
  }

  let current = 0;
  let available = true;
  const periods = State.data?.workbookSource?.periods.filter(p =>
    (!goal.year || goal.year === 'ALL' || p.year === goal.year) &&
    (!goal.month || goal.month === 'ALL' || p.month === goal.month) &&
    (goal.month && goal.month !== 'ALL' || !goal.quarter || goal.quarter === 'ALL' || (QUARTER_MONTHS[goal.quarter] || []).includes(p.month)));
  let target = parseFloat(goal.targetValue) || 0;
  let formattedCurrent = '';
  let formattedTarget = '';
  let unit = goal.category === 'savings_rate' ? '%' : '฿';

  if (goal.category === 'savings_thb') {
    current = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    formattedCurrent = formatCurrency(current, 0);
    formattedTarget = formatCurrency(target, 0);
  } else if (goal.category === 'savings_rate') {
    const useOfficial = periods && (!goal.pic || goal.pic === 'ALL');
    const totalPV = useOfficial ? periods.reduce((s,p) => s + (p.purchase ?? 0), 0) : txs.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
    available = !useOfficial || (totalPV > 0 && !periods.some(p => p.count > 0 && p.purchase === null));
    const totalCR = txs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    current = totalPV > 0 ? (totalCR / totalPV) * 100 : 0;
    formattedCurrent = current.toFixed(2) + '%';
    formattedTarget = target.toFixed(2) + '%';
  } else if (goal.category === 'credit_thb') {
    current = txs.filter(t => (t.strategy || '').includes('เครดิต')).reduce((sum, t) => sum + (t.totalSaving || 0), 0);
    if (periods && (!goal.pic || goal.pic === 'ALL')) current = periods.reduce((s,p) => s + p.creditSaving, 0);
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

  if (!available) current = 0;
  const pct = target > 0 ? (current / target) * 100 : 0;
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const isAchieved = pct >= 100;

  // คำนวณยอดที่ยังขาดอีกเพื่อถึงเป้าหมาย (Numbers and Percent to reach goal)
  let remainingVal = 0;
  let surplusVal = 0;
  let remainingPct = 0;
  let formattedGapText = '';
  let formattedGapTag = '';

  if (isAchieved) {
    surplusVal = current - target;
    const surplusPct = pct - 100;
    if (goal.category === 'savings_rate') {
      formattedGapText = `+${surplusVal.toFixed(2)}% เกินเป้า`;
      formattedGapTag = `เกินเป้า +${surplusPct.toFixed(1)}%`;
    } else {
      formattedGapText = `+${formatCurrency(surplusVal, 0)} เกินเป้า`;
      formattedGapTag = `เกินเป้า +${surplusPct.toFixed(1)}%`;
    }
  } else {
    remainingVal = target - current;
    remainingPct = 100 - pct;
    if (goal.category === 'savings_rate') {
      formattedGapText = `ขาดอีก ${remainingVal.toFixed(2)}%`;
      formattedGapTag = `ขาดอีก ${remainingPct.toFixed(1)}%`;
    } else {
      formattedGapText = `ขาดอีก ${formatCurrency(remainingVal, 0)}`;
      formattedGapTag = `ขาดอีก ${remainingPct.toFixed(1)}%`;
    }
  }

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
    available,
    current,
    target,
    pct,
    clampedPct,
    isAchieved,
    remainingVal,
    surplusVal,
    remainingPct,
    formattedCurrent: available ? formattedCurrent + (goal.category === 'savings_rate' && periods?.some(p => p.partial) ? ' (ชั่วคราว)' : '') : 'รอมูลค่าซื้อรวม',
    formattedTarget,
    formattedGapText: available ? formattedGapText : 'รอมูลค่าซื้อรวม',
    formattedGapTag: available ? formattedGapTag : 'ข้อมูลไม่ครบ',
    status: available ? status : 'on-track',
    statusText: available ? statusText : 'ข้อมูลไม่ครบสำหรับ KPI',
    unit,
    txCount: txs.length
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

  const yearText = formatYearBE(State.activeYear);
  const yearTextEl = document.getElementById('goals-scope-year-text');
  if (yearTextEl) yearTextEl.textContent = yearText;

  let goalsList = State.goals || [];
  let achievedCount = 0;
  let totalPctSum = 0;
  let unavailableCount = 0;

  // คำนวณสถิติภาพรวม
  goalsList.forEach(g => {
    const prog = calculateGoalProgress(g);
    if (!prog.available) { unavailableCount++; return; }
    if (prog.status === 'achieved') achievedCount++;
    totalPctSum += prog.clampedPct;
  });

  const totalGoals = goalsList.length;
  const overallAvgPct = totalGoals > unavailableCount ? (totalPctSum / (totalGoals - unavailableCount)).toFixed(1) : '0.0';
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
    dashSub.textContent = `บรรลุเป้าหมายแล้ว ${achievedCount}/${totalGoals} รายการ (เฉลี่ยเฉพาะข้อมูลพร้อม ${overallAvgPct}%)${unavailableCount ? ` · รอข้อมูล ${unavailableCount} รายการ` : ''}`;
  }

  // สร้าง HTML สำหรับการ์ดเป้าหมาย พร้อมตัวเลขและเปอร์เซ็นต์ที่ต้องทำเพิ่ม + คลิกดูกราฟวงกลม
  const generateCardHTML = (g) => {
    const prog = calculateGoalProgress(g);
    const catName = getGoalCategoryName(g.category);
    const scopeYear = formatYearBE(g.year);
    const scopeMonth = (g.month && g.month !== 'ALL')
      ? (THAI_MONTHS[g.month] || g.month)
      : (g.quarter && g.quarter !== 'ALL' ? g.quarter : 'ทั้งปี');
    const scopePIC = g.pic === 'ALL' ? '' : `PIC: ${g.pic}`;

    return `
      <div class="goal-card ${prog.status}" id="goal-card-${g.id}" onclick="openGoalChartModal('${g.id}')" title="คลิกเพื่อดูสถิติและกราฟวงกลม (Pie Chart)">
        <div>
          <div class="goal-meta-tags">
            <span class="goal-tag goal-tag-cat">${catName}</span>
            <span class="goal-tag goal-tag-scope">${scopeYear}</span>
            <span class="goal-tag goal-tag-scope">${scopeMonth}</span>
            ${scopePIC ? `<span class="goal-tag goal-tag-scope">${scopePIC}</span>` : ''}
          </div>
          <div class="goal-card-header">
            <div class="goal-title">${g.title}</div>
            <span class="goal-status-badge ${prog.status}">${prog.statusText}</span>
          </div>
        </div>

        <!-- กล่องข้อมูลตัวเลขและเปอร์เซ็นต์สู่เป้าหมาย (Numbers & Percentages to reach goal) -->
        <div class="goal-metrics-grid">
          <div class="goal-metric-cell">
            <span class="goal-metric-lbl">ทำได้แล้ว</span>
            <span class="goal-metric-val" style="color: var(--accent-emerald);">${prog.formattedCurrent}</span>
            <span class="goal-metric-gap-tag surplus">${prog.available ? prog.pct.toFixed(1) + '%' : '—'}</span>
          </div>
          <div class="goal-metric-cell">
            <span class="goal-metric-lbl">เป้าหมาย</span>
            <span class="goal-metric-val" style="color: var(--text-primary);">${prog.formattedTarget}</span>
            <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">เป้า 100%</span>
          </div>
          <div class="goal-metric-cell">
            <span class="goal-metric-lbl">${prog.isAchieved ? 'ยอดที่เกินเป้า' : 'ยอดที่ขาดอีก (Gap)'}</span>
            <span class="goal-metric-val" style="color: ${prog.isAchieved ? 'var(--accent-emerald)' : 'var(--accent-orange)'};">${prog.formattedGapText}</span>
            <span class="goal-metric-gap-tag ${prog.isAchieved ? 'surplus' : 'deficit'}">${prog.formattedGapTag}</span>
          </div>
        </div>

        <div class="goal-progress-wrap">
          <div class="goal-progress-labels">
            <span style="color: var(--text-secondary);">ความคืบหน้า: <b style="color: var(--text-primary);">${prog.formattedCurrent}</b> / ${prog.formattedTarget}</span>
            <span style="color: ${prog.status === 'achieved' ? 'var(--accent-emerald)' : 'var(--accent-primary)'}; font-family: var(--font-display); font-weight: 700;">${prog.available ? prog.pct.toFixed(1) + '%' : '—'}</span>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width: ${prog.clampedPct}%;"></div>
          </div>
        </div>

        ${g.notes ? `<div class="goal-card-note">${g.notes}</div>` : ''}

        <div class="goal-details-row" onclick="event.stopPropagation()">
          <div class="goal-deadline-text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ครบกำหนด: ${g.deadline || 'ไม่ระบุ'}
          </div>
          <div class="goal-card-actions">
            <button class="goal-action-btn" onclick="event.stopPropagation(); openGoalChartModal('${g.id}')" title="คลิกดูสถิติและกราฟวงกลม">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
              กราฟวงกลม
            </button>
            <button class="goal-action-btn" onclick="event.stopPropagation(); openEditGoalModal('${g.id}')" title="แก้ไขเป้าหมาย">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              แก้ไข
            </button>
            <button class="goal-action-btn delete-btn" onclick="event.stopPropagation(); deleteGoal('${g.id}')" title="ลบเป้าหมาย">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  };

  // เรนเดอร์บน Dashboard
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

// -------------------------------------------------------------
// ระบบแสดงกราฟวงกลมและการเจาะลึกสถิติเป้าหมาย (Goal Pie Chart Modal)
// -------------------------------------------------------------
State.activeGoalChartId = null;
State.activeGoalChartView = 'progress';

window.openGoalChartModal = function(goalId) {
  const goal = (State.goals || []).find(g => g.id === goalId);
  if (!goal) return;

  State.activeGoalChartId = goalId;
  State.activeGoalChartView = State.activeGoalChartView || 'progress';

  const modal = document.getElementById('goal-chart-modal');
  if (!modal) return;

  const prog = calculateGoalProgress(goal);

  // ข้อมูลส่วนหัว
  document.getElementById('gdetail-cat-badge').textContent = getGoalCategoryName(goal.category);
  document.getElementById('gdetail-year-badge').textContent = formatYearBE(goal.year);
  const scopeMonthText = (goal.month && goal.month !== 'ALL')
    ? (THAI_MONTHS[goal.month] || goal.month)
    : (goal.quarter && goal.quarter !== 'ALL' ? goal.quarter : 'ทั้งปี');
  const mBadge = document.getElementById('gdetail-month-badge') || document.getElementById('gdetail-quarter-badge');
  if (mBadge) mBadge.textContent = scopeMonthText;
  
  const statusBadge = document.getElementById('gdetail-status-badge');
  statusBadge.className = `goal-status-badge ${prog.status}`;
  statusBadge.textContent = prog.statusText;

  document.getElementById('gdetail-title').textContent = goal.title;

  // 4-Card Summary Matrix
  document.getElementById('gdetail-val-target').textContent = prog.formattedTarget;
  document.getElementById('gdetail-sub-target').textContent = `ขอบเขต: ${formatYearBE(goal.year)} (${scopeMonthText})`;

  document.getElementById('gdetail-val-current').textContent = prog.formattedCurrent;
  document.getElementById('gdetail-sub-current').textContent = prog.available ? `อัตราความสำเร็จ ${prog.pct.toFixed(1)}%` : 'ข้อมูลไม่ครบสำหรับ KPI';

  const lblGap = document.getElementById('gdetail-lbl-gap');
  const valGap = document.getElementById('gdetail-val-gap');
  const subGap = document.getElementById('gdetail-sub-gap');

  if (prog.isAchieved) {
    lblGap.textContent = 'ยอดที่เกินเป้าหมาย';
    valGap.style.color = 'var(--accent-emerald)';
    valGap.textContent = `+${goal.category === 'savings_rate' ? prog.surplusVal.toFixed(2) + '%' : formatCurrency(prog.surplusVal, 0)}`;
    subGap.textContent = `เกินเป้าหมายที่ตั้งไว้ +${(prog.pct - 100).toFixed(1)}%`;
  } else {
    lblGap.textContent = '⏳ ยอดที่ขาดอีก (Remaining to Goal)';
    valGap.style.color = 'var(--accent-orange)';
    valGap.textContent = goal.category === 'savings_rate' ? `${prog.remainingVal.toFixed(2)}%` : formatCurrency(prog.remainingVal, 0);
    subGap.textContent = `ขาดอีก ${prog.remainingPct.toFixed(1)}% เพื่อถึงเป้า 100%`;
  }

  if (!prog.available) {
    document.getElementById('goal-chart-legend').replaceChildren();
    valGap.textContent = '—';
    subGap.textContent = 'รอมูลค่าซื้อรวม';
  }
  document.getElementById('gdetail-val-pct').textContent = prog.available ? prog.pct.toFixed(1) + '%' : '—';
  document.getElementById('gdetail-sub-deadline').textContent = `ครบกำหนด: ${goal.deadline || '31 ธ.ค. 2026'}`;

  // Progress Bar
  document.getElementById('gdetail-progress-ratio').textContent = `${prog.formattedCurrent} / ${prog.formattedTarget}`;
  const pill = document.getElementById('gdetail-progress-pill');
  pill.className = `kpi-badge ${prog.isAchieved ? 'success' : (prog.pct < 50 ? 'danger' : 'warning')}`;
  pill.textContent = prog.available ? `${prog.pct.toFixed(1)}% สำเร็จ` : 'ข้อมูลไม่ครบ';

  document.getElementById('gdetail-progress-bar-fill').style.width = `${prog.clampedPct}%`;

  // Notes
  const notesBox = document.getElementById('gdetail-notes-box');
  const notesText = document.getElementById('gdetail-notes-text');
  if (goal.notes) {
    notesBox.style.display = 'block';
    notesText.textContent = goal.notes;
  } else {
    notesBox.style.display = 'none';
  }

  // ซิงค์ปุ่มแท็บ
  document.querySelectorAll('#goal-chart-view-pills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-chart-view') === State.activeGoalChartView);
  });

  renderGoalPieChart();
  modal.classList.add('active');
};

window.closeGoalChartModal = function() {
  const modal = document.getElementById('goal-chart-modal');
  if (modal) modal.classList.remove('active');
  if (State.charts.goalPie) {
    State.charts.goalPie.destroy();
    State.charts.goalPie = null;
  }
};

window.switchGoalChartView = function(viewType) {
  State.activeGoalChartView = viewType;
  document.querySelectorAll('#goal-chart-view-pills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-chart-view') === viewType);
  });
  renderGoalPieChart();
};

window.editCurrentChartGoal = function() {
  if (State.activeGoalChartId) {
    const id = State.activeGoalChartId;
    closeGoalChartModal();
    openEditGoalModal(id);
  }
};

function renderGoalPieChart() {
  const goalId = State.activeGoalChartId;
  const goal = (State.goals || []).find(g => g.id === goalId);
  if (!goal) return;

  const canvas = document.getElementById('goalPieChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (State.charts.goalPie) {
    State.charts.goalPie.destroy();
    State.charts.goalPie = null;
  }

  const prog = calculateGoalProgress(goal);
  const isDark = State.theme === 'dark';
  canvas.hidden = !prog.available;
  if (!prog.available) {
    document.getElementById('gdetail-breakdown-title').textContent = 'รอมูลค่าซื้อรวมสำหรับ KPI';
    document.getElementById('gdetail-breakdown-tbody').innerHTML = '<tr><td colspan="3">ข้อมูลไม่ครบ — ยังไม่คำนวณอัตราความสำเร็จ</td></tr>';
    return;
  }
  const textColor = isDark ? '#f1f5f9' : '#0f172a';

  let labels = [];
  let data = [];
  let bgColors = [];
  let hoverColors = [];
  let breakdownRows = [];
  let chartTitle = '';

  // ดึงรายการสั่งซื้อที่เข้าข่ายของเป้าหมายนี้
  let txs = State.transactions || [];
  if (goal.year && goal.year !== 'ALL') txs = txs.filter(t => t.year === goal.year);
  if (goal.month && goal.month !== 'ALL') {
    txs = txs.filter(t => t.month === goal.month);
  } else if (goal.quarter && goal.quarter !== 'ALL') {
    const ms = QUARTER_MONTHS[goal.quarter] || [];
    txs = txs.filter(t => ms.includes(t.month));
  }
  if (goal.pic && goal.pic !== 'ALL') {
    txs = txs.filter(t => (t.pic || '').toLowerCase() === goal.pic.toLowerCase());
  }

  const viewType = State.activeGoalChartView || 'progress';

  if (viewType === 'progress') {
    chartTitle = 'สัดส่วนความคืบหน้าเทียบเป้าหมาย 100%';
    document.getElementById('gdetail-th-name').textContent = 'สถานะความก้าวหน้า';
    document.getElementById('gdetail-th-val').textContent = goal.category === 'savings_rate' ? 'อัตรา (%)' : 'มูลค่า (บาท)';

    if (prog.isAchieved) {
      labels = ['เป้าหมายที่ตั้งไว้ (Target)', 'ยอดที่เกินเป้าหมาย (Surplus)'];
      data = [prog.target, prog.surplusVal];
      bgColors = ['#0284c7', '#10b981'];
      hoverColors = ['#0369a1', '#059669'];

      const totalPie = prog.current;
      breakdownRows = [
        { name: 'เป้าหมายที่ตั้งไว้', val: goal.category === 'savings_rate' ? prog.target.toFixed(2) + '%' : formatCurrency(prog.target, 0), pct: totalPie > 0 ? ((prog.target / totalPie) * 100).toFixed(1) + '%' : '100%' },
        { name: 'ยอดที่เกินเป้าหมาย', val: goal.category === 'savings_rate' ? `+${prog.surplusVal.toFixed(2)}%` : `+${formatCurrency(prog.surplusVal, 0)}`, pct: totalPie > 0 ? ((prog.surplusVal / totalPie) * 100).toFixed(1) + '%' : '0%' }
      ];
    } else {
      labels = ['ทำได้แล้ว (Achieved)', 'ยอดที่ยังขาดอีก (Gap to 100%)'];
      data = [prog.current, prog.remainingVal];
      bgColors = ['#10b981', '#f59e0b'];
      hoverColors = ['#059669', '#d97706'];

      const totalPie = prog.target;
      breakdownRows = [
        { name: 'ทำได้แล้ว', val: goal.category === 'savings_rate' ? prog.current.toFixed(2) + '%' : formatCurrency(prog.current, 0), pct: prog.pct.toFixed(1) + '%' },
        { name: 'ยอดที่ยังขาดอีก', val: goal.category === 'savings_rate' ? prog.remainingVal.toFixed(2) + '%' : formatCurrency(prog.remainingVal, 0), pct: prog.remainingPct.toFixed(1) + '%' }
      ];
    }

  } else if (viewType === 'strategy') {
    chartTitle = 'สัดส่วนผลประหยัดจำแนกตามกลยุทธ์จัดซื้อ';
    document.getElementById('gdetail-th-name').textContent = 'กลยุทธ์การต่อรอง';
    document.getElementById('gdetail-th-val').textContent = 'ยอดประหยัด (บาท)';

    const stratMap = {};
    txs.forEach(t => {
      const s = t.strategy || 'อื่นๆ';
      stratMap[s] = (stratMap[s] || 0) + (t.totalSaving || 0);
    });

    const totalSaving = Object.values(stratMap).reduce((sum, v) => sum + v, 0);

    let idx = 0;
    Object.entries(stratMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([strat, val]) => {
        if (val > 0) {
          const color = STRATEGY_COLOR_MAP[strat] || DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length];
          labels.push(strat);
          data.push(val);
          bgColors.push(color);
          hoverColors.push(color);
          breakdownRows.push({
            name: strat,
            val: formatCurrency(val, 0),
            pct: totalSaving > 0 ? ((val / totalSaving) * 100).toFixed(1) + '%' : '0.0%'
          });
          idx++;
        }
      });

    if (data.length === 0) {
      labels = ['ไม่มีข้อมูลกลยุทธ์'];
      data = [1];
      bgColors = ['#64748b'];
      hoverColors = ['#475569'];
      breakdownRows.push({ name: 'ไม่มีข้อมูลรายการจัดซื้อ', val: '฿0', pct: '0%' });
    }

  } else if (viewType === 'pic') {
    chartTitle = 'สัดส่วนผลงานจำแนกตามเจ้าหน้าที่จัดซื้อ (PIC)';
    document.getElementById('gdetail-th-name').textContent = 'ผู้รับผิดชอบ (PIC)';
    document.getElementById('gdetail-th-val').textContent = 'ยอดประหยัด (บาท)';

    const picMap = {};
    txs.forEach(t => {
      const p = t.pic || 'Unassigned';
      picMap[p] = (picMap[p] || 0) + (t.totalSaving || 0);
    });

    const totalSaving = Object.values(picMap).reduce((sum, v) => sum + v, 0);

    let idx = 0;
    Object.entries(picMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pic, val]) => {
        if (val > 0) {
          const color = PIC_COLOR_MAP[pic] || DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length];
          labels.push(pic);
          data.push(val);
          bgColors.push(color);
          hoverColors.push(color);
          breakdownRows.push({
            name: `👤 ${pic}`,
            val: formatCurrency(val, 0),
            pct: totalSaving > 0 ? ((val / totalSaving) * 100).toFixed(1) + '%' : '0.0%'
          });
          idx++;
        }
      });

    if (data.length === 0) {
      labels = ['ไม่มีข้อมูล PIC'];
      data = [1];
      bgColors = ['#64748b'];
      hoverColors = ['#475569'];
      breakdownRows.push({ name: 'ไม่มีข้อมูลรายการจัดซื้อ', val: '฿0', pct: '0%' });
    }

  } else if (viewType === 'monthly') {
    chartTitle = 'สัดส่วนผลประหยัดจำแนกตามรายเดือน';
    document.getElementById('gdetail-th-name').textContent = 'เดือนที่บันทึกผลงาน';
    document.getElementById('gdetail-th-val').textContent = 'ยอดประหยัด (บาท)';

    const monthMap = {};
    MONTH_ORDER.forEach(m => { monthMap[m] = 0; });
    txs.forEach(t => {
      const m = (t.month || 'JAN').toUpperCase();
      if (monthMap[m] !== undefined) {
        monthMap[m] += (t.totalSaving || 0);
      }
    });

    const totalSaving = Object.values(monthMap).reduce((sum, v) => sum + v, 0);

    let idx = 0;
    MONTH_ORDER.forEach(m => {
      const val = monthMap[m];
      if (val > 0) {
        const color = MONTH_COLOR_MAP[m] || DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length];
        labels.push(THAI_MONTHS[m] || m);
        data.push(val);
        bgColors.push(color);
        hoverColors.push(color);
        breakdownRows.push({
          name: `📅 ${THAI_MONTHS[m] || m}`,
          val: formatCurrency(val, 0),
          pct: totalSaving > 0 ? ((val / totalSaving) * 100).toFixed(1) + '%' : '0.0%'
        });
        idx++;
      }
    });

    if (data.length === 0) {
      labels = ['ยังไม่มีข้อมูลรายเดือน'];
      data = [1];
      bgColors = ['#64748b'];
      hoverColors = ['#475569'];
      breakdownRows.push({ name: 'ยังไม่มีข้อมูลผลประหยัด', val: '฿0', pct: '0%' });
    }
  }

  document.getElementById('gdetail-breakdown-title').textContent = chartTitle;

  // วาดกราฟวงกลมด้วย Chart.js (Donut Chart with Smooth Animations)
  State.charts.goalPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors,
        hoverBackgroundColor: hoverColors,
        borderColor: isDark ? '#1e293b' : '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const val = context.raw || 0;
              if (viewType === 'progress' && goal.category === 'savings_rate') {
                return ` ${label}: ${Number(val).toFixed(2)}%`;
              }
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` ${label}: ${formatCurrency(val, 0)} (${pct}%)`;
            }
          }
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 750,
        easing: 'easeOutQuart'
      }
    }
  });

  // สร้าง Custom Legend
  const legendContainer = document.getElementById('goal-chart-legend');
  if (legendContainer) {
    legendContainer.innerHTML = labels.map((l, i) => `
      <div class="goal-legend-pill">
        <span class="goal-legend-dot" style="background: ${bgColors[i] || '#ccc'};"></span>
        <span>${l}</span>
      </div>
    `).join('');
  }

  // สร้างแถวในตารางรายละเอียดสัดส่วน
  const tbody = document.getElementById('gdetail-breakdown-tbody');
  if (tbody) {
    tbody.innerHTML = breakdownRows.map(row => `
      <tr>
        <td style="font-weight: 600;">${row.name}</td>
        <td style="text-align: right; font-family: var(--font-display); font-weight: 700; color: var(--accent-primary);">${row.val}</td>
        <td style="text-align: right; font-family: var(--font-display); font-weight: 700;">${row.pct}</td>
      </tr>
    `).join('');
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
  const monthInput = document.getElementById('goal-input-month') || document.getElementById('goal-input-quarter');
  if (monthInput) monthInput.value = State.activeMonth || 'ALL';
  document.getElementById('goal-input-deadline').value = '2026-12-31';
  handleGoalCategoryChange();

  if (modalTitle) modalTitle.textContent = 'เพิ่มเป้าหมายจัดซื้อใหม่';
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
  const monthInput = document.getElementById('goal-input-month') || document.getElementById('goal-input-quarter');
  if (monthInput) monthInput.value = goal.month || goal.quarter || 'ALL';
  document.getElementById('goal-input-pic').value = goal.pic || 'ALL';
  document.getElementById('goal-input-deadline').value = goal.deadline || '2026-12-31';
  document.getElementById('goal-input-notes').value = goal.notes || '';

  handleGoalCategoryChange();
  if (modalTitle) modalTitle.textContent = 'แก้ไขเป้าหมายจัดซื้อ';
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
  const monthInput = document.getElementById('goal-input-month') || document.getElementById('goal-input-quarter');
  const month = monthInput ? monthInput.value : 'ALL';
  const quarter = month; // เก็บไว้เป็น alias เพื่อ backward compatibility
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
        month,
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
      month,
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


