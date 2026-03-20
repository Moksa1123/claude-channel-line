# LINE Channel for Claude Code

透過 LINE Messaging API 將 LINE 訊息推送進 Claude Code session，讓 Claude 能即時接收並回覆你的 LINE 訊息。

---

## 目錄

- [需求](#需求)
- [事前準備](#事前準備)
  - [安裝 Claude Code](#1-安裝-claude-code)
  - [安裝 Bun](#2-安裝-bun)
  - [安裝 ngrok](#3-安裝-ngrok)
  - [建立 LINE Bot](#4-建立-line-bot)
- [安裝與設定](#安裝與設定)
  - [Clone 專案](#1-clone-專案)
  - [儲存 LINE 憑證](#2-儲存-line-憑證)
  - [加入 MCP Server](#3-加入-mcp-server)
  - [啟動 ngrok](#4-啟動-ngrok)
  - [設定 LINE Webhook](#5-設定-line-webhook)
  - [啟動 Claude Code](#6-啟動-claude-code)
  - [配對 LINE 帳號](#7-配對-line-帳號)
- [新增其他使用者](#新增其他使用者)
- [Access Policy 說明](#access-policy-說明)
- [環境變數](#環境變數)
- [常見問題](#常見問題)

---

## 需求

- **作業系統**：Windows / macOS / Linux
- **Claude Code** v2.1.80 以上，以 claude.ai 帳號登入（非 API key）
- **Bun** runtime
- **ngrok** 帳號（免費方案即可）
- **LINE Developers** 帳號（免費）

---

## 事前準備

### 1. 安裝 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

安裝完後登入：

```bash
claude
```

依畫面指示以 claude.ai 帳號登入。

---

### 2. 安裝 Bun

**macOS / Linux：**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows（PowerShell）：**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

確認安裝成功：

```bash
bun --version
```

---

### 3. 安裝 ngrok

前往 [https://ngrok.com](https://ngrok.com) 註冊帳號（免費），然後：

**macOS（Homebrew）：**

```bash
brew install ngrok
```

**Windows：**

前往 [https://ngrok.com/download](https://ngrok.com/download) 下載並解壓縮，加入 PATH。

**設定 authtoken**（登入 ngrok 後，從 [Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) 複製）：

```bash
ngrok config add-authtoken 你的authtoken
```

---

### 4. 建立 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/console/) 並登入
2. 點擊 **Create a Provider**，輸入名稱（例如：`My Claude Bot`）
3. 點擊 **Create a new channel** → 選擇 **Messaging API**
4. 填寫必要資訊（Channel name、Channel description、Category）後建立

取得憑證：

- **Channel Secret**：進入 channel → **Basic settings** 頁籤 → 複製 `Channel secret`
- **Channel Access Token**：進入 channel → **Messaging API** 頁籤 → 滾到最下方 → 點擊 **Issue** → 複製 token

在 **Messaging API** 頁籤，找到以下設定並關閉（避免 bot 自動回覆干擾）：
- **Auto-reply messages** → 設為 **Disabled**
- **Greeting messages** → 設為 **Disabled**

---

## 安裝與設定

### 1. Clone 專案

```bash
git clone https://github.com/<your-username>/line-channel
cd line-channel
```

---

### 2. 儲存 LINE 憑證

憑證存放在 `~/.claude/channels/line/.env`，**不會** 被 commit 進 git。

**macOS / Linux：**

```bash
mkdir -p ~/.claude/channels/line
cat > ~/.claude/channels/line/.env << EOF
LINE_CHANNEL_ACCESS_TOKEN=貼上你的Channel Access Token
LINE_CHANNEL_SECRET=貼上你的Channel Secret
EOF
```

**Windows（PowerShell）：**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\channels\line"
@"
LINE_CHANNEL_ACCESS_TOKEN=貼上你的Channel Access Token
LINE_CHANNEL_SECRET=貼上你的Channel Secret
"@ | Set-Content "$env:USERPROFILE\.claude\channels\line\.env"
```

---

### 3. 加入 MCP Server

將 LINE channel 加入 Claude Code：

**macOS / Linux：**

```bash
claude mcp add line bun "/path/to/line-channel/server.ts"
```

**Windows：**

```powershell
claude mcp add line bun "C:/path/to/line-channel/server.ts"
```

> 把路徑換成你實際 clone 的位置，例如 `C:/Users/yourname/line-channel/server.ts`

確認加入成功：

```bash
claude mcp list
```

應該看到 `line` 出現在清單中。

---

### 4. 啟動 ngrok

開一個**獨立的終端機視窗**，執行：

```bash
ngrok http 8789
```

成功後會看到類似：

```
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:8789
```

複製 `https://xxxx.ngrok-free.app` 這個網址，接下來會用到。

> **注意**：ngrok 視窗必須保持開啟，關掉就斷線了。每次重啟 ngrok 網址會改變，需要重新設定 Webhook URL。

---

### 5. 設定 LINE Webhook

回到 [LINE Developers Console](https://developers.line.biz/console/)，進入你的 channel：

1. 點擊 **Messaging API** 頁籤
2. 找到 **Webhook URL** 欄位，點擊 **Edit**
3. 填入：`https://xxxx.ngrok-free.app/webhook`（換成你的 ngrok 網址）
4. 點擊 **Update** 儲存
5. 開啟 **Use webhook** 開關
6. 點擊 **Verify** 確認連線 → 顯示 **Success** 代表成功

---

### 6. 啟動 Claude Code

開一個**新的終端機視窗**，執行：

```bash
claude --dangerously-load-development-channels server:line
```

成功啟動後，Claude Code 會自動連接 LINE MCP server 並開始監聽訊息。

> **重要**：每次使用都必須加上 `--dangerously-load-development-channels server:line` 旗標啟動，LINE 訊息才會進入 session。直接執行 `claude` 不會收到 LINE 訊息。

> **Windows 注意**：此指令需在一般終端機（PowerShell / CMD）執行，不能在 Claude Code 內部執行。

---

### 7. 配對 LINE 帳號

1. 打開 LINE，找到你的 bot（可在 LINE Developers Console → Messaging API → **Bot basic ID** 找到加入方式）
2. 傳送任何訊息給 bot，例如：`hi`
3. Bot 會自動回覆配對碼，格式如下：

   ```
   配對碼：A1B2C3

   請在 Claude Code 執行：
   /line:access pair A1B2C3
   ```

4. 在終端機找到配對碼對應的 userId：

   **macOS / Linux：**
   ```bash
   cat ~/.claude/channels/line/pending/A1B2C3.json
   ```

   **Windows（PowerShell）：**
   ```powershell
   Get-Content "$env:USERPROFILE\.claude\channels\line\pending\A1B2C3.json"
   ```

   會顯示：
   ```json
   {
     "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "expires": 1234567890000
   }
   ```

5. 將此 userId 加入白名單，編輯 `~/.claude/channels/line/access.json`：

   **macOS / Linux：**
   ```bash
   cat > ~/.claude/channels/line/access.json << EOF
   {
     "policy": "allowlist",
     "allowlist": ["Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
   }
   EOF
   ```

   **Windows（PowerShell）：**
   ```powershell
   @"
   {
     "policy": "allowlist",
     "allowlist": ["Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
   }
   "@ | Set-Content "$env:USERPROFILE\.claude\channels\line\access.json"
   ```

6. 再次用 LINE 傳訊息，Claude 就會收到並回覆了！

---

## 新增其他使用者

讓其他人也能使用這個 bot：

1. 請對方將 bot 加為好友並傳訊，他們會收到配對碼
2. 請對方把配對碼告訴你
3. 查看 `~/.claude/channels/line/pending/<配對碼>.json` 取得他的 userId
4. 將 userId 加入 `access.json` 的 `allowlist` 陣列：

```json
{
  "policy": "allowlist",
  "allowlist": [
    "U你的userId",
    "U對方的userId"
  ]
}
```

---

## Access Policy 說明

編輯 `~/.claude/channels/line/access.json` 的 `policy` 欄位：

| Policy | 行為 | 適合情境 |
|--------|------|----------|
| `pairing` | 任何人傳訊都會觸發配對碼流程（預設） | 初次設定、新增使用者 |
| `allowlist` | 只有白名單內的 userId 可傳訊，其他人靜默丟棄 | 正常使用，建議設定 |
| `open` | 所有人都可以傳訊 | 不建議，無安全性保護 |

---

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token | **必填** |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | **必填** |
| `LINE_WEBHOOK_PORT` | Webhook 監聽 port | `8789` |

---

## 常見問題

**Q: Verify 時顯示 502 Bad Gateway**

Claude Code 的 LINE server 還沒啟動。確認有執行 `claude --dangerously-load-development-channels server:line`。

**Q: 傳訊後 bot 沒有回應**

- 確認 ngrok 還在執行中
- 確認 LINE Webhook URL 正確且 **Use webhook** 已開啟
- 確認 `access.json` 的 policy 設定正確

**Q: 每次重啟 ngrok 網址都會變**

ngrok 免費方案每次重啟網址會改變，需重新到 LINE Developers Console 更新 Webhook URL。升級付費方案可使用固定網址。

**Q: Windows 上 token 含特殊字元設定失敗**

用引號包住 token：

```powershell
$env:LINE_CHANNEL_ACCESS_TOKEN="你的token（含特殊字元）"
```

**Q: MCP server 啟動失敗，顯示 port 已被佔用**

```bash
# 換一個 port
claude mcp remove line
claude mcp add line bun "/path/to/server.ts" -e LINE_WEBHOOK_PORT=8790
# ngrok 也要改
ngrok http 8790
```

---

## 授權

MIT
