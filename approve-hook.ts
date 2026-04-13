#!/usr/bin/env bun
/**
 * LINE 遠端授權 Hook
 *
 * Claude Code PreToolUse hook — 攔截危險操作，推送 Flex 到 LINE 等使用者確認。
 * 安全操作（讀檔、搜尋）自動放行，危險操作（shell 指令、刪檔）等 LINE 回覆。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

// ── 路徑設定 ──────────────────────────────────────────────
const CHANNEL_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude', 'channels', 'line',
)
const APPROVAL_DIR = join(CHANNEL_DIR, 'approvals')
const ENV_FILE = join(CHANNEL_DIR, '.env')

mkdirSync(APPROVAL_DIR, { recursive: true })

// ── 載入 LINE 憑證 ──────────────────────────────────────
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

// ── 載入 allowlist 取得 user ID ──────────────────────────
function getUserId(): string {
  try {
    const access = JSON.parse(readFileSync(join(CHANNEL_DIR, 'access.json'), 'utf-8'))
    return access.allowlist?.[0] ?? ''
  } catch { return '' }
}

// ── 讀取 stdin（Claude Code 傳入的 tool 資訊）─────────────
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// ── 判斷是否需要審批 ─────────────────────────────────────
// 安全的 Bash 指令（唯讀操作）→ 自動放行
const SAFE_BASH_PATTERNS = [
  /^(git\s+)?(status|log|diff|branch|show|tag|remote|stash\s+list)/i,
  /^(ls|dir|pwd|echo|cat|head|tail|wc|date|whoami|hostname|uname)/i,
  /^(node|bun|python3?|pip)\s+--version/i,
  /^(which|where|type|command\s+-v)/i,
  /^(ps|tasklist|netstat|wmic|systeminfo)/i,
  /^(cd|pushd|popd)\b/i,
]

function needsApproval(toolName: string, toolInput: any): { needed: boolean; summary: string } {
  if (toolName === 'Bash') {
    const cmd = (toolInput?.command ?? '').trim()
    if (SAFE_BASH_PATTERNS.some(p => p.test(cmd))) {
      return { needed: false, summary: '' }
    }
    return { needed: true, summary: cmd.slice(0, 200) }
  }

  if (toolName === 'Write') {
    const fp = toolInput?.file_path ?? ''
    // 敏感檔案需要審批
    if (/\.(env|key|pem|credentials|secret)/i.test(fp)) {
      return { needed: true, summary: `寫入敏感檔案: ${fp}` }
    }
    return { needed: false, summary: '' }
  }

  if (toolName === 'Edit') {
    const fp = toolInput?.file_path ?? ''
    if (/\.(env|key|pem|credentials|secret)/i.test(fp)) {
      return { needed: true, summary: `編輯敏感檔案: ${fp}` }
    }
    return { needed: false, summary: '' }
  }

  // 其他 tool → 自動放行
  return { needed: false, summary: '' }
}

// ── LINE Push ────────────────────────────────────────────
async function pushApprovalFlex(approvalId: string, toolName: string, summary: string, sessionId: string, cwd: string) {
  const userId = getUserId()
  if (!userId || !TOKEN) return

  // 從 cwd 取最後兩層路徑當作專案標籤
  const projectLabel = cwd.split(/[/\\]/).slice(-2).join('/')

  const flex = {
    type: 'flex',
    altText: `🔐 ${toolName} 授權請求`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2C3E50',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '🔐 Permission Request', size: 'md', color: '#ffffff', weight: 'bold' },
          { type: 'text', text: `📂 ${projectLabel}`, size: 'xs', color: '#95a5c6', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: `Tool: ${toolName}`, size: 'sm', color: '#555555' },
          { type: 'separator' },
          { type: 'text', text: summary || '(no details)', size: 'sm', color: '#333333', wrap: true, maxLines: 8 },
          { type: 'box', layout: 'vertical', margin: 'md', contents: [
            { type: 'text', text: `Session: ${sessionId.slice(0, 8)}`, size: 'xs', color: '#aaaaaa' },
            { type: 'text', text: `ID: ${approvalId}`, size: 'xs', color: '#aaaaaa' },
          ]},
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        contents: [
          {
            type: 'button',
            action: { type: 'postback', label: '✅ 允許', data: `action=approve&id=${approvalId}` },
            style: 'primary',
            color: '#28a745',
          },
          {
            type: 'button',
            action: { type: 'postback', label: '❌ 拒絕', data: `action=deny&id=${approvalId}` },
            style: 'primary',
            color: '#dc3545',
          },
        ],
      },
    },
  }

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: userId, messages: [flex] }),
  })
}

// ── 輪詢等待回應 ────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const TIMEOUT = 60000 // 60 秒

async function waitForApproval(approvalId: string): Promise<'approved' | 'denied' | 'timeout'> {
  const fp = join(APPROVAL_DIR, `${approvalId}.json`)
  const start = Date.now()

  while (Date.now() - start < TIMEOUT) {
    try {
      const data = JSON.parse(readFileSync(fp, 'utf-8'))
      if (data.status === 'approved') return 'approved'
      if (data.status === 'denied') return 'denied'
    } catch { /* file not ready */ }
    await sleep(1000)
  }
  return 'timeout'
}

function cleanup(approvalId: string) {
  try { unlinkSync(join(APPROVAL_DIR, `${approvalId}.json`)) } catch {}
}

// ── 主流程 ──────────────────────────────────────────────
async function main() {
  const raw = await readStdin()
  let input: any
  try { input = JSON.parse(raw) } catch { process.exit(0) } // 解析失敗 → 放行

  const toolName = input.tool_name ?? ''
  const toolInput = input.tool_input ?? {}
  const sessionId = input.session_id ?? 'unknown'
  const cwd = input.cwd ?? ''

  const { needed, summary } = needsApproval(toolName, toolInput)
  if (!needed) {
    // 自動放行
    process.exit(0)
  }

  // 建立審批請求
  const approvalId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const approvalFile = join(APPROVAL_DIR, `${approvalId}.json`)
  writeFileSync(approvalFile, JSON.stringify({
    status: 'pending',
    tool: toolName,
    summary,
    sessionId,
    cwd,
    ts: Date.now(),
  }, null, 2))

  // Push Flex 到 LINE
  await pushApprovalFlex(approvalId, toolName, summary, sessionId, cwd)

  // 等待回應
  const result = await waitForApproval(approvalId)
  cleanup(approvalId)

  if (result === 'approved') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: 'allow',
        permissionDecisionReason: 'LINE 使用者已允許',
      },
    }))
    process.exit(0)
  } else {
    const reason = result === 'timeout' ? '60 秒未回應，自動拒絕' : 'LINE 使用者拒絕'
    console.log(JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }))
    process.exit(0)
  }
}

main().catch(err => {
  console.error('[approve-hook] error:', err)
  process.exit(0) // 出錯時放行，不阻塞 Claude
})
