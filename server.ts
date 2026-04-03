#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'

// ── 設定 ──────────────────────────────────────────────────
const CHANNEL_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude', 'channels', 'line',
)
const ENV_FILE    = join(CHANNEL_DIR, '.env')
const ACCESS_FILE = join(CHANNEL_DIR, 'access.json')
const MSG_DIR     = join(CHANNEL_DIR, 'messages')

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

async function lineReply(replyToken: string, messages: object[]) {
  await lineCall('reply', { replyToken, messages })
}

async function linePush(to: string, messages: object[]) {
  await lineCall('push', { to, messages })
}

function textMessages(text: string): object[] {
  return splitText(text).slice(0, 5).map(t => ({ type: 'text', text: t }))
}

function imageMessage(url: string, previewUrl?: string): object {
  return { type: 'image', originalContentUrl: url, previewImageUrl: previewUrl ?? url }
}

function flexMessage(altText: string, contents: object): object {
  return { type: 'flex', altText, contents }
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
      '使用 reply 回覆純文字，reply_image 傳圖片，reply_flex 傳 Flex Message 卡片，reply_mixed 一次傳多種類型。',
      'reply_token 在收到訊息後 30 秒內有效；超過時間則改用 user_id 做 push。',
      '傳 PDF 等檔案時，用 reply_flex 做一個含下載按鈕的卡片（LINE 不支援直接發送檔案）。',
    ].join('\n'),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: '回覆 LINE 使用者的訊息（純文字）',
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
    {
      name: 'reply_image',
      description: '傳送圖片給 LINE 使用者',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:     { type: 'string', description: 'LINE user ID' },
          image_url:   { type: 'string', description: '圖片 URL（須為 HTTPS）' },
          preview_url: { type: 'string', description: '選填：預覽圖 URL，未提供則使用 image_url' },
          reply_token: { type: 'string', description: '選填：reply token（30 秒內有效）' },
        },
        required: ['user_id', 'image_url'],
      },
    },
    {
      name: 'reply_flex',
      description: '傳送 Flex Message（豐富排版卡片）給 LINE 使用者，可附按鈕、連結、圖文混排',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:     { type: 'string', description: 'LINE user ID' },
          alt_text:    { type: 'string', description: '替代文字（通知預覽用）' },
          contents:    { type: 'object', description: 'Flex Message container JSON（bubble 或 carousel）' },
          reply_token: { type: 'string', description: '選填：reply token（30 秒內有效）' },
        },
        required: ['user_id', 'alt_text', 'contents'],
      },
    },
    {
      name: 'reply_mixed',
      description: '一次傳送多種類型訊息（文字+圖片+Flex），最多 5 則',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:     { type: 'string', description: 'LINE user ID' },
          messages:    {
            type: 'array',
            description: 'LINE message objects 陣列（每個物件須含 type 欄位）',
            items: { type: 'object' },
            maxItems: 5,
          },
          reply_token: { type: 'string', description: '選填：reply token（30 秒內有效）' },
        },
        required: ['user_id', 'messages'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = req.params.arguments as Record<string, any>
  const userId = args.user_id as string
  const replyToken = args.reply_token as string | undefined

  async function send(msgs: object[]) {
    if (replyToken) {
      await lineReply(replyToken, msgs)
    } else {
      await linePush(userId, msgs)
    }
  }

  switch (req.params.name) {
    case 'reply': {
      await send(textMessages(args.text as string))
      return { content: [{ type: 'text', text: 'sent' }] }
    }
    case 'reply_image': {
      await send([imageMessage(args.image_url as string, args.preview_url as string | undefined)])
      return { content: [{ type: 'text', text: 'sent' }] }
    }
    case 'reply_flex': {
      await send([flexMessage(args.alt_text as string, args.contents as object)])
      return { content: [{ type: 'text', text: 'sent' }] }
    }
    case 'reply_mixed': {
      await send((args.messages as object[]).slice(0, 5))
      return { content: [{ type: 'text', text: 'sent' }] }
    }
    default:
      throw new Error(`未知的 tool: ${req.params.name}`)
  }
})

await mcp.connect(new StdioServerTransport())

// ── 佇列輪詢：讀取 webhook-service 存入的訊息 ────────────
mkdirSync(MSG_DIR, { recursive: true })

setInterval(async () => {
  let files: string[]
  try { files = readdirSync(MSG_DIR).filter(f => f.endsWith('.json')).sort() }
  catch { return }

  for (const file of files) {
    const fp = join(MSG_DIR, file)
    try {
      const { userId, text, replyToken } = JSON.parse(readFileSync(fp, 'utf-8'))
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: { content: text, meta: { user_id: userId, reply_token: replyToken } },
      })
      unlinkSync(fp)
    } catch { /* MCP 未連線或檔案讀取失敗，略過 */ }
  }
}, 1000)

// ── Webhook Server（若 webhook-service 未啟動則自己起） ───
try {
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
          if (event.type !== 'message') continue
          const msgType = event.message?.type
          if (!['text', 'image', 'file'].includes(msgType)) continue

          const userId     = event.source?.userId ?? ''
          const text       = msgType === 'text'
            ? event.message.text ?? ''
            : msgType === 'file'
              ? `[檔案] ${event.message.fileName ?? 'unknown'}`
              : `[圖片] messageId=${event.message.id}`
          const replyToken = event.replyToken      ?? ''

          if (!userId) continue

          const allowed = access.allowlist.includes(userId)

          if (access.policy === 'open' || allowed) {
            try {
              await mcp.notification({
                method: 'notifications/claude/channel',
                params: { content: text, meta: { user_id: userId, reply_token: replyToken } },
              })
            } catch {
              // MCP 斷線時存入佇列，等下次連線再處理
              const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
              writeFileSync(join(MSG_DIR, `${id}.json`),
                JSON.stringify({ userId, text, replyToken, ts: Date.now() }, null, 2))
            }
          } else if (access.policy === 'pairing') {
            const code    = genCode()
            const expires = Date.now() + 10 * 60 * 1000
            pending.set(code, { userId, expires })
            savePendingCode(code, userId, expires)
            await lineReply(replyToken,
              textMessages(`配對碼：${code}\n\n請在 Claude Code 執行：\n/line:access pair ${code}`))
          }
        }

        return new Response('OK')
      }

      return new Response('Not Found', { status: 404 })
    },
  })
  console.error(`[line] Webhook server 啟動於 port ${PORT}`)
} catch (err: any) {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[line] Port ${PORT} 已被 webhook-service 佔用，改用佇列模式`)
  } else {
    throw err
  }
}

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
