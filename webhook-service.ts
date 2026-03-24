#!/usr/bin/env bun
/**
 * LINE Webhook 獨立服務
 * - 開機自動啟動，常駐監聽 port 8789
 * - 收到 LINE 訊息後存入 ~/.claude/channels/line/messages/
 * - MCP server (server.ts) 從該目錄讀取並轉發給 Claude
 */
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

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
        if (event.type !== 'message' || event.message?.type !== 'text') continue

        const userId     = event.source?.userId ?? ''
        const text       = event.message.text   ?? ''
        const replyToken = event.replyToken      ?? ''

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
