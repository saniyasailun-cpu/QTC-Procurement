import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // เพิ่มขนาด payload รองรับไฟล์ Excel และ Dataset ขนาดใหญ่
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 2: ดึงข้อมูลชุดล่าสุดจาก Backend (data.json)
  app.get("/api/data", (req, res) => {
    try {
      const dataPath = path.join(process.cwd(), "data.json");
      if (fs.existsSync(dataPath)) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(dataPath).pipe(res);
        return;
      }
      res.status(404).json({ error: "data.json not found" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 3: อัปโหลดไฟล์ Excel และอัปเดตข้อมูลทั้งชีตลง Backend (data.json, data.js และ 2026 KPI-Discount Supplier.xlsx)
  app.post("/api/upload-excel", (req, res) => {
    try {
      const { filename, fileBase64, dataset } = req.body;
      let savedFile = false;
      let savedData = false;

      // 1. บันทึกไฟล์ Excel ตัวจริงลงดิสก์
      if (fileBase64) {
        const buffer = Buffer.from(fileBase64, "base64");
        const targetFilename = filename || "2026 KPI-Discount Supplier.xlsx";
        const filePath = path.join(process.cwd(), targetFilename);
        fs.writeFileSync(filePath, buffer);
        
        // บันทึกสำเนาเป็นไฟล์มาตรฐานของระบบด้วย
        if (targetFilename !== "2026 KPI-Discount Supplier.xlsx") {
          fs.writeFileSync(path.join(process.cwd(), "2026 KPI-Discount Supplier.xlsx"), buffer);
        }
        savedFile = true;
      }

      // 2. บันทึก Dataset ลง data.json และ data.js
      if (dataset && typeof dataset === "object") {
        const jsonPath = path.join(process.cwd(), "data.json");
        const jsPath = path.join(process.cwd(), "data.js");

        fs.writeFileSync(jsonPath, JSON.stringify(dataset, null, 2), "utf8");
        fs.writeFileSync(jsPath, `window.KPI_DATA = ${JSON.stringify(dataset)};`, "utf8");
        savedData = true;
      }

      const totalRecent = dataset?.recentTransactions?.length || 0;
      const totalHistorical = dataset?.historicalTransactions?.length || 0;

      return res.json({
        success: true,
        message: "อัปเดตไฟล์ Excel และข้อมูลทั้งชีตลง Backend สำเร็จเรียบร้อยแล้ว",
        savedFile,
        savedData,
        timestamp: new Date().toISOString(),
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
