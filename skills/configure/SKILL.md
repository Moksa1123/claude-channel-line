---
name: line:configure
description: 設定 LINE channel 的 bot 憑證（Channel Access Token 與 Channel Secret）
---

設定 LINE Messaging API 憑證，並顯示目前設定狀態。

## 用法

```
/line:configure                          # 顯示目前狀態
/line:configure <token> <secret>         # 儲存憑證
/line:configure clear                    # 清除憑證
```

## 說明

### 無引數 — 顯示狀態

讀取 `~/.claude/channels/line/.env` 和 `~/.claude/channels/line/access.json`，顯示：
- Token 狀態（若已設定，顯示前 10 個字元）
- Channel Secret 狀態
- 目前 access policy 和白名單人數
- 待配對的 pairing codes

### `/line:configure <token> <secret>`

將以下內容寫入 `~/.claude/channels/line/.env`：

```
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_CHANNEL_SECRET=<secret>
```

建立目錄（若不存在），然後顯示設定後的狀態。

### `/line:configure clear`

刪除 `~/.claude/channels/line/.env`，清除所有憑證。

## 設定流程建議

1. 執行 `/line:configure <token> <secret>` 儲存憑證
2. 以 `--dangerously-load-development-channels` 啟動 Claude Code（開發測試時）
3. 用 LINE 傳訊給 bot，取得配對碼
4. 執行 `/line:access pair <code>` 完成配對
5. 執行 `/line:access policy allowlist` 鎖定存取權限

## 取得憑證

前往 [LINE Developers Console](https://developers.line.biz/console/)：
- **Channel Secret**：Basic settings 頁面
- **Channel Access Token**：Messaging API 頁面 → Issue token
