# LINE Channel for Claude Code

[English](README.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md)

LINE Messaging API を通じて LINE メッセージを Claude Code セッションにプッシュし、Claude がリアルタイムで LINE メッセージを受信・返信できるようにします。

---

## 目次

- [必要条件](#必要条件)
- [事前準備](#事前準備)
  - [Claude Code のインストール](#1-claude-code-のインストール)
  - [Bun のインストール](#2-bun-のインストール)
  - [ngrok のインストール](#3-ngrok-のインストール)
  - [LINE Bot の作成](#4-line-bot-の作成)
- [セットアップ](#セットアップ)
  - [リポジトリのクローン](#1-リポジトリのクローン)
  - [LINE 認証情報の保存](#2-line-認証情報の保存)
  - [MCP Server の追加](#3-mcp-server-の追加)
  - [ngrok の起動](#4-ngrok-の起動)
  - [LINE Webhook の設定](#5-line-webhook-の設定)
  - [Claude Code の起動](#6-claude-code-の起動)
  - [LINE アカウントのペアリング](#7-line-アカウントのペアリング)
- [Webhook 常駐サービス（自動起動）](#webhook-常駐サービス自動起動)
- [ユーザーの追加](#ユーザーの追加)
- [アクセスポリシー](#アクセスポリシー)
- [送信できるメッセージタイプ](#送信できるメッセージタイプ)
- [画像の Google Drive 自動バックアップ](#画像の-google-drive-自動バックアップ)
- [環境変数](#環境変数)
- [トラブルシューティング](#トラブルシューティング)

---

## 必要条件

- **OS**: Windows / macOS / Linux
- **Claude Code** v2.1.80 以上、claude.ai アカウントでログイン（API key 不可）
- **Bun** ランタイム
- **ngrok** アカウント（無料プランで可）
- **LINE Developers** アカウント（無料）

---

## 事前準備

### 1. Claude Code のインストール

```bash
npm install -g @anthropic-ai/claude-code
```

インストール後にログイン：

```bash
claude
```

画面の指示に従い、claude.ai アカウントでサインインしてください。

---

### 2. Bun のインストール

**macOS / Linux：**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows（PowerShell）：**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

インストール確認：

```bash
bun --version
```

---

### 3. ngrok のインストール

[https://ngrok.com](https://ngrok.com) で無料アカウントを作成し、以下を実行：

**macOS（Homebrew）：**

```bash
brew install ngrok
```

**Windows：**

[https://ngrok.com/download](https://ngrok.com/download) からダウンロードして解凍し、PATH に追加。

**authtoken の設定**（[ngrok Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) からコピー）：

```bash
ngrok config add-authtoken あなたのauthtoken
```

---

### 4. LINE Bot の作成

1. [LINE Developers Console](https://developers.line.biz/console/) にログイン
2. **Create a Provider** をクリックし、名前を入力（例：`My Claude Bot`）
3. **Create a new channel** → **Messaging API** を選択
4. 必須項目（Channel name、説明、カテゴリ）を入力して作成

認証情報の取得：

- **Channel Secret**：channel → **Basic settings** タブ → `Channel secret` をコピー
- **Channel Access Token**：channel → **Messaging API** タブ → 下部の **Issue** をクリック → トークンをコピー

**Messaging API** タブで以下を無効化（自動返信の干渉を防ぐため）：
- **Auto-reply messages** → **Disabled**
- **Greeting messages** → **Disabled**

---

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/Moksa1123/claude-channel-line
cd claude-channel-line
```

---

### 2. LINE 認証情報の保存

認証情報は `~/.claude/channels/line/.env` に保存され、git には**コミットされません**。

**macOS / Linux：**

```bash
mkdir -p ~/.claude/channels/line
cat > ~/.claude/channels/line/.env << EOF
LINE_CHANNEL_ACCESS_TOKEN=あなたのChannel Access Token
LINE_CHANNEL_SECRET=あなたのChannel Secret
EOF
```

**Windows（PowerShell）：**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\channels\line"
@"
LINE_CHANNEL_ACCESS_TOKEN=あなたのChannel Access Token
LINE_CHANNEL_SECRET=あなたのChannel Secret
"@ | Set-Content "$env:USERPROFILE\.claude\channels\line\.env"
```

---

### 3. MCP Server の追加

**macOS / Linux：**

```bash
claude mcp add line bun "/path/to/claude-channel-line/server.ts"
```

**Windows：**

```powershell
claude mcp add line bun "C:/path/to/claude-channel-line/server.ts"
```

> パスは実際にクローンした場所に変更してください。

確認：

```bash
claude mcp list
```

`line` がリストに表示されれば成功です。

---

### 4. ngrok の起動

**別のターミナルウィンドウ**で実行：

```bash
ngrok http 8789
```

以下のような表示が出ます：

```
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:8789
```

`https://xxxx.ngrok-free.app` の URL をコピーしておいてください。

> **注意**：ngrok ウィンドウは開いたままにしてください。閉じると接続が切れます。無料プランでは再起動のたびに URL が変わるため、その都度 LINE Console で Webhook URL を更新する必要があります。

---

### 5. LINE Webhook の設定

[LINE Developers Console](https://developers.line.biz/console/) でチャンネルを開き：

1. **Messaging API** タブをクリック
2. **Webhook URL** フィールドの **Edit** をクリック
3. `https://xxxx.ngrok-free.app/webhook` を入力（ngrok の URL に置き換え）
4. **Update** をクリック
5. **Use webhook** トグルを有効化
6. **Verify** をクリック → **Success** が表示されれば完了

---

### 6. Claude Code の起動

**新しいターミナルウィンドウ**で実行：

```bash
claude --dangerously-load-development-channels server:line
```

Claude Code が LINE MCP server に接続し、メッセージの受信を開始します。

> **重要**：毎回 `--dangerously-load-development-channels server:line` フラグを付けて起動する必要があります。`claude` のみで起動した場合、LINE メッセージは受信されません。

> **Windows の注意**：このコマンドは通常のターミナル（PowerShell / CMD）で実行してください。Claude Code 内部では実行できません。

---

### 7. LINE アカウントのペアリング

1. LINE でボットを探します（LINE Developers Console → Messaging API → **Bot basic ID** で確認可能）
2. ボットに任意のメッセージを送信（例：`こんにちは`）
3. ボットがペアリングコードを返信します：

   ```
   ペアリングコード：A1B2C3

   Claude Code で実行してください：
   /line:access pair A1B2C3
   ```

4. ペアリングコードに対応する userId を確認：

   **macOS / Linux：**
   ```bash
   cat ~/.claude/channels/line/pending/A1B2C3.json
   ```

   **Windows（PowerShell）：**
   ```powershell
   Get-Content "$env:USERPROFILE\.claude\channels\line\pending\A1B2C3.json"
   ```

   出力例：
   ```json
   {
     "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "expires": 1234567890000
   }
   ```

5. userId をホワイトリストに追加（`~/.claude/channels/line/access.json` を編集）：

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

6. LINE でもう一度メッセージを送ると、Claude が受信して返信します！

---

## Webhook 常駐サービス（自動起動）

デフォルトでは、webhook サーバーは Claude Code の MCP プロセス内で動作します。**Claude Code を閉じると webhook も停止し**、LINE に 502 エラーが返されます。

`webhook-service.ts` は独立した常駐サービスで、Claude Code が起動していない間も webhook を維持します。受信メッセージは `~/.claude/channels/line/messages/` に保存され、Claude Code が起動したときに自動的に処理されます。

キュー処理には以下の信頼性機能が含まれます：
- **5 秒の起動遅延** — MCP 接続が安定するまで待機してからキューメッセージの処理を開始
- **自動リトライ（3 回）** — 配信に失敗したメッセージは最大 3 回まで再試行してから破棄
- **期限切れ reply_token のクリーンアップ** — 25 秒以上経過した reply_token を自動的にクリア（LINE トークンは 30 秒で期限切れ）

### Windows

プロジェクトディレクトリでインストールスクリプトを実行：

```powershell
powershell -ExecutionPolicy Bypass -File "autostart\windows\install.ps1"
```

バックグラウンドで動作する `.vbs` スクリプトをスタートアップフォルダに作成し、すぐにサービスを起動します。

---

### macOS

```bash
chmod +x autostart/macos/install.sh
./autostart/macos/install.sh
```

launchd Launch Agent を使用。bun のパスを自動検出し、ログイン時に自動起動するよう設定します。

停止する場合：
```bash
launchctl stop com.line-webhook
launchctl unload ~/Library/LaunchAgents/com.line-webhook.plist
```

---

### Linux（systemd）

```bash
chmod +x autostart/linux/install.sh
./autostart/linux/install.sh
```

systemd ユーザーサービスを使用。bun のパスを自動検出し、ログイン時に自動起動するよう設定します。

ログの確認：
```bash
systemctl --user status line-webhook
journalctl --user -u line-webhook -f
```

---

## ユーザーの追加

他のユーザーにボットを使わせるには：

1. 相手にボットを友達追加してメッセージを送ってもらう（ペアリングコードが届く）
2. 相手からペアリングコードを教えてもらう
3. `~/.claude/channels/line/pending/<コード>.json` で相手の userId を確認
4. `access.json` の `allowlist` に追加：

```json
{
  "policy": "allowlist",
  "allowlist": [
    "U自分のuserId",
    "U相手のuserId"
  ]
}
```

---

## アクセスポリシー

`~/.claude/channels/line/access.json` の `policy` フィールドを編集：

| ポリシー | 動作 | 用途 |
|----------|------|------|
| `pairing` | メッセージを送ると全員にペアリングコードが届く（デフォルト） | 初回設定・ユーザー追加時 |
| `allowlist` | ホワイトリストの userId のみ受信（その他は無視） | 通常運用（推奨） |
| `open` | 全員がメッセージ送信可能 | 非推奨 |

---

## 送信できるメッセージタイプ

Claude は以下の方法で LINE ユーザーに返信できます：

| ツール | タイプ | 説明 |
|--------|--------|------|
| `reply` | テキスト | プレーンテキスト（5,000 文字超で自動分割、最大 5 件） |
| `reply_image` | 画像 | HTTPS URL で画像を送信 |
| `reply_flex` | Flex Message | リッチカードレイアウト。ボタン、リンク、画像、カルーセル対応（bubble / carousel） |
| `reply_mixed` | 混合 | 異なるタイプのメッセージを 1 回で最大 5 件送信 |

> **ヒント**：`reply_token` はメッセージ受信後 30 秒間有効です。期限切れ後は Claude が自動的に `user_id` を使ったプッシュモードに切り替えます。

---

## 画像の Google Drive 自動バックアップ

ユーザーが LINE で画像を送信すると、`webhook-service.ts` が自動的にダウンロードして Google Drive にバックアップします。各画像はタイムスタンプ付きのファイル名（`LINE_YYYYMMDD_HHMMSS.jpg`）で保存され、ユーザーには Drive リンク付きの確認メッセージが届きます。

### セットアップ

1. **Google OAuth2 認証情報**：認証ファイルを以下の場所に配置：

   ```
   ~/.google_workspace_mcp/credentials/<メールアドレス>.json
   ```

   ファイルには有効な `refresh_token`、`client_id`、`client_secret` が必要です。

2. **保存先フォルダの設定**：`webhook-service.ts` の `GDRIVE_FOLDER_ID` 定数に、画像をアップロードする Google Drive フォルダの ID を設定します。

   > フォルダ ID は Google Drive の URL から取得できます：`https://drive.google.com/drive/folders/<FOLDER_ID>`

### 動作の流れ

1. ユーザーが LINE チャットで画像を送信
2. `webhook-service.ts` が LINE Content API から画像をダウンロード
3. 指定された Google Drive フォルダに画像をアップロード
4. ユーザーに Google Drive ファイルへの直リンク付き確認メッセージを LINE で返信

---

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token | **必須** |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | **必須** |
| `LINE_WEBHOOK_PORT` | Webhook サーバーのポート | `8789` |
| `GDRIVE_FOLDER_ID` | 画像バックアップ先の Google Drive フォルダ ID（`webhook-service.ts` で設定） | — |

---

## トラブルシューティング

**Verify で 502 Bad Gateway が表示される**

Webhook サーバーが起動していません。2 つの解決方法があります：

- **一時的な対処**：`claude --dangerously-load-development-channels server:line` で Claude Code を起動すると、webhook サーバーも同時に起動します。
- **恒久的な対処**：[Webhook 常駐サービス](#webhook-常駐サービス自動起動) を設定し、Claude Code に依存せず webhook を常時稼働させます。

**メッセージを送ってもボットが反応しない**

- ngrok が起動中か確認
- LINE の Webhook URL が正しく、**Use webhook** が有効か確認
- `access.json` の policy と userId が正しいか確認

**ngrok を再起動するたびに URL が変わる**

無料プランでは再起動のたびに URL が変わります。その都度 LINE Developers Console で Webhook URL を更新してください。固定 URL が必要な場合は有料プランへのアップグレードをご検討ください。

**Windows でトークンに特殊文字が含まれる場合**

引用符でトークンを囲んでください：

```powershell
$env:LINE_CHANNEL_ACCESS_TOKEN="特殊文字を含むトークン"
```

**MCP server 起動失敗（ポートが使用中）**

常駐サービスが稼働中の場合、`server.ts` はポートの競合を自動検出してキューモードに切り替わるため、手動対応は不要です。

別のポートを使用したい場合：

```bash
claude mcp remove line
claude mcp add line bun "/path/to/server.ts" -e LINE_WEBHOOK_PORT=8790
ngrok http 8790
```

---

## ライセンス

MIT
