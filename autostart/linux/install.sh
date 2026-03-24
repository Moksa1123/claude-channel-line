#!/bin/bash
# LINE Webhook Service - Linux 安裝腳本
# 使用 systemd user service，登入後自動啟動

set -e

BUN_PATH=$(which bun 2>/dev/null || echo "")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_TS="$SCRIPT_DIR/webhook-service.ts"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/line-webhook.service"

if [ -z "$BUN_PATH" ]; then
  echo "❌ 找不到 bun，請先安裝：curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

echo "bun 路徑：$BUN_PATH"
echo "服務腳本：$SERVICE_TS"

mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=LINE Webhook Service for Claude Code
After=network.target

[Service]
ExecStart=$BUN_PATH $SERVICE_TS
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable line-webhook
systemctl --user start line-webhook

echo "✅ LINE Webhook Service 已啟動並設定為開機自動執行"
echo "   日誌：journalctl --user -u line-webhook -f"
echo "   狀態：systemctl --user status line-webhook"
echo "   停止：systemctl --user stop line-webhook"
echo "   移除：systemctl --user disable line-webhook && rm $SERVICE_FILE"
