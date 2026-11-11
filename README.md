# AXIS OpenClaw Lab

臺大農業部「AI 工作流設計」課程的實作環境：在 Docker 裡跑一個私人 OpenClaw Agent，用一個叫 `workflow-decompose` 的 skill，把你遇到的問題一步步問清楚、整理成「工作流藍圖」。

> 這是私人助理，只給你自己用。**不要把 Dashboard 的連接埠設成公開，也不要把金鑰貼到任何地方。**

## 你需要
- 一個 GitHub 帳號（用 GitHub Codespaces 開），或一台裝好 Docker 的電腦。
- 一把模型 API 金鑰：Claude（Anthropic），或 OpenRouter。

## 開始
1. **開環境**：在 GitHub 這個倉庫頁面按 **Code → Codespaces → Create codespace**。（在自己電腦上做的話，clone 倉庫後在資料夾裡操作。）
2. **產生設定檔**（Codespaces 開好時通常已自動執行；沒有就自己跑一次）：
   ```bash
   npm run lab:setup
   ```
   這會建立 `.env` 與一把只有你自己的 Gateway token。
3. **填金鑰**：打開 `.env`，**只要在 `MODEL_API_KEY=` 後面貼上老師給的 OpenRouter 金鑰**（供應商、網址、模型 `anthropic/claude-haiku-5.5` 已預設好）。要改用 Anthropic 官方金鑰：把 `MODEL_PROVIDER` 改成 `anthropic` 並填 `ANTHROPIC_API_KEY`。**`.env` 不會被 Git 追蹤，不要貼到聊天或截圖裡。**
4. **啟動**：
   ```bash
   npm run lab:up
   ```
   第一次要建映像，需要幾分鐘。等狀態變成 `healthy`：
   ```bash
   docker compose ps
   ```
5. **打開 Dashboard**：在 Codespaces 的「連接埠」分頁，找到 `18795`，開啟連結（自己電腦上是 http://127.0.0.1:18795/）。登入需要 token，在終端機顯示它（只有你看得到）：
   ```bash
   grep '^AXIS_GATEWAY_TOKEN=' .secrets/gateway.env | cut -d= -f2
   ```
6. **開始訪談**：在 Dashboard 開一個**新對話**，輸入：
   ```text
   $workflow-decompose 我想用 AI 幫忙處理工作，請開始。
   ```
   然後依序回答它的問題。它會一次問一件事，每個階段結束時複述給你確認，最後整理成一張藍圖。

## 注意
- **不要貼很長的文字**：Dashboard 會把長文字轉成附件，模型看不到內容。叫出 skill 用上面那一行就好。
- 它的整理只是**提案**，要不要照做由你決定；它說錯的地方請直接糾正。
- 每次送出對話都會用到你的 API 額度。
- 結束時關掉：
  ```bash
  npm run lab:down
  ```
  這不會刪除你的對話與設定。

## 之後的步驟會用到
**排程與讀網頁已經預設開啟**（不用改 `.env`）：AI 可以在對話裡建排程、讀公開網頁。排程每次執行都會用掉你的模型額度；網頁內容可能含想誘導模型的文字，所以人要看過再用。

**改了檔案，怎麼生效**
| 你改了什麼 | 怎麼套用 |
|---|---|
| `workspace/AGENTS.md`、`workspace/skills/`、`mcp/`、`.env` | `docker compose restart gateway`（`.env` 要用 `docker compose up -d`） |
| `docker/` 裡的檔案、`Dockerfile` | `docker compose up --build -d` |

**Agent 能用的工具與 skill 是精簡過的**：只開放 `read`、你的 MCP 工具，以及（打開 `AXIS_CRON=1` 後）排程工具、（打開 `AXIS_WEB_FETCH=1` 後）`web_fetch`；仍然**沒有**執行指令的工具；skill 只列 `workflow-decompose`。這樣每次呼叫的基底只有約 6,000 tokens（沒精簡時約 34,000）。要多裝一個 skill，或想多開一個工具，要改 `docker/start-gateway.mjs` 裡的 `skills` 與 `alsoAllow`，再 `docker compose up --build -d`。

**排程怎麼建、結果在哪裡看**：在對話裡請 AI 建。AI 會先講清楚名稱、時間、內容，你說「好，確定」才建，而且一律建成**停用**。到 Dashboard 左側「自動化」找到它，按「立即執行」先測一次，結果在「執行記錄」分頁；確定沒問題再打開「啟用中」開關。也可以自己在「自動化」頁「新增自動化」：「重複」選 Cron（例如 `30 7 * * *`）、「時區」填 `Asia/Taipei`、「傳送」維持「無（內部）」。
（喜歡指令的話，`docker compose exec gateway node /app/openclaw.mjs cron add …` 也可以，但**預設不顯示停用的工作**，要加 `cron list --all`。）

**不要**用 `docker cp` 把檔案丟進容器：檔案的擁有者會不對，會讓 Gateway 啟動失敗。要改檔案，就改這個倉庫裡的檔案，再重啟。

**看排程**：`openclaw cron list` 預設**不顯示已停用的工作**，要看全部用：
```bash
docker compose exec gateway node /app/openclaw.mjs cron list --all
```

## 倉庫內容
| 路徑 | 用途 |
|---|---|
| `docker-compose.yml`、`docker/` | OpenClaw Gateway 的啟動設定（鎖定工具權限、只監聽本機） |
| `workspace/AGENTS.md` | Agent 的基本指示；改了重啟就生效，不用重建 |
| `workspace/skills/workflow-decompose/` | 訪談用的 skill，每次啟動會自動裝進 Agent 的工作區 |
| `data/` | 假資料（商品、庫存、訂單）與資料表，之後的步驟才會用到，見 `data/README.md` |
| `mcp/` | 你自己做的 MCP 伺服器與 `servers.json`，見 `mcp/README.md` |
| `line-extension/`、`scripts/webhook.mjs` | LINE 外掛與入口，預設**關閉**（`.env` 裡 `LINE_ENABLED=0`） |

## 目前狀態（誠實說明）
- 在作者的 Mac（Docker）上驗證過：啟動、Dashboard、skill 載入、整段訪談可以走完。
- 重啟後設定、Agent 指示、MCP 註冊都仍有效；改 `AGENTS.md` 只要重啟，不用重建（全新與已用過的資料卷上都驗證過）。
- Dashboard 的「自動化」頁（建立、立即執行、暫停、執行記錄）在隔離的測試堆疊上實際操作驗證過。
- **GitHub Codespaces 上的完整流程尚未在這個新倉庫實測。**
- OpenRouter 的模型尚未實測，skill 的規則遵守度可能不同。
- LINE 目前不使用。

## 實作用的對話卡
上午、下午情境要貼給 AI 的句子在 [`prompts/`](prompts/)：[上午情境](prompts/上午情境_複製貼上卡.md)、[下午情境](prompts/下午情境_複製貼上卡.md)。Dashboard 開新對話，照卡上的順序貼。


## 遠端（Codespaces）第一次開 Dashboard

畫面出現「核准此瀏覽器 / device pairing required」是正常的安全機制（遠端網址的瀏覽器要先被 Gateway 認識，每個瀏覽器只需一次）。在終端機執行：

```bash
npm run lab:approve
```

回到瀏覽器，頁面會自動連線。
