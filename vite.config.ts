import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';
import { parseExcelWorkbook } from './src/excelParser';

function backendApiPlugin(): Plugin {
  return {
    name: 'backend-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/health') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        if (req.url?.startsWith('/api/data') && req.method === 'GET') {
          try {
            const dataPath = path.join(process.cwd(), 'data.json');
            if (fs.existsSync(dataPath)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
              fs.createReadStream(dataPath).pipe(res);
              return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'data.json not found' }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.url === '/api/download-excel' && req.method === 'GET') {
          try {
            const filePath = path.join(process.cwd(), '2026 KPI-Discount Supplier.xlsx');
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Disposition', 'attachment; filename="2026 KPI-Discount Supplier.xlsx"');
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Excel file not found' }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.url === '/api/upload-excel' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
          req.on('end', () => {
            try {
              const fullBuffer = Buffer.concat(chunks);
              let buffer: Buffer | null = null;
              let filename = '2026 KPI-Discount Supplier.xlsx';
              let dataset: any = null;

              const contentType = req.headers['content-type'] || '';
              if (contentType.includes('json')) {
                const parsed = JSON.parse(fullBuffer.toString('utf8'));
                if (parsed.fileBase64) buffer = Buffer.from(parsed.fileBase64, 'base64');
                if (parsed.filename) filename = parsed.filename;
                if (parsed.dataset) dataset = parsed.dataset;
              } else {
                buffer = fullBuffer;
                const rawFilename = req.headers['x-filename'];
                if (rawFilename && typeof rawFilename === 'string') {
                  try { filename = decodeURIComponent(rawFilename); } catch (e) { filename = rawFilename; }
                }
              }

              let savedFile = false;
              let savedData = false;

              if (buffer && buffer.length > 0) {
                fs.writeFileSync(path.join(process.cwd(), filename), buffer);
                if (filename !== '2026 KPI-Discount Supplier.xlsx') {
                  fs.writeFileSync(path.join(process.cwd(), '2026 KPI-Discount Supplier.xlsx'), buffer);
                }
                savedFile = true;

                if (!dataset) {
                  try {
                    dataset = parseExcelWorkbook(buffer);
                  } catch (pErr) {
                    console.error('Vite plugin excel parse error:', pErr);
                  }
                }
              }

              if (dataset && typeof dataset === 'object') {
                const jsonPath = path.join(process.cwd(), 'data.json');
                const jsPath = path.join(process.cwd(), 'data.js');
                fs.writeFileSync(jsonPath, JSON.stringify(dataset, null, 2), 'utf8');
                fs.writeFileSync(jsPath, `window.KPI_DATA = ${JSON.stringify(dataset)};`, 'utf8');
                savedData = true;
              }

              const totalRecent = dataset?.recentTransactions?.length || 0;
              const totalHistorical = dataset?.historicalTransactions?.length || 0;

              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({
                success: true,
                message: 'อัปเดตไฟล์ Excel และข้อมูลทั้งชีตลง Backend สำเร็จเรียบร้อยแล้ว ทุกคนที่เปิดเว็บจะเห็นข้อมูลชุดใหม่นี้ร่วมกันทันที',
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
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

function staticDataPlugin(): Plugin {
  return {
    name: 'static-data-plugin',
    generateBundle() {
      for (const fileName of ['app.js', 'data.js', 'workbook-sync.js']) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(fileName) });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), backendApiPlugin(), staticDataPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
