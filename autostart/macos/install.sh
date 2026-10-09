#!/bin/bash
# LINE Webhook Service - macOS 安裝腳本
# 使用 launchd Launch Agent，登入後自動啟動

set -e

BUN_PATH=$(which bun 2>/dev/null || echo "")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_TS="$SCRIPT_DIR/webhook-service.ts"
PLIST="$HOME/Library/LaunchAgents/com.line-webhook.plist"

if [ -z "$BUN_PATH" ]; then
  echo "❌ 找不到 bun，請先安裝：curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

echo "bun 路徑：$BUN_PATH"
echo "服務腳本：$SERVICE_TS"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.line-webhook</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BUN_PATH</string>
    <string>$SERVICE_TS</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>/tmp/line-webhook.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl start com.line-webhook

echo "✅ LINE Webhook Service 已啟動並設定為開機自動執行"
echo "   日誌：tail -f /tmp/line-webhook.log"
echo "   停止：launchctl stop com.line-webhook"
echo "   移除：launchctl unload $PLIST && rm $PLIST"
