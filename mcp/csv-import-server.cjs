// 老師備好的工具：import_csv。把工作區裡的 inventory.csv 轉成資料庫（呼叫 data/csv-to-db.cjs，檢查邏輯共用）。
'use strict';
const { spawnSync } = require('node:child_process');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const csvPath = process.env.CSV_PATH || '/home/node/data/inventory.csv';
const script = process.env.CSV_TO_DB || '/home/node/data/csv-to-db.cjs';
const server = new McpServer({ name: 'csv-import', version: '1.0.0' });

server.tool(
  'import_csv',
  '把 data/inventory.csv 轉成庫存資料庫。第一次建立用 reset=false；資料庫已存在、要用新 CSV 重建時才用 reset=true，而且會清空所有訂單，一定要先問使用者並得到明確同意。',
  { reset: z.boolean().optional() },
  async ({ reset }) => {
    const args = [script].concat(reset ? ['--reset'] : []);
    const r = spawnSync(process.execPath, args, {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, CSV_PATH: csvPath, NODE_NO_WARNINGS: '1' },
    });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    return { content: [{ type: 'text', text: JSON.stringify({ ok: r.status === 0, csv: csvPath, message: out }) }] };
  }
);

server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
