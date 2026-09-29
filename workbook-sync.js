/* Shared by the public dashboard and the workbook reconciliation check. */
globalThis.QTCWorkbook = (() => {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  function read(workbook, XLSX) {
    const tabs = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const range = sheet['!ref'] || 'A1';
      const start = XLSX.utils.decode_range(range).s;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true });
      const errors = Object.entries(sheet).filter(([address, cell]) => !address.startsWith('!') && (cell.t === 'e' || /^#(REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!)/.test(String(cell.v))))
        .map(([cell, value]) => ({ cell, value: value.w || String(value.v), formula: value.f || '' }));
      for (const error of errors) {
        const address = XLSX.utils.decode_cell(error.cell);
        if (rows[address.r - start.r]) rows[address.r - start.r][address.c - start.c] = error.value;
      }
      return { name, range, rows: rows.map((values, index) => ({ row: start.r + index + 1, values })).filter(row => row.values.some(v => v !== '')), startColumn: start.c, errors };
    });
    const tab = name => tabs.find(t => t.name.trim() === name);
    if (!tab('Data') || !tab('สรุป-รายเดือน') || !tab('มูลค่าซื้อ')) throw Error('ไม่พบแท็บ Data / สรุป-รายเดือน / มูลค่าซื้อ ใน workbook');
    const issues = [];
    const transactions = [];
    const excluded = [];
    const duplicateCounts = new Map();
    const transactionTabs = tabs.filter(t => t.rows.slice(0,10).some(r => r.values.some(v => String(v).toLowerCase().includes('po no.'))));
    // Data is the master. Match occurrence counts across tabs; preserve repeated lines within Data.
    transactionTabs.sort((a,b) => Number(b.name === 'Data') - Number(a.name === 'Data'));
    for (const source of transactionTabs) {
      source.role = source.name === 'Data' ? 'รายการจัดซื้อหลัก' : 'รายการจัดซื้อเพิ่มเติม / ตรวจสอบซ้ำ';
      source.imported = 0;
      source.duplicates = 0;
      const headerIndex = source.rows.findIndex(r => r.values.some(v => String(v).toLowerCase().includes('po no.')));
      const header = source.rows[headerIndex].values.map(v => String(v).trim().toLowerCase());
      const yearColumn = header.indexOf('year');
      const offset = yearColumn >= 0 ? 1 : 0;
      const seen = new Map();
      for (const row of source.rows.slice(headerIndex + 1)) {
        const v = row.values;
        const month = String(v[offset] || '').trim().toUpperCase();
        const poNo = String(v[offset + 1] || '').trim();
        const supplier = String(v[offset + 2] || '').trim();
        if (!months.includes(month) || (!poNo && !supplier)) continue;
        const poYear = /^PO[- ]?(\d{2})/i.exec(poNo);
        const year = yearColumn >= 0 ? String(v[yearColumn]) : poYear ? `20${poYear[1]}` : '';
        const totalPrice = number(v[offset + 7]);
        const totalSaving = number(v[offset + 10]);
        if (totalPrice === null || totalPrice <= 0 || totalSaving === null) {
          excluded.push({ sheet: source.name, row: row.row, year, month, poNo, totalPrice, totalSaving });
          continue;
        }
        const tx = { year, month, poNo, supplier, description: String(v[offset + 3] || '').trim(), qty: number(v[offset + 4]) || 0,
          unit: String(v[offset + 5] || ''), minUnitPrice: number(v[offset + 6]), totalPrice,
          negotiatedUnitPrice: number(v[offset + 8]), unitDifference: number(v[offset + 9]), totalSaving,
          percentDiscount: number(v[offset + 11]) ?? totalSaving / totalPrice,
          method: String(v[offset + 12] || 'ไม่ระบุ').trim(), pic: String(v[offset + 13] || 'ไม่ระบุ').trim() };
        // A PO can be booked in the next year. The master year wins over an inferred PO-prefix year.
        const { year: ignoredYear, ...identity } = tx;
        const key = JSON.stringify(identity);
        const occurrence = (seen.get(key) || 0) + 1;
        if (occurrence <= (duplicateCounts.get(key) || 0)) { seen.set(key, occurrence); source.duplicates++; continue; }
        if (!/^20\d{2}$/.test(year)) {
          excluded.push({ sheet: source.name, row: row.row, year, month, poNo, totalPrice, totalSaving });
          continue;
        }
        seen.set(key, occurrence);
        if (!poNo) issues.push(`${source.name} แถว ${row.row}: ไม่มีเลข PO — ใช้ปี เดือน และยอดเงินที่ระบุในต้นทาง`);
        if (yearColumn < 0) issues.push(`${source.name} แถว ${row.row}: ใช้ปี ${year} จากเลข PO กรุณาตรวจสอบปีบันทึก`);
        transactions.push({ ...tx, strategy: tx.method, remark: String(v[offset + 14] || ''), id: `${source.name}:${row.row}`, globalId: `${source.name}:${row.row}`, sourceSheet: source.name, sourceRow: row.row });
        source.imported++;
      }
      for (const [key, count] of seen) duplicateCounts.set(key, Math.max(count, duplicateCounts.get(key) || 0));
    }
    if (!transactions.length) throw Error('ไม่พบรายการจัดซื้อที่สมบูรณ์');
    const monthlyTab = tab('สรุป-รายเดือน');
    monthlyTab.role = 'มูลค่าซื้อรายเดือน / เครดิต / ตรวจสอบผลประหยัด';
    const header = monthlyTab.rows[0].values;
    const yearIndex = header.findIndex(v => String(v).trim() === 'Year');
    const reportYear = String(header[yearIndex + 1]);
    if (!/^20\d{2}$/.test(reportYear)) throw Error('ไม่พบปีรายงานในสรุป-รายเดือน');
    const sourceMonthly = monthlyTab.rows.filter(r => months.includes(r.values[0])).map(r => ({
      year: reportYear, month: r.values[0], purchase: number(r.values[5]), savings: number(r.values[6]),
      creditDiffDays: number(r.values[19]), creditPOVal: number(r.values[20]), creditSaving: number(r.values[21]), row: r.row
    }));
    const purchaseTab = tab('มูลค่าซื้อ');
    purchaseTab.role = 'มูลค่าซื้อรวมรายปีและเดือน';
    const purchaseRows = purchaseTab.rows.filter(r => /^20\d{2}$/.test(String(r.values[0])) && months.includes(r.values[1]));
    const periods = [];
    const years = [...new Set([...transactions.map(t => t.year), ...purchaseRows.map(r => String(r.values[0])), reportYear])].sort();
    for (const year of years) for (const month of months) {
      const txs = transactions.filter(t => t.year === year && t.month === month);
      const summary = sourceMonthly.find(r => r.year === year && r.month === month);
      const purchases = purchaseRows.filter(r => String(r.values[0]) === year && r.values[1] === month && number(r.values[2]) !== null);
      const sourcePurchase = purchases.length ? purchases.reduce((s,r) => s + r.values[2], 0) : null;
      const officialPurchase = sourcePurchase > 0 ? sourcePurchase : summary?.purchase > 0 ? summary.purchase : null;
      const savings = txs.reduce((s,t) => s + t.totalSaving, 0);
      const poPurchase = txs.reduce((s,t) => s + t.totalPrice, 0);
      const partial = officialPurchase === null && txs.length > 0;
      const purchase = officialPurchase ?? (poPurchase > 0 ? poPurchase : null);
      const purchaseSource = sourcePurchase > 0 ? 'มูลค่าซื้อ' : summary?.purchase > 0 ? 'สรุป-รายเดือน' : partial ? 'ยอด PO ที่บันทึกแล้ว (ชั่วคราว ไม่ใช่มูลค่าซื้อรวม)' : 'ยังไม่มีข้อมูล';
      if (summary?.savings !== null && summary?.savings !== undefined && Math.abs(summary.savings - savings) > 0.02)
        issues.push(`${year} ${month}: สรุป-รายเดือน savings ${summary.savings.toFixed(2)} / รายการสมบูรณ์ ${savings.toFixed(2)}`);
      if (sourcePurchase > 0 && summary?.purchase > 0 && Math.abs(sourcePurchase - summary.purchase) > 0.02)
        issues.push(`${year} ${month}: มูลค่าซื้อ ${sourcePurchase.toFixed(2)} / สรุป-รายเดือน ${summary.purchase.toFixed(2)}`);
      if (partial) issues.push(`${year} ${month}: KPI ชั่วคราว ใช้ยอด PO ที่บันทึกแล้ว รอมูลค่าซื้อรวม`);
      periods.push({ year, month, purchase, officialPurchase, partial, poPurchase, savings, count: txs.length, purchaseSource,
        creditSaving: summary?.creditSaving ?? 0, creditPOVal: summary?.creditPOVal ?? 0, creditDiffDays: summary?.creditDiffDays ?? 0 });
    }
    for (const source of tabs) {
      source.role ||= ({ 'Sheet2': 'สรุปปัดเศษเพื่ออ้างอิง (ไม่นับซ้ำ)', 'สรุป-รายปี': 'ตรวจสอบยอดรายปี (ไม่นับซ้ำ)', 'Sheet4': 'ตารางกลยุทธ์เดิมเพื่ออ้างอิง (ไม่นับซ้ำ)', 'Kaizen Cost saving': 'สมมติฐานเครื่องมือ Kaizen', 'Set': 'ตารางรหัสเดือน' })[source.name.trim()] || 'ข้อมูลอ้างอิง — ต้องตรวจสอบการใช้งาน';
      for (const error of source.errors) issues.push(`${source.name}!${error.cell}: ${error.value}`);
    }
    for (const row of tab('สรุป-รายปี')?.rows || []) {
      const year = String(row.values[0]);
      if (!years.includes(year)) continue;
      const matched = periods.filter(p => p.year === year);
      const expectedPurchase = matched.reduce((s,p) => s + (p.purchase ?? 0), 0);
      const reportedPurchase = number(row.values[1]);
      if (reportedPurchase !== null && Math.abs(reportedPurchase - expectedPurchase) > 0.02)
        issues.push(`สรุป-รายปี แถว ${row.row}: ${year} มูลค่าซื้อ ${reportedPurchase.toFixed(2)} / รวมรายเดือน ${expectedPurchase.toFixed(2)}`);
    }
    const kaizen = tab('Kaizen Cost saving');
    const kaizenParams = {};
    for (const [label, key] of Object.entries({ 'ประหยัดเวลาได้':'savedMinutesPerJob', 'จำนวนงาน':'jobsPerMonth', 'ค่าแรง':'hourlyWage', 'ทำงาน':'workDaysPerMonth', 'จำนวน':'monthsPerYear', 'ค่าปริ้นท์สี':'colorPrintPerPage', 'ค่าปริ้นท์ขาวดำ':'blackWhitePrintPerPage' })) {
      const row = kaizen?.rows.find(r => String(r.values[0]).trim() === label);
      if (row && number(row.values[1]) !== null) kaizenParams[key] = row.values[1];
    }
    return { tabs, transactions, periods, sourceMonthly, reportYear, issues, excluded, kaizenParams };
  }
  return { read };
})();
