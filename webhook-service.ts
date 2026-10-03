#!/usr/bin/env bun
/**
 * LINE Webhook 獨立服務
 * - 開機自動啟動，常駐監聽 port 8789
 * - 收到 LINE 訊息後存入 ~/.claude/channels/line/messages/
 * - MCP server (server.ts) 從該目錄讀取並轉發給 Claude
 */
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── 設定 ──────────────────────────────────────────────────
const CHANNEL_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude', 'channels', 'line',
)
const ENV_FILE    = join(CHANNEL_DIR, '.env')
const ACCESS_FILE = join(CHANNEL_DIR, 'access.json')
const PENDING_DIR = join(CHANNEL_DIR, 'pending')
const MSG_DIR     = join(CHANNEL_DIR, 'messages')

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const SECRET = process.env.LINE_CHANNEL_SECRET ?? ''
const PORT   = Number(process.env.LINE_WEBHOOK_PORT ?? 8789)

if (!TOKEN || !SECRET) {
  console.error('[line-webhook] 尚未設定憑證，請確認 ~/.claude/channels/line/.env')
  process.exit(1)
}

mkdirSync(PENDING_DIR, { recursive: true })
mkdirSync(MSG_DIR,     { recursive: true })

// ── Access Control ────────────────────────────────────────
type Policy = 'pairing' | 'allowlist' | 'open'
type AccessConfig = { policy: Policy; allowlist: string[] }

function loadAccess(): AccessConfig {
  if (existsSync(ACCESS_FILE)) {
    return JSON.parse(readFileSync(ACCESS_FILE, 'utf-8'))
  }
  return { policy: 'pairing', allowlist: [] }
}

// ── Pairing codes ─────────────────────────────────────────
function genCode(): string {
  return Math.random().toString(16).slice(2, 8).toUpperCase()
}

function pruneCodes() {
  const now = Date.now()
  if (!existsSync(PENDING_DIR)) return
  for (const f of (Bun.readdirSync ?? require('fs').readdirSync)(PENDING_DIR)) {
    const fp = join(PENDING_DIR, f as string)
    try {
      const info = JSON.parse(readFileSync(fp, 'utf-8'))
      if (info.expires < now) require('fs').unlinkSync(fp)
    } catch {}
  }
}

// ── LINE API ──────────────────────────────────────────────
function splitText(text: string, limit = 5000): string[] {
  const chunks: string[] = []
  let s = text
  while (s.length > limit) {
    const idx = s.lastIndexOf('\n\n', limit)
    const at  = idx > 0 ? idx : limit
    chunks.push(s.slice(0, at))
    s = s.slice(at).trimStart()
  }
  if (s) chunks.push(s)
  return chunks
}

async function lineCall(endpoint: string, body: object) {
  const res = await fetch(`https://api.line.me/v2/bot/message/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) console.error(`[line-webhook] API error ${res.status}:`, await res.text())
}

async function lineReply(replyToken: string, text: string) {
  const messages = splitText(text).slice(0, 5).map(t => ({ type: 'text', text: t }))
  await lineCall('reply', { replyToken, messages })
}

// ── 簽名驗證 ──────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', SECRET).update(rawBody).digest('base64')
  return expected === signature
}

// ── Webhook Server ────────────────────────────────────────
Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',

  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/webhook') {
      return new Response('OK')
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const rawBody   = await req.text()
      const signature = req.headers.get('x-line-signature') ?? ''

      if (!verifySignature(rawBody, signature)) {
        return new Response('Forbidden', { status: 403 })
      }

      const payload = JSON.parse(rawBody)
      const access  = loadAccess()
      pruneCodes()

      for (const event of payload.events ?? []) {
        // ── Postback 處理（LINE 授權按鈕回覆）──────────────
        if (event.type === 'postback') {
          const params = new URLSearchParams(event.postback?.data ?? '')
          const action = params.get('action')
          const approvalId = params.get('id')
          const replyToken = event.replyToken ?? ''

          if (action && approvalId) {
            const APPROVAL_DIR = join(CHANNEL_DIR, 'approvals')
            const ALLOW_ALWAYS_FILE = join(CHANNEL_DIR, 'allow-always.json')
            const fp = join(APPROVAL_DIR, `${approvalId}.json`)
            try {
              if (existsSync(fp)) {
                const data = JSON.parse(readFileSync(fp, 'utf-8'))

                // 已經處理過的請求（超時、已選擇）
                if (data.status === 'timed_out') {
                  if (replyToken) await lineReply(replyToken, '此請求已超時（5 分鐘），Claude 那邊已自動拒絕。')
                  continue
                }
                if (data.status === 'approved' || data.status === 'denied') {
                  if (replyToken) await lineReply(replyToken, `此請求已處理過（${data.status === 'approved' ? '允許' : '拒絕'}）。`)
                  continue
                }

                if (action === 'approve_always') {
                  // 加入永久白名單
                  let list: { patterns: string[] }
                  try {
                    list = existsSync(ALLOW_ALWAYS_FILE)
                      ? JSON.parse(readFileSync(ALLOW_ALWAYS_FILE, 'utf-8'))
                      : { patterns: [] }
                  } catch { list = { patterns: [] } }

                  const pattern = data.cmdPattern ?? ''
                  if (pattern && !list.patterns.includes(pattern)) {
                    list.patterns.push(pattern)
                    writeFileSync(ALLOW_ALWAYS_FILE, JSON.stringify(list, null, 2))
                  }
                  data.status = 'approved'
                  writeFileSync(fp, JSON.stringify(data, null, 2))
                  if (replyToken) {
                    await lineReply(replyToken, `Allowed. "${pattern}" 已加入永久白名單，之後同類指令自動放行。`)
                  }
                } else {
                  data.status = action === 'approve' ? 'approved' : 'denied'
                  writeFileSync(fp, JSON.stringify(data, null, 2))
                  if (replyToken) {
                    await lineReply(replyToken, action === 'approve' ? 'Allowed' : 'Denied')
                  }
                }
              } else if (replyToken) {
                await lineReply(replyToken, '授權請求已過期或不存在')
              }
            } catch (e) {
              console.error('[approval] postback error:', e)
            }
          }
          continue
        }

        if (event.type !== 'message') continue

        const userId     = event.source?.userId ?? ''
        const replyToken = event.replyToken      ?? ''
        const msgType    = event.message?.type   ?? ''

        if (msgType !== 'text') continue

        const text = event.message.text ?? ''

        if (!userId) continue

        const allowed = access.allowlist.includes(userId)

        if (access.policy === 'open' || allowed) {
          // 儲存訊息到佇列，等 MCP server 來讀取
          const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
          writeFileSync(
            join(MSG_DIR, `${id}.json`),
            JSON.stringify({ userId, text, replyToken, ts: Date.now() }, null, 2),
          )
        } else if (access.policy === 'pairing') {
          const code    = genCode()
          const expires = Date.now() + 10 * 60 * 1000
          writeFileSync(
            join(PENDING_DIR, `${code}.json`),
            JSON.stringify({ userId, expires }, null, 2),
          )
          await lineReply(replyToken,
            `配對碼：${code}\n\n請在 Claude Code 執行：\n/line:access pair ${code}`)
        }
        // allowlist policy 且不在白名單 → 靜默丟棄
      }

      return new Response('OK')
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.error(`[line-webhook] Webhook service 啟動於 port ${PORT}`)
