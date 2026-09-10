import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { parseExcelWorkbook } from "./src/excelParser";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // รองรับ Binary payload สำหรับไฟล์ Excel โดยตรง (ขนาดเล็ก ไม่ติดขีดจำกัด Proxy)
  app.use(express.raw({ 
    type: ["application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"], 
    limit: "50mb" 
  }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 2: ดึงข้อมูลชุดล่าสุดจาก Backend (data.json) - ป้องกัน Browser Cache 100%
  app.get("/api/data", (req, res) => {
    try {
      const dataPath = path.join(process.cwd(), "data.json");
      if (fs.existsSync(dataPath)) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        fs.createReadStream(dataPath).pipe(res);
        return;
      }
      res.status(404).json({ error: "data.json not found" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 3: ดาวน์โหลดไฟล์ Excel ล่าสุดจาก Server
  app.get("/api/download-excel", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "2026 KPI-Discount Supplier.xlsx");
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Disposition", 'attachment; filename="2026 KPI-Discount Supplier.xlsx"');
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.status(404).json({ error: "Excel file not found" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 3.5: ตั้งค่าและอ่านค่า Google Sheet URL สำหรับซิงค์สด (Server-wide)
  app.get("/api/sheet-config", (req, res) => {
    try {
      const dataPath = path.join(process.cwd(), "data.json");
      if (fs.existsSync(dataPath)) {
        const d = JSON.parse(fs.readFileSync(dataPath, "utf8"));
        return res.json({
          url: d.config?.gsheetUrl || "",
          autoSync: !!d.config?.gsheetAutoSync
        });
      }
      return res.json({ url: "", autoSync: false });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sheet-config", (req, res) => {
    try {
      const { url, autoSync } = req.body;
      const dataPath = path.join(process.cwd(), "data.json");
      if (fs.existsSync(dataPath)) {
        const d = JSON.parse(fs.readFileSync(dataPath, "utf8"));
        if (!d.config) d.config = {};
        d.config.gsheetUrl = (url || "").trim();
        d.config.gsheetAutoSync = !!autoSync;
        fs.writeFileSync(dataPath, JSON.stringify(d, null, 2), "utf8");
        const jsPath = path.join(process.cwd(), "data.js");
        fs.writeFileSync(jsPath, `window.KPI_DATA = ${JSON.stringify(d)};`, "utf8");
        return res.json({ success: true, url: d.config.gsheetUrl, autoSync: d.config.gsheetAutoSync });
      }
      return res.status(404).json({ error: "data.json not found" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API 4: อัปโหลดไฟล์ Excel และอัปเดตข้อมูลทั้งชีตลง Backend (data.json, data.js และ 2026 KPI-Discount Supplier.xlsx)
  app.post("/api/upload-excel", (req, res) => {
    try {
      let buffer: Buffer | null = null;
      let filename = "2026 KPI-Discount Supplier.xlsx";
      let dataset: any = null;

      // ตรวจสอบว่าส่งมาเป็น Buffer โดยตรง (Binary upload) หรือ JSON
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
        const rawFilename = req.headers["x-filename"];
        if (rawFilename && typeof rawFilename === "string") {
          try { filename = decodeURIComponent(rawFilename); } catch (e) { filename = rawFilename; }
        }
      } else if (req.body && typeof req.body === "object") {
        if (req.body.fileBase64) {
          buffer = Buffer.from(req.body.fileBase64, "base64");
        }
        if (req.body.filename) filename = req.body.filename;
        if (req.body.dataset) dataset = req.body.dataset;
      }

      if (!buffer && !dataset) {
        return res.status(400).json({ error: "ไม่พบข้อมูลไฟล์หรือชุดข้อมูลที่อัปโหลด" });
      }

      let savedFile = false;
      let savedData = false;

      // 1. บันทึกไฟล์ Excel ตัวจริงลง Server
      if (buffer) {
        const filePath = path.join(process.cwd(), filename);
        fs.writeFileSync(filePath, buffer);
        if (filename !== "2026 KPI-Discount Supplier.xlsx") {
          fs.writeFileSync(path.join(process.cwd(), "2026 KPI-Discount Supplier.xlsx"), buffer);
        }
        savedFile = true;

        // 2. ถ้ายังไม่มี dataset หรือต้องการให้ Server คำนวณแบบ 100% แม่นยำ ให้ Parse ด้วย Server
        if (!dataset) {
          try {
            dataset = parseExcelWorkbook(buffer);
          } catch (parseErr: any) {
            console.error("Server-side excel parsing error:", parseErr);
          }
        }
      }

      // 3. บันทึก Dataset ลง data.json และ data.js อย่างถาวร
      if (dataset && typeof dataset === "object") {
        const jsonPath = path.join(process.cwd(), "data.json");
        const jsPath = path.join(process.cwd(), "data.js");

        // รักษาการตั้งค่าเดิม (เช่น gsheetUrl, targetRate) ไว้เสมอ
        if (fs.existsSync(jsonPath)) {
          try {
            const existing = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
            if (existing.config) {
              dataset.config = {
                ...existing.config,
                ...dataset.config,
                gsheetUrl: existing.config.gsheetUrl || dataset.config?.gsheetUrl || "",
                gsheetAutoSync: existing.config.gsheetAutoSync ?? dataset.config?.gsheetAutoSync ?? false,
              };
            }
          } catch (e) {}
        }

        fs.writeFileSync(jsonPath, JSON.stringify(dataset, null, 2), "utf8");
        fs.writeFileSync(jsPath, `window.KPI_DATA = ${JSON.stringify(dataset)};`, "utf8");
        savedData = true;
      }

      const totalRecent = dataset?.recentTransactions?.length || 0;
      const totalHistorical = dataset?.historicalTransactions?.length || 0;

      return res.json({
        success: true,
        message: "อัปเดตไฟล์ Excel และข้อมูลทั้งชีตลง Backend สำเร็จเรียบร้อยแล้ว ทุกคนที่เปิดเว็บจะเห็นข้อมูลชุดใหม่นี้ร่วมกันทันที",
        savedFile,
        savedData,
        timestamp: new Date().toISOString(),
        dataset,
        stats: {
          totalTransactions: totalRecent + totalHistorical,
          recentCount: totalRecent,
          historicalCount: totalHistorical,
          monthlyCount: dataset?.monthlySummary?.length || 0,
          yearlyCount: dataset?.yearlySummary?.length || 0
        }
      });
    } catch (err: any) {
      console.error("Upload error on backend:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware สำหรับ Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
