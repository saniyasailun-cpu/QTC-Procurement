import * as XLSX from "xlsx";

export function parseExcelWorkbook(buffer: Buffer): any {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = wb.SheetNames || [];

  const parseNum = (val: any): number => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, "").replace(/฿/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // 1. ตรวจสอบ Sheet Data และ Improve#1
  let historicalTransactions: any[] = [];
  let recentTransactions: any[] = [];

  const hasDataSheet = sheetNames.includes("Data");
  const hasImproveSheet = sheetNames.some(s => s.toLowerCase().includes("improve"));

  if (hasDataSheet) {
    const dataRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets["Data"], { header: 1, defval: "" });
    for (let i = 1; i < dataRows.length; i++) {
      const r = dataRows[i];
      if (!r || r.length === 0) continue;
      const po = String(r[2] || "").trim();
      const supp = String(r[3] || "").trim();
      if (!po && !supp) continue;
      historicalTransactions.push({
        id: `D-${i}`,
        globalId: `D-${i}`,
        year: String(r[0] || "2023").trim(),
        month: String(r[1] || "JAN").trim().toUpperCase(),
        poNo: po,
        supplier: supp,
        description: String(r[4] || "").trim(),
        qty: parseNum(r[5]),
        unit: String(r[6] || "EA").trim(),
        minUnitPrice: parseNum(r[7]),
        totalPrice: parseNum(r[8]),
        negotiatedUnitPrice: parseNum(r[9]),
        unitDifference: parseNum(r[10]),
        totalSaving: parseNum(r[11]),
        percentDiscount: parseNum(r[12]),
        strategy: String(r[13] || "Negotiate").trim(),
        pic: String(r[14] || "ไม่ระบุ").trim(),
        remark: String(r[15] || "").trim(),
      });
    }
  }

  const impSheetName = sheetNames.find(s => s.toLowerCase().includes("improve")) || "Improve#1";
  if (wb.Sheets[impSheetName]) {
    const impRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[impSheetName], { header: 1, defval: "" });
    for (let i = 3; i < impRows.length; i++) {
      const r = impRows[i];
      if (!r || r.length === 0) continue;
      const po = String(r[1] || "").trim();
      const supp = String(r[2] || "").trim();
      if (!po && !supp) continue;
      recentTransactions.push({
        id: `IMP-${i - 2}`,
        globalId: `IMP-${i - 2}`,
        year: "2026",
        month: String(r[0] || "JAN").trim().toUpperCase(),
        poNo: po,
        supplier: supp,
        description: String(r[3] || "").trim(),
        qty: parseNum(r[4]),
        unit: String(r[5] || "EA").trim(),
        minUnitPrice: parseNum(r[6]),
        totalPrice: parseNum(r[7]),
        negotiatedUnitPrice: parseNum(r[8]),
        unitDifference: parseNum(r[9]),
        totalSaving: parseNum(r[10]),
        percentDiscount: parseNum(r[11]),
        strategy: String(r[12] || "Negotiate").trim(),
        pic: String(r[13] || "ไม่ระบุ").trim(),
        remark: String(r[14] || "").trim(),
      });
    }
  }

  // หากไม่มีชีตมาตรฐาน ให้ดึงรายการจากทุกชีต
  if (!hasDataSheet && !hasImproveSheet) {
    const allParsed: any[] = [];
    sheetNames.forEach((sName, sIdx) => {
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1, defval: "" });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const po = String(r[1] || r[2] || "").trim();
        const supp = String(r[2] || r[3] || "").trim();
        const totalP = parseNum(r[7] || r[8]);
        const totalS = parseNum(r[9] || r[10] || r[11]);
        if (!po && !supp && totalP === 0 && totalS === 0) continue;
        allParsed.push({
          id: `GEN-${sIdx}-${i}`,
          globalId: `GEN-${sIdx}-${i}`,
          year: String(r[0] || "2026").trim(),
          month: String(r[1] || "JAN").trim().toUpperCase(),
          poNo: po || `PO-${i}`,
          supplier: supp || "ไม่ระบุ",
          description: String(r[3] || r[4] || "").trim(),
          qty: parseNum(r[4] || r[5] || 1),
          unit: String(r[5] || r[6] || "EA").trim(),
          minUnitPrice: parseNum(r[6] || r[7]),
          totalPrice: totalP,
          negotiatedUnitPrice: parseNum(r[8] || r[9]),
          unitDifference: parseNum(r[9] || r[10]),
          totalSaving: totalS,
          percentDiscount: totalP > 0 ? totalS / totalP : 0,
          strategy: "Negotiate",
          pic: "ไม่ระบุ",
          remark: "",
        });
      }
    });

    allParsed.forEach(t => {
      const yr = parseInt(t.year) || 2026;
      if (yr >= 2025) recentTransactions.push(t);
      else historicalTransactions.push(t);
    });
  }

  const allCombined = [...recentTransactions, ...historicalTransactions];

  // 2. สรุปผลรายเดือน (Monthly Summary)
  const monthlySummary: any[] = [];
  const mSheetName = sheetNames.find(s => s.includes("สรุป-รายเดือน") || s.includes("รายเดือน"));
  const validMonths = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  if (mSheetName && wb.Sheets[mSheetName]) {
    const mRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[mSheetName], { header: 1, defval: "" });
    for (let i = 2; i < Math.min(16, mRows.length); i++) {
      const r = mRows[i];
      if (!r) continue;
      const mo = String(r[0] || "").trim().toUpperCase();
      if (validMonths.includes(mo)) {
        monthlySummary.push({
          month: mo,
          pv2021: parseNum(r[1]),
          cr2021: parseNum(r[2]),
          pct2021: parseNum(r[3]),
          status2021: String(r[4] || ""),
          pv2026: parseNum(r[5]),
          cr2026: parseNum(r[6]),
          target2026: parseNum(r[7]),
          pct2026: parseNum(r[8]),
          status2026: String(r[9] || ""),
          savingVsTarget: parseNum(r[11]),
          pctDiffTarget: parseNum(r[12]),
          creditDiffDays: parseNum(r[19]),
          creditPOVal: parseNum(r[20]),
          creditSaving: parseNum(r[21]),
        });
      }
    }
  }

  if (monthlySummary.length === 0) {
    validMonths.forEach(mo => {
      const moTxs = allCombined.filter(t => t.month === mo && t.year === "2026");
      const pv = moTxs.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
      const cr = moTxs.reduce((sum, t) => sum + (t.totalSaving || 0), 0);
      const target = pv * 0.03;
      const pct = pv > 0 ? (cr / pv) * 100 : 0;
      monthlySummary.push({
        month: mo,
        pv2021: 0, cr2021: 0, pct2021: 0, status2021: "-",
        pv2026: pv, cr2026: cr, target2026: target, pct2026: pct,
        status2026: pv > 0 ? (cr >= target ? "ได้ตามเป้าหมาย" : "ไม่ได้ตามเป้าหมาย") : "-",
        savingVsTarget: cr - target,
        pctDiffTarget: target > 0 ? (cr - target) / target : 0,
        creditDiffDays: 0, creditPOVal: 0, creditSaving: 0,
      });
    });
  }

  // 3. สรุปผลรายปี (Yearly Summary)
  const yearlySummary: any[] = [];
  const ySheetName = sheetNames.find(s => s.includes("สรุป-รายปี") || s.includes("รายปี"));
  if (ySheetName && wb.Sheets[ySheetName]) {
    const yRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[ySheetName], { header: 1, defval: "" });
    for (let i = 1; i < yRows.length; i++) {
      const r = yRows[i];
      if (!r) continue;
      const yr = String(r[0] || "").trim();
      if (yr && yr.match(/^20\d\d$/)) {
        yearlySummary.push({
          year: yr,
          purchaseValue: parseNum(r[1]),
          costSaving: parseNum(r[2]),
          percentSaving: parseNum(r[3]),
        });
      }
    }
  }

  if (yearlySummary.length === 0) {
    ["2023", "2024", "2025", "2026"].forEach(yr => {
      const yrTxs = allCombined.filter(t => t.year === yr);
      const pv = yrTxs.reduce((s, t) => s + (t.totalPrice || 0), 0);
      const cs = yrTxs.reduce((s, t) => s + (t.totalSaving || 0), 0);
      yearlySummary.push({
        year: yr,
        purchaseValue: pv,
        costSaving: cs,
        percentSaving: pv > 0 ? cs / pv : 0,
      });
    });
  }

  // 4. มูลค่าซื้อ (Purchase History)
  const purchaseHistory: any[] = [];
  const pSheetName = sheetNames.find(s => s.includes("มูลค่าซื้อ"));
  if (pSheetName && wb.Sheets[pSheetName]) {
    const pRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[pSheetName], { header: 1, defval: "" });
    for (let i = 1; i < pRows.length; i++) {
      const r = pRows[i];
      if (!r) continue;
      const yr = String(r[0] || "").trim();
      const mo = String(r[1] || "").trim().toUpperCase();
      const val = parseNum(r[2]);
      if (yr && mo && val > 0) {
        purchaseHistory.push({ year: yr, month: mo, purchaseValue: val });
      }
    }
  }

  if (purchaseHistory.length === 0) {
    const years = Array.from(new Set(allCombined.map(t => t.year))).sort();
    years.forEach(yr => {
      validMonths.forEach(mo => {
        const sumPV = allCombined.filter(t => t.year === yr && t.month === mo).reduce((s, t) => s + (t.totalPrice || 0), 0);
        if (sumPV > 0) {
          purchaseHistory.push({ year: yr, month: mo, purchaseValue: sumPV });
        }
      });
    });
  }

  // 5. Matrix กลยุทธ์ (Strategy Matrix)
  const strategyMatrix: any[] = [];
  const sSheetName = sheetNames.find(s => s.includes("Sheet4") || s.includes("Matrix"));
  if (sSheetName && wb.Sheets[sSheetName]) {
    const sRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sSheetName], { header: 1, defval: "" });
    for (let i = 2; i < Math.min(10, sRows.length); i++) {
      const r = sRows[i];
      if (!r) continue;
      const strat = String(r[0] || "").trim();
      if (strat && !strat.toLowerCase().includes("total") && !strat.toLowerCase().includes("grand")) {
        strategyMatrix.push({
          strategy: strat,
          Dusit: parseNum(r[1]),
          Pawina: parseNum(r[2]),
          Saniya: parseNum(r[3]),
          Tanida: parseNum(r[4]),
          Yuwanit: parseNum(r[5]),
          Total: parseNum(r[6]),
        });
      }
    }
  }

  if (strategyMatrix.length === 0) {
    const strategies = ["Avoidance", "Compare + Negotiate", "Negotiate", "Rebate", "เพิ่มเครดิต"];
    const pics = ["Dusit", "Pawina", "Saniya", "Tanida", "Yuwanit"];
    strategies.forEach(strat => {
      const row: any = { strategy: strat };
      let total = 0;
      pics.forEach(p => {
        const val = allCombined
          .filter(t => (t.strategy || "").includes(strat) && (t.pic || "").toLowerCase().includes(p.toLowerCase()))
          .reduce((s, t) => s + (t.totalSaving || 0), 0);
        row[p] = val;
        total += val;
      });
      row.Total = total;
      strategyMatrix.push(row);
    });
  }

  return {
    title: "QTC ENERGY PCL - KPI Discount Supplier & Procurement Cost Reduction",
    generatedAt: new Date().toISOString(),
    config: {
      targetRate: 0.03,
      creditInterestRate: 0.0425,
      kaizenParams: {
        hourlyWage: 116.82,
        savedMinutesPerJob: 10,
        jobsPerMonth: 16,
        workDaysPerMonth: 20,
        monthsPerYear: 1,
        paperCostPerPage: 0.15,
        colorPrintPerPage: 3,
        blackWhitePrintPerPage: 0.3,
        electricityRatePerKwh: 4,
      },
    },
    monthlySummary,
    yearlySummary,
    purchaseHistory,
    strategyMatrix,
    historicalTransactions,
    recentTransactions,
  };
}
