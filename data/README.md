# 假資料

這裡的資料**全部是虛構的**：一家小型農產品店的商品、庫存與訂單，用來練習「資料庫怎麼放、Agent 怎麼查」。

| 檔案 | 內容 |
|---|---|
| `products.csv` | 商品：編號、名稱、別稱（用 `|` 隔開）、單位、價格 |
| `stock.csv` | 庫存：目前數量、每項各自的安全庫存（0 代表不提醒）、更新時間 |
| `orders.csv` | 訂單：訂單編號、客人、商品、數量、狀態（`done` 或 `cancelled`）、時間 |
| `schema.sql` | SQLite 的資料表定義（欄位型別與規則） |

## 匯入成一個 SQLite 檔
需要有 `sqlite3` 指令（沒有的話先安裝）。在 `data/` 資料夾裡：
```bash
sqlite3 inventory.db < schema.sql
sqlite3 inventory.db ".mode csv" ".import --skip 1 products.csv products"
sqlite3 inventory.db ".mode csv" ".import --skip 1 stock.csv stock"
sqlite3 inventory.db ".mode csv" ".import --skip 1 orders.csv orders"
sqlite3 inventory.db "PRAGMA foreign_key_check;"
```
最後一行沒有輸出，就代表訂單指到的商品都存在。`inventory.db` 不會被 Git 追蹤。

## 標準答案查詢
低於安全庫存的商品：
```sql
SELECT p.name, s.on_hand, s.safety_stock
FROM stock s JOIN products p USING(product_id)
WHERE s.safety_stock > 0 AND s.on_hand < s.safety_stock;
```
當日銷量（不含取消的訂單）：
```sql
SELECT p.name, SUM(o.quantity) AS sold
FROM orders o JOIN products p USING(product_id)
WHERE o.status = 'done' AND date(o.created_at) = '2026-11-03'
GROUP BY p.name;
```
答案以資料庫為準，不是以模型的口頭回覆為準。
