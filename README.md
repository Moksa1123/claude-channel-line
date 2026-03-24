# LINE Channel for Claude Code

[繁體中文](README.zh-TW.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md)

Push LINE messages into your Claude Code session via the LINE Messaging API, so Claude can receive and reply to your LINE messages in real time.

---

## Table of Contents

- [Requirements](#requirements)
- [Prerequisites](#prerequisites)
  - [Install Claude Code](#1-install-claude-code)
  - [Install Bun](#2-install-bun)
  - [Install ngrok](#3-install-ngrok)
  - [Create a LINE Bot](#4-create-a-line-bot)
- [Setup](#setup)
  - [Clone the repository](#1-clone-the-repository)
  - [Save LINE credentials](#2-save-line-credentials)
  - [Add MCP Server](#3-add-mcp-server)
  - [Start ngrok](#4-start-ngrok)
  - [Configure LINE Webhook](#5-configure-line-webhook)
  - [Start Claude Code](#6-start-claude-code)
  - [Pair your LINE account](#7-pair-your-line-account)
- [Always-on Webhook Service (auto-start)](#always-on-webhook-service-auto-start)
- [Adding more users](#adding-more-users)
- [Access Policy](#access-policy)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- **OS**: Windows / macOS / Linux
- **Claude Code** v2.1.80+, signed in with a claude.ai account (not API key)
- **Bun** runtime
- **ngrok** account (free tier works)
- **LINE Developers** account (free)

---

## Prerequisites

### 1. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Then sign in:

```bash
claude
```

Follow the prompts to sign in with your claude.ai account.

---

### 2. Install Bun

**macOS / Linux:**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (PowerShell):**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify the installation:

```bash
bun --version
```

---

### 3. Install ngrok

Sign up for a free account at [https://ngrok.com](https://ngrok.com), then:

**macOS (Homebrew):**

```bash
brew install ngrok
```

**Windows:**

Download from [https://ngrok.com/download](https://ngrok.com/download), extract, and add to PATH.

**Set your authtoken** (copy from [ngrok Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)):

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

---

### 4. Create a LINE Bot

1. Go to [LINE Developers Console](https://developers.line.biz/console/) and sign in
2. Click **Create a Provider** and enter a name (e.g. `My Claude Bot`)
3. Click **Create a new channel** → select **Messaging API**
4. Fill in the required fields (Channel name, description, Category) and create

Get your credentials:

- **Channel Secret**: channel → **Basic settings** tab → copy `Channel secret`
- **Channel Access Token**: channel → **Messaging API** tab → scroll to the bottom → click **Issue** → copy the token

In the **Messaging API** tab, disable the following to prevent automatic replies from interfering:
- **Auto-reply messages** → **Disabled**
- **Greeting messages** → **Disabled**

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Moksa1123/claude-channel-line
cd claude-channel-line
```

---

### 2. Save LINE credentials

Credentials are stored in `~/.claude/channels/line/.env` and will **not** be committed to git.

**macOS / Linux:**

```bash
mkdir -p ~/.claude/channels/line
cat > ~/.claude/channels/line/.env << EOF
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret
EOF
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\channels\line"
@"
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret
"@ | Set-Content "$env:USERPROFILE\.claude\channels\line\.env"
```

---

### 3. Add MCP Server

**macOS / Linux:**

```bash
claude mcp add line bun "/path/to/claude-channel-line/server.ts"
```

**Windows:**

```powershell
claude mcp add line bun "C:/path/to/claude-channel-line/server.ts"
```

> Replace the path with the actual location where you cloned the repo.

Verify it was added:

```bash
claude mcp list
```

You should see `line` in the list.

---

### 4. Start ngrok

Open a **separate terminal window** and run:

```bash
ngrok http 8789
```

You should see something like:

```
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:8789
```

Copy the `https://xxxx.ngrok-free.app` URL — you'll need it in the next step.

> **Note**: Keep the ngrok window open. Closing it will disconnect the tunnel. The URL changes every time you restart ngrok (free plan), so you'll need to update the Webhook URL in LINE Console each time.

---

### 5. Configure LINE Webhook

Back in [LINE Developers Console](https://developers.line.biz/console/), open your channel:

1. Click the **Messaging API** tab
2. Find the **Webhook URL** field and click **Edit**
3. Enter: `https://xxxx.ngrok-free.app/webhook` (replace with your ngrok URL)
4. Click **Update**
5. Enable the **Use webhook** toggle
6. Click **Verify** → should show **Success**

---

### 6. Start Claude Code

Open a **new terminal window** and run:

```bash
claude --dangerously-load-development-channels server:line
```

Claude Code will connect to the LINE MCP server and start listening for messages.

> **Important**: You must include `--dangerously-load-development-channels server:line` every time you start Claude Code. Running `claude` without this flag will not receive LINE messages.

> **Windows note**: Run this command in a regular terminal (PowerShell / CMD), not inside Claude Code itself.

---

### 7. Pair your LINE account

1. Open LINE and find your bot (the **Bot basic ID** is shown in LINE Developers Console → Messaging API)
2. Send any message to the bot, e.g. `hi`
3. The bot will reply with a pairing code:

   ```
   Pairing code: A1B2C3

   Run in Claude Code:
   /line:access pair A1B2C3
   ```

4. Look up the userId for that pairing code:

   **macOS / Linux:**
   ```bash
   cat ~/.claude/channels/line/pending/A1B2C3.json
   ```

   **Windows (PowerShell):**
   ```powershell
   Get-Content "$env:USERPROFILE\.claude\channels\line\pending\A1B2C3.json"
   ```

   Output:
   ```json
   {
     "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "expires": 1234567890000
   }
   ```

5. Add the userId to the allowlist by editing `~/.claude/channels/line/access.json`:

   **macOS / Linux:**
   ```bash
   cat > ~/.claude/channels/line/access.json << EOF
   {
     "policy": "allowlist",
     "allowlist": ["Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
   }
   EOF
   ```

   **Windows (PowerShell):**
   ```powershell
   @"
   {
     "policy": "allowlist",
     "allowlist": ["Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
   }
   "@ | Set-Content "$env:USERPROFILE\.claude\channels\line\access.json"
   ```

6. Send another LINE message — Claude will now receive and reply to it!

---

## Always-on Webhook Service (auto-start)

By default, the webhook server runs inside Claude Code's MCP process — **it stops when Claude Code closes**, causing LINE to receive 502 errors.

`webhook-service.ts` is a standalone server that keeps the webhook alive even when Claude Code is not running. Incoming messages are queued in `~/.claude/channels/line/messages/` and picked up automatically when Claude Code starts.

### Windows

Run the install script from the project directory (auto-detects bun path and creates a startup entry):

```powershell
powershell -ExecutionPolicy Bypass -File "autostart\windows\install.ps1"
```

This creates a background `.vbs` script in the startup folder and starts the service immediately — no reboot required.

---

### macOS

```bash
chmod +x autostart/macos/install.sh
./autostart/macos/install.sh
```

Uses a launchd Launch Agent. Auto-detects bun path and registers the service for login startup.

To stop:
```bash
launchctl stop com.line-webhook
launchctl unload ~/Library/LaunchAgents/com.line-webhook.plist
```

---

### Linux (systemd)

```bash
chmod +x autostart/linux/install.sh
./autostart/linux/install.sh
```

Uses a systemd user service. Auto-detects bun path and enables the service on login.

View logs:
```bash
systemctl --user status line-webhook
journalctl --user -u line-webhook -f
```

---

## Adding more users

To allow other people to use the bot:

1. Have them add the bot as a friend and send a message — they'll receive a pairing code
2. Ask them to share the pairing code with you
3. Look up their userId in `~/.claude/channels/line/pending/<code>.json`
4. Add their userId to the `allowlist` in `access.json`:

```json
{
  "policy": "allowlist",
  "allowlist": [
    "Uyour_user_id",
    "Utheir_user_id"
  ]
}
```

---

## Access Policy

Edit the `policy` field in `~/.claude/channels/line/access.json`:

| Policy | Behavior | When to use |
|--------|----------|-------------|
| `pairing` | Anyone who messages the bot receives a pairing code (default) | Initial setup, adding new users |
| `allowlist` | Only userIds in the allowlist can send messages; others are silently dropped | Normal use — recommended |
| `open` | Anyone can send messages | Not recommended — no access control |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token | **required** |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | **required** |
| `LINE_WEBHOOK_PORT` | Webhook server port | `8789` |

---

## Troubleshooting

**Verify shows 502 Bad Gateway**

The webhook server is not running. Two options:

- **Quick fix**: Start Claude Code with `claude --dangerously-load-development-channels server:line` — it will also bring up the webhook server.
- **Permanent fix**: Set up the [Always-on Webhook Service](#always-on-webhook-service-auto-start) so the webhook runs independently of Claude Code.

**Bot doesn't respond to messages**

- Check that ngrok is still running
- Check that the LINE Webhook URL is correct and **Use webhook** is enabled
- Check that `access.json` has the correct policy and your userId in the allowlist

**ngrok URL changes every restart**

The free ngrok plan assigns a new URL on each restart. You'll need to update the Webhook URL in LINE Developers Console each time. Upgrade to a paid plan for a fixed URL.

**Token with special characters fails on Windows**

Wrap the token in quotes:

```powershell
$env:LINE_CHANNEL_ACCESS_TOKEN="your+token/with=special+chars"
```

**MCP server fails to start — port already in use**

If you have the always-on webhook service running, `server.ts` automatically detects the port conflict and switches to queue mode — no action needed.

To use a different port instead:

```bash
claude mcp remove line
claude mcp add line bun "/path/to/server.ts" -e LINE_WEBHOOK_PORT=8790
ngrok http 8790
```

---

## License

MIT
