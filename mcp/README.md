# MCP 伺服器

這個資料夾會被掛載進 Gateway（唯讀），放你自己做的 MCP 伺服器。

## 怎麼讓 OpenClaw 找到你的 MCP 伺服器
在 `servers.json` 寫下它的啟動方式。**每次 Gateway 啟動時，會用 OpenClaw 自己的指令註冊它**，所以重啟後仍然有效：

```json
{
  "inventory": {
    "command": "node",
    "args": ["/home/node/mcp/inventory-server.cjs"],
    "env": { "INVENTORY_DB": "/home/node/data/inventory.db" }
  }
}
```

- 路徑要寫**容器裡**的路徑：這個資料夾在容器裡是 `/home/node/mcp`，`data/` 在容器裡是 `/home/node/data`。
- 改了 `servers.json` 或程式之後，重啟就會生效：
  ```bash
  docker compose restart gateway
  ```
- 伺服器需要的套件，裝在這個資料夾裡（`npm install`）。OpenClaw 會**封鎖 `NODE_PATH`**，所以不能靠全域路徑找套件。

## 確認它有被找到
```bash
docker compose exec gateway node /app/openclaw.mjs mcp list
docker compose exec gateway node /app/openclaw.mjs mcp probe
```
`probe` 會列出所有工具。伺服器一啟動就當掉時，OpenClaw 只會顯示 `Connection closed`，看不出原因，這時先自己在終端機直接跑一次伺服器，才看得到真正的錯誤。

## 不要做
- **不要用 `openclaw mcp add` 註冊**：它寫進的設定，下次啟動就會被覆蓋掉。請寫進 `servers.json`。
- **不要提供讓使用者傳任意 SQL 的工具**；所有查詢都用參數化（`?`）。
