# Changelog

## [0.2.0] - 2026-04-06

### Added
- **Google Drive image backup**: When users send images via LINE, `webhook-service.ts` automatically downloads and uploads them to Google Drive using OAuth2 refresh token flow. Images are named with timestamp (`LINE_YYYYMMDD_HHMMSS.jpg`), and users receive a confirmation reply with the Drive link.
- **Automatic retry for failed deliveries**: Queued messages that fail to deliver are retried up to 3 times before being discarded.
- **Expired reply_token cleanup**: Reply tokens older than 25 seconds are automatically cleared from queued messages (LINE tokens expire at 30 seconds).

### Improved
- **Startup delay for MCP stability**: Added a 5-second delay before processing queued messages, allowing the MCP connection to fully stabilize.
- **Queue processing logging**: Added console output for queue processing status, making it easier to monitor message delivery.

## [0.1.0] - 2026-03-28 (initial release)
- LINE Messaging API integration with Claude Code via MCP
- Webhook server with message queuing
- Always-on webhook service (`webhook-service.ts`) with auto-start support for Windows, macOS, and Linux
- Access control with pairing, allowlist, and open policies
- Support for text, image, Flex Message, and mixed message types
- Automatic push mode fallback when reply_token expires
