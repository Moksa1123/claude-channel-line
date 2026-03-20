#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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

// 從 ~/.claude/channels/line/.env 載入憑證
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
  console.error('[line] 尚未設定憑證，請執行 /line:configure <token> <secret>')
  process.exit(1)
}

// ── Access Control ────────────────────────────────────────
type Policy = 'pairing' | 'allowlist' | 'open'
type AccessConfig = { policy: Policy; allowlist: string[] }

function loadAccess(): AccessConfig {
  if (existsSync(ACCESS_FILE)) {
    return JSON.parse(readFileSync(ACCESS_FILE, 'utf-8'))
  }
  return { policy: 'pairing', allowlist: [] }
}

function saveAccess(cfg: AccessConfig) {
  mkdirSync(dirname(ACCESS_FILE), { recursive: true })
  writeFileSync(ACCESS_FILE, JSON.stringify(cfg, null, 2))
}

// pairing codes: code → { userId, expires }
const pending = new Map<string, { userId: string; expires: number }>()
const PENDING_DIR = join(CHANNEL_DIR, 'pending')

function genCode(): string {
  return Math.random().toString(16).slice(2, 8).toUpperCase()
}

function pruneCodes() {
  const now = Date.now()
  for (const [code, info] of pending) {
    if (info.expires < now) {
      pending.delete(code)
      try { Bun.file(join(PENDING_DIR, `${code}.json`)) } catch {}
    }
  }
}

function savePendingCode(code: string, userId: string, expires: number) {
  mkdirSync(PENDING_DIR, { recursive: true })
  writeFileSync(join(PENDING_DIR, `${code}.json`), JSON.stringify({ userId, expires }, null, 2))
}

// ── LINE API ──────────────────────────────────────────────
function splitText(text: string, limit = 5000): string[] {
  const chunks: string[] = []
  let s = text
  while (s.length > limit) {
    const idx = s.lastIndexOf('\n\n', limit)
    const at = idx > 0 ? idx : limit
    chunks.push(s.slice(0, at))
    s = s.slice(at).trimStart()
  }
  if (s) chunks.push(s)
  return chunks
}

async function lineCall(endpoint: string, body: object) {
  const res = await fetch(`https://api.line.me/v2/bot/message/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`[line] API error ${res.status}:`, await res.text())
  }
}

async function lineReply(replyToken: string, text: string) {
  const messages = splitText(text).slice(0, 5).map(t => ({ type: 'text', text: t }))
  await lineCall('reply', { replyToken, messages })
}

async function linePush(to: string, text: string) {
  const messages = splitText(text).slice(0, 5).map(t => ({ type: 'text', text: t }))
  await lineCall('push', { to, messages })
}

// ── 簽名驗證 ──────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', SECRET).update(rawBody).digest('base64')
  return expected === signature
}

// ── MCP Server ────────────────────────────────────────────
const mcp = new Server(
  { name: 'line', version: '0.1.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions: [
      'LINE 訊息以 <channel source="line" user_id="..." reply_token="..."> 格式傳入。',
      '使用 reply tool 回覆，傳入 user_id 和 text。',
      'reply_token 在收到訊息後 30 秒內有效；超過時間則改用 user_id 做 push。',
    ].join('\n'),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: '回覆 LINE 使用者的訊息',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:     { type: 'string', description: 'LINE user ID（來自 channel 事件）' },
          text:        { type: 'string', description: '要傳送的訊息內容' },
          reply_token: { type: 'string', description: '選填：reply token（30 秒內有效）' },
        },
        required: ['user_id', 'text'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  if (req.params.name === 'reply') {
    const { user_id, text, reply_token } = req.params.arguments as {
      user_id: string
      text: string
      reply_token?: string
    }
    if (reply_token) {
      await lineReply(reply_token, text)
    } else {
      await linePush(user_id, text)
    }
    return { content: [{ type: 'text', text: 'sent' }] }
  }
  throw new Error(`未知的 tool: ${req.params.name}`)
})

await mcp.connect(new StdioServerTransport())

// ── Webhook Server ────────────────────────────────────────
Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',

  async fetch(req) {
    const url = new URL(req.url)

    // LINE 驗證用 GET
    if (req.method === 'GET' && url.pathname === '/webhook') {
      return new Response('OK')
    }

    // 接收 LINE 事件
    if (req.method === 'POST' && url.pathname === '/webhook') {
      const rawBody  = await req.text()
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
        const text       = event.message.text ?? ''
        const replyToken = event.replyToken ?? ''

        if (!userId) continue

        const allowed = access.allowlist.includes(userId)

        if (access.policy === 'open' || allowed) {
          // 推送進 Claude session
          await mcp.notification({
            method: 'notifications/claude/channel',
            params: {
              content: text,
              meta: { user_id: userId, reply_token: replyToken },
            },
          })
        } else if (access.policy === 'pairing') {
          // 產生 pairing code，回覆給使用者
          const code = genCode()
          const expires = Date.now() + 10 * 60 * 1000
          pending.set(code, { userId, expires })
          savePendingCode(code, userId, expires)
          await lineReply(replyToken,
            `配對碼：${code}\n\n請在 Claude Code 執行：\n/line:access pair ${code}`)
        }
        // policy === 'allowlist' 且不在白名單 → 靜默丟棄
      }

      return new Response('OK')
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.error(`[line] Webhook server 啟動於 port ${PORT}`)

// ── 配對指令（由 Claude 的 skill 觸發） ────────────────────
// 範例：環境變數 LINE_PAIR_CODE 傳入 code，自動完成配對
const pairCode = process.env.LINE_PAIR_CODE
if (pairCode) {
  const info = pending.get(pairCode)
  if (info && info.expires > Date.now()) {
    const access = loadAccess()
    if (!access.allowlist.includes(info.userId)) {
      access.allowlist.push(info.userId)
      saveAccess(access)
      console.error(`[line] 已將 ${info.userId} 加入白名單`)
    }
    pending.delete(pairCode)
  } else {
    console.error(`[line] 配對碼無效或已過期：${pairCode}`)
  }
}
