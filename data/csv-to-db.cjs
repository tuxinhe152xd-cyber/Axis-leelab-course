// 把 data/inventory.csv 轉成 SQLite 資料庫 data/inventory.db
// 用法：node data/csv-to-db.cjs            （第一次建立）
//       node data/csv-to-db.cjs --reset    （改了 CSV 後重建；訂單會被清空）
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const csvPath = process.env.CSV_PATH || path.join(__dirname, "inventory.csv");
const dbPath = process.env.INVENTORY_DB || path.join(__dirname, "inventory.db");
const reset = process.argv.includes("--reset");
const COLS = ["product_id", "name", "aliases", "unit", "price", "on_hand", "safety_stock"];

function fail(msg) { console.error("錯誤：" + msg); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

if (!fs.existsSync(csvPath)) fail("找不到 " + csvPath);
const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const head = rows.shift().map((x) => x.trim());
if (head.join(",") !== COLS.join(",")) fail("第一列欄位名稱必須是：" + COLS.join(",") + "（目前是：" + head.join(",") + "）");
if (rows.length === 0) fail("CSV 裡沒有任何商品");

const seen = new Set(); const items = [];
rows.forEach((r, i) => {
  const line = i + 2;
  if (r.length !== COLS.length) fail(`第 ${line} 列有 ${r.length} 欄，應該是 ${COLS.length} 欄（商品名稱或別稱裡有逗號嗎？別稱請用 | 分隔）`);
  const [id, name, aliases, unit, price, onHand, safety] = r.map((x) => x.trim());
  if (!id || !name || !unit) fail(`第 ${line} 列的 product_id、name、unit 不能空白`);
  if (seen.has(id)) fail(`第 ${line} 列的 product_id「${id}」重複`);
  seen.add(id);
  const nums = { price, on_hand: onHand, safety_stock: safety };
  for (const [k, v] of Object.entries(nums)) if (!/^\d+$/.test(v)) fail(`第 ${line} 列的 ${k} 必須是 0 以上的整數（目前是「${v}」）`);
  items.push({ id, name, aliases, unit, price: Number(price), onHand: Number(onHand), safety: Number(safety) });
});

const db = new DatabaseSync(dbPath);
const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
if (has) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  if (!reset) fail(`資料庫已存在（訂單 ${n} 筆）。要重建請加 --reset，訂單會被清空。`);
}
db.exec("PRAGMA foreign_keys=OFF; DROP TABLE IF EXISTS orders; DROP TABLE IF EXISTS stock; DROP TABLE IF EXISTS products; PRAGMA foreign_keys=ON;");
db.exec(`
CREATE TABLE products(product_id TEXT PRIMARY KEY, name TEXT NOT NULL, aliases TEXT, unit TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0));
CREATE TABLE stock(product_id TEXT PRIMARY KEY REFERENCES products(product_id), on_hand INTEGER NOT NULL CHECK(on_hand >= 0), safety_stock INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE orders(order_id TEXT PRIMARY KEY, customer TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(product_id), quantity INTEGER NOT NULL CHECK(quantity > 0), status TEXT NOT NULL CHECK(status IN ('done','cancelled')), created_at TEXT NOT NULL);
`);
const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
const ip = db.prepare("INSERT INTO products VALUES (?,?,?,?,?)");
const is = db.prepare("INSERT INTO stock VALUES (?,?,?,?)");
db.exec("BEGIN");
for (const it of items) { ip.run(it.id, it.name, it.aliases, it.unit, it.price); is.run(it.id, it.onHand, it.safety, now); }
db.exec("COMMIT");
db.close();
console.log(`完成：已建立 ${items.length} 項商品，訂單表是空的。資料庫：${dbPath}`);
