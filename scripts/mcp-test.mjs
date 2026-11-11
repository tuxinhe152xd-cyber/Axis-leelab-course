// 在本機單獨啟動 mcp/servers.json 裡的每一支 MCP 伺服器，列出工具；失敗時印出真正的錯誤。
// OpenClaw 啟動失敗只會顯示 "Connection closed"，看不出原因，所以用這個先自己試一次。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "mcp", "package.json"));
let Client, StdioClientTransport;
try {
  ({ Client } = require("@modelcontextprotocol/sdk/client/index.js"));
  ({ StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js"));
} catch {
  console.error("找不到 MCP 套件。請先執行：npm install --no-audit --no-fund --prefix mcp");
  process.exit(1);
}

const toLocal = (s) => String(s).replace("/home/node/mcp", path.join(root, "mcp")).replace("/home/node/data", path.join(root, "data"));
const servers = JSON.parse(fs.readFileSync(path.join(root, "mcp", "servers.json"), "utf8"));
let failed = 0;

for (const [name, cfg] of Object.entries(servers)) {
  const args = (cfg.args || []).map(toLocal);
  const env = Object.fromEntries(Object.entries(cfg.env || {}).map(([k, v]) => [k, toLocal(v)]));
  const file = args.find((a) => a.endsWith(".cjs") || a.endsWith(".js") || a.endsWith(".mjs"));
  console.log(`\n【${name}】${file ? path.relative(root, file) : cfg.command}`);

  if (file && !fs.existsSync(file)) {
    console.log(`  ✗ 找不到檔案 ${path.relative(root, file)}。檔名要和 mcp/servers.json 一樣，並放在 mcp 資料夾。`);
    failed++;
    continue;
  }
  if (env.INVENTORY_DB && !fs.existsSync(env.INVENTORY_DB)) {
    console.log("  ✗ 還沒有資料庫 data/inventory.db。請先執行：npm run db");
    failed++;
    continue;
  }

  const transport = new StdioClientTransport({ command: cfg.command, args, env: { ...process.env, ...env }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (d) => (stderr += d));
  const client = new Client({ name: "mcp-test", version: "1.0.0" });
  try {
    await Promise.race([
      client.connect(transport),
      new Promise((_, rej) => setTimeout(() => rej(new Error("10 秒內沒有啟動完成")), 10000)),
    ]);
    const { tools } = await client.listTools();
    console.log(`  ✓ ${tools.length} 個工具：${tools.map((t) => t.name).join("、")}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ 啟動失敗：${e.message}`);
    const err = stderr.trim();
    if (err) console.log("  真正的錯誤訊息：\n" + err.split("\n").slice(0, 12).map((l) => "    " + l).join("\n"));
    console.log("  把上面的錯誤整段貼回給聊天 AI，請它修正程式，再執行一次 npm run mcp:test");
  } finally {
    await client.close().catch(() => {});
  }
}

console.log(failed ? `\n有 ${failed} 支伺服器沒通過。` : "\n全部通過。接著執行：npm run mcp:check");
process.exit(failed ? 1 : 0);
