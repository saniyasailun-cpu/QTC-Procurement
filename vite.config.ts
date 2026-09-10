import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

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

        if (req.url === '/api/data' && req.method === 'GET') {
          try {
            const dataPath = path.join(process.cwd(), 'data.json');
            if (fs.existsSync(dataPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-cache');
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

        if (req.url === '/api/upload-excel' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { filename, fileBase64, dataset } = JSON.parse(body);
              let savedFile = false;
              let savedData = false;

              if (fileBase64) {
                const buffer = Buffer.from(fileBase64, 'base64');
                const targetFilename = filename || '2026 KPI-Discount Supplier.xlsx';
                fs.writeFileSync(path.join(process.cwd(), targetFilename), buffer);
                if (targetFilename !== '2026 KPI-Discount Supplier.xlsx') {
                  fs.writeFileSync(path.join(process.cwd(), '2026 KPI-Discount Supplier.xlsx'), buffer);
                }
                savedFile = true;
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

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'อัปเดตไฟล์ Excel และข้อมูลทั้งชีตลง Backend สำเร็จเรียบร้อยแล้ว',
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

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), backendApiPlugin()],
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
