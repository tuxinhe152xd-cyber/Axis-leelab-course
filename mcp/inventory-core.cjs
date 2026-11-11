// 老師預先備好：庫存助理的四個工具（find_product、record_order、set_safety_stock、daily_sales）。
// 查庫存（get_stock）由學員自己產生，放在 get-stock-server.cjs。
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.INVENTORY_DB;
if (!dbPath) {
  console.error('缺少環境變數 INVENTORY_DB');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

const BIG_ORDER = 10; // 這個數量以上的訂單要人工確認
const server = new McpServer({ name: 'inventory-core', version: '1.0.0' });

const reply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const ok = (data) => reply({ ok: true, ...data });
const fail = (error, extra = {}) => reply({ ok: false, error, ...extra });

// 台北時間 YYYY-MM-DD HH:MM
function taipeiNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return parts.replace('T', ' ');
}

server.tool(
  'find_product',
  '用名稱或別稱找商品，回傳商品編號、名稱、單位、價格。',
  { keyword: z.string().min(1).describe('商品名稱或別稱的關鍵字') },
  async ({ keyword }) => {
    const rows = db
      .prepare(
        `SELECT product_id, name, unit, price FROM products
         WHERE name LIKE ? OR ('|' || COALESCE(aliases, '') || '|') LIKE ?
         ORDER BY product_id`
      )
      .all(`%${keyword}%`, `%|${keyword}|%`);
    if (rows.length === 0) return fail(`查無商品：${keyword}`);
    return ok({ products: rows });
  }
);

server.tool(
  'record_order',
  '記一筆訂單並扣庫存。庫存不足或商品不存在時不會寫入。數量 10 件以上的大單，沒有 confirmed=true 也不會寫入。',
  {
    customer: z.string().min(1).describe('客人名稱'),
    product_id: z.string().min(1).describe('商品編號'),
    quantity: z.number().int().positive().describe('數量，正整數'),
    confirmed: z.boolean().optional().describe(`數量 ${BIG_ORDER} 以上的大單，必須在負責人到倉庫確認過之後才帶 true；一般訂單不要帶`),
  },
  async ({ customer, product_id, quantity, confirmed }) => {
    if (quantity >= BIG_ORDER && confirmed !== true) {
      return fail(`這是大單（${quantity} 件，${BIG_ORDER} 件以上）。需要負責人先到倉庫確認，確認後才能記單，這次沒有寫入。`, {
        needs_confirmation: true,
      });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const stock = db
        .prepare('SELECT on_hand FROM stock WHERE product_id = ?')
        .get(product_id);
      if (!stock) {
        db.exec('ROLLBACK');
        return fail(`查無商品：${product_id}`);
      }
      if (stock.on_hand < quantity) {
        db.exec('ROLLBACK');
        return fail(`庫存不足，目前只有 ${stock.on_hand}，要 ${quantity}，還差 ${quantity - stock.on_hand}。`, {
          on_hand: stock.on_hand,
        });
      }
      const next = db
        .prepare("SELECT COALESCE(MAX(CAST(SUBSTR(order_id, 2) AS INTEGER)), 0) + 1 AS n FROM orders")
        .get().n;
      const order_id = 'O' + String(next).padStart(4, '0');
      const now = taipeiNow();
      db.prepare(
        "INSERT INTO orders (order_id, customer, product_id, quantity, status, created_at) VALUES (?, ?, ?, ?, 'done', ?)"
      ).run(order_id, customer, product_id, quantity, now);
      db.prepare('UPDATE stock SET on_hand = on_hand - ?, updated_at = ? WHERE product_id = ?').run(
        quantity, now, product_id
      );
      db.exec('COMMIT');
      return ok({ order_id, product_id, quantity, on_hand_after: stock.on_hand - quantity, created_at: now });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      return fail(`記錄訂單失敗：${e.message}`);
    }
  }
);

server.tool(
  'set_safety_stock',
  '設定某商品的安全庫存（0 以上的整數；0 代表不提醒）。',
  {
    product_id: z.string().min(1).describe('商品編號'),
    safety_stock: z.number().int().min(0).describe('安全庫存，0 以上整數'),
  },
  async ({ product_id, safety_stock }) => {
    const r = db
      .prepare('UPDATE stock SET safety_stock = ?, updated_at = ? WHERE product_id = ?')
      .run(safety_stock, taipeiNow(), product_id);
    if (r.changes === 0) return fail(`查無商品：${product_id}`);
    return ok({ product_id, safety_stock });
  }
);

server.tool(
  'daily_sales',
  '查某一天（台北時間）成立的訂單，依商品合計銷量。不含已取消的訂單。只讀取，不修改資料。',
  { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('日期，格式 YYYY-MM-DD') },
  async ({ date }) => {
    const rows = db
      .prepare(
        `SELECT p.product_id, p.name, p.unit, SUM(o.quantity) AS sold, COUNT(*) AS orders
         FROM orders o JOIN products p ON p.product_id = o.product_id
         WHERE o.status = 'done' AND substr(o.created_at, 1, 10) = ?
         GROUP BY p.product_id, p.name, p.unit
         ORDER BY p.product_id`
      )
      .all(date);
    return ok({ date, sales: rows });
  }
);

server.connect(new StdioServerTransport());
