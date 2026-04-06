# LINE Channel for Claude Code

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어

LINE Messaging API를 통해 LINE 메시지를 Claude Code 세션으로 전송하여, Claude가 LINE 메시지를 실시간으로 수신하고 답장할 수 있도록 합니다.

---

## 목차

- [요구 사항](#요구-사항)
- [사전 준비](#사전-준비)
  - [Claude Code 설치](#1-claude-code-설치)
  - [Bun 설치](#2-bun-설치)
  - [ngrok 설치](#3-ngrok-설치)
  - [LINE Bot 생성](#4-line-bot-생성)
- [설치 및 설정](#설치-및-설정)
  - [저장소 클론](#1-저장소-클론)
  - [LINE 인증 정보 저장](#2-line-인증-정보-저장)
  - [MCP Server 추가](#3-mcp-server-추가)
  - [ngrok 실행](#4-ngrok-실행)
  - [LINE Webhook 설정](#5-line-webhook-설정)
  - [Claude Code 실행](#6-claude-code-실행)
  - [LINE 계정 페어링](#7-line-계정-페어링)
- [Webhook 상시 실행 서비스 (자동 시작)](#webhook-상시-실행-서비스-자동-시작)
- [다른 사용자 추가](#다른-사용자-추가)
- [액세스 정책](#액세스-정책)
- [메시지 전송 유형](#메시지-전송-유형)
- [이미지 Google Drive 자동 백업](#이미지-google-drive-자동-백업)
- [환경 변수](#환경-변수)
- [문제 해결](#문제-해결)

---

## 요구 사항

- **OS**: Windows / macOS / Linux
- **Claude Code** v2.1.80 이상, claude.ai 계정으로 로그인（API key 불가）
- **Bun** 런타임
- **ngrok** 계정（무료 플랜 가능）
- **LINE Developers** 계정（무료）

---

## 사전 준비

### 1. Claude Code 설치

```bash
npm install -g @anthropic-ai/claude-code
```

설치 후 로그인：

```bash
claude
```

화면의 안내에 따라 claude.ai 계정으로 로그인하세요.

---

### 2. Bun 설치

**macOS / Linux：**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows（PowerShell）：**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

설치 확인：

```bash
bun --version
```

---

### 3. ngrok 설치

[https://ngrok.com](https://ngrok.com) 에서 무료 계정을 만든 후：

**macOS（Homebrew）：**

```bash
brew install ngrok
```

**Windows：**

[https://ngrok.com/download](https://ngrok.com/download) 에서 다운로드 후 압축을 풀고 PATH에 추가합니다.

**authtoken 설정**（[ngrok Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) 에서 복사）：

```bash
ngrok config add-authtoken 당신의authtoken
```

---

### 4. LINE Bot 생성

1. [LINE Developers Console](https://developers.line.biz/console/) 에 로그인
2. **Create a Provider** 클릭 후 이름 입력（예：`My Claude Bot`）
3. **Create a new channel** → **Messaging API** 선택
4. 필수 항목（Channel name, 설명, 카테고리）을 입력하고 생성

인증 정보 획득：

- **Channel Secret**：channel → **Basic settings** 탭 → `Channel secret` 복사
- **Channel Access Token**：channel → **Messaging API** 탭 → 하단의 **Issue** 클릭 → 토큰 복사

**Messaging API** 탭에서 다음 항목을 비활성화（자동 응답 방지）：
- **Auto-reply messages** → **Disabled**
- **Greeting messages** → **Disabled**

---

## 설치 및 설정

### 1. 저장소 클론

```bash
git clone https://github.com/Moksa1123/claude-channel-line
cd claude-channel-line
```

---

### 2. LINE 인증 정보 저장

인증 정보는 `~/.claude/channels/line/.env` 에 저장되며, git에는 **커밋되지 않습니다**.

**macOS / Linux：**

```bash
mkdir -p ~/.claude/channels/line
cat > ~/.claude/channels/line/.env << EOF
LINE_CHANNEL_ACCESS_TOKEN=Channel Access Token 붙여넣기
LINE_CHANNEL_SECRET=Channel Secret 붙여넣기
EOF
```

**Windows（PowerShell）：**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\channels\line"
@"
LINE_CHANNEL_ACCESS_TOKEN=Channel Access Token 붙여넣기
LINE_CHANNEL_SECRET=Channel Secret 붙여넣기
"@ | Set-Content "$env:USERPROFILE\.claude\channels\line\.env"
```

---

### 3. MCP Server 추가

**macOS / Linux：**

```bash
claude mcp add line bun "/path/to/claude-channel-line/server.ts"
```

**Windows：**

```powershell
claude mcp add line bun "C:/path/to/claude-channel-line/server.ts"
```

> 경로를 실제로 클론한 위치로 변경하세요.

확인：

```bash
claude mcp list
```

목록에 `line` 이 표시되면 성공입니다.

---

### 4. ngrok 실행

**별도의 터미널 창**에서 실행：

```bash
ngrok http 8789
```

다음과 같은 출력이 표시됩니다：

```
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:8789
```

`https://xxxx.ngrok-free.app` URL을 복사해두세요.

> **주의**：ngrok 창을 열어둬야 합니다. 닫으면 연결이 끊깁니다. 무료 플랜은 재시작할 때마다 URL이 변경되므로, LINE Console에서 Webhook URL을 다시 설정해야 합니다.

---

### 5. LINE Webhook 설정

[LINE Developers Console](https://developers.line.biz/console/) 에서 채널을 열고：

1. **Messaging API** 탭 클릭
2. **Webhook URL** 필드의 **Edit** 클릭
3. `https://xxxx.ngrok-free.app/webhook` 입력（ngrok URL로 교체）
4. **Update** 클릭
5. **Use webhook** 토글 활성화
6. **Verify** 클릭 → **Success** 표시되면 완료

---

### 6. Claude Code 실행

**새 터미널 창**에서 실행：

```bash
claude --dangerously-load-development-channels server:line
```

Claude Code가 LINE MCP server에 연결되고 메시지 수신을 시작합니다.

> **중요**：매번 `--dangerously-load-development-channels server:line` 플래그를 붙여서 실행해야 합니다. 플래그 없이 `claude` 만 실행하면 LINE 메시지를 수신하지 않습니다.

> **Windows 주의**：이 명령어는 일반 터미널（PowerShell / CMD）에서 실행하세요. Claude Code 내부에서는 실행할 수 없습니다.

---

### 7. LINE 계정 페어링

1. LINE에서 봇을 찾습니다（LINE Developers Console → Messaging API → **Bot basic ID** 에서 확인 가능）
2. 봇에게 아무 메시지나 전송（예：`안녕`）
3. 봇이 페어링 코드를 답장합니다：

   ```
   페어링 코드：A1B2C3

   Claude Code에서 실행하세요：
   /line:access pair A1B2C3
   ```

4. 페어링 코드에 해당하는 userId 확인：

   **macOS / Linux：**
   ```bash
   cat ~/.claude/channels/line/pending/A1B2C3.json
   ```

   **Windows（PowerShell）：**
   ```powershell
   Get-Content "$env:USERPROFILE\.claude\channels\line\pending\A1B2C3.json"
   ```

   출력 예시：
   ```json
   {
     "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "expires": 1234567890000
   }
   ```

5. userId를 화이트리스트에 추가（`~/.claude/channels/line/access.json` 편집）：

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

6. LINE에서 다시 메시지를 보내면 Claude가 수신하고 답장합니다！

---

## Webhook 상시 실행 서비스 (자동 시작)

기본적으로 webhook 서버는 Claude Code의 MCP 프로세스 안에서 실행됩니다. **Claude Code를 종료하면 webhook도 중단**되어 LINE에 502 오류가 반환됩니다.

`webhook-service.ts`는 독립적인 상시 실행 서비스로, Claude Code가 실행되지 않는 동안에도 webhook을 유지합니다. 수신된 메시지는 `~/.claude/channels/line/messages/`에 저장되고, Claude Code가 시작될 때 자동으로 처리됩니다.

큐 처리에는 다음과 같은 안정성 기능이 포함됩니다：
- **5초 시작 지연** — MCP 연결이 안정될 때까지 대기한 후 큐 메시지 처리를 시작
- **자동 재시도（3회）** — 전송 실패 메시지는 최대 3회 재시도 후 폐기
- **만료된 reply_token 정리** — 25초 이상 경과한 reply_token을 자동으로 제거（LINE 토큰은 30초 후 만료）

### Windows

프로젝트 디렉토리에서 설치 스크립트 실행：

```powershell
powershell -ExecutionPolicy Bypass -File "autostart\windows\install.ps1"
```

백그라운드에서 실행되는 `.vbs` 스크립트를 시작 프로그램 폴더에 생성하고 즉시 서비스를 시작합니다.

---

### macOS

```bash
chmod +x autostart/macos/install.sh
./autostart/macos/install.sh
```

launchd Launch Agent를 사용합니다. bun 경로를 자동으로 감지하고 로그인 시 자동 시작하도록 설정합니다.

서비스 중지：
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

systemd 사용자 서비스를 사용합니다. bun 경로를 자동으로 감지하고 로그인 시 자동 시작하도록 설정합니다.

로그 확인：
```bash
systemctl --user status line-webhook
journalctl --user -u line-webhook -f
```

---

## 다른 사용자 추가

다른 사람도 봇을 사용할 수 있도록 하려면：

1. 상대방에게 봇을 친구 추가하고 메시지를 보내달라고 합니다（페어링 코드가 전달됨）
2. 상대방에게 페어링 코드를 받습니다
3. `~/.claude/channels/line/pending/<코드>.json` 에서 상대방의 userId 확인
4. `access.json` 의 `allowlist` 에 추가：

```json
{
  "policy": "allowlist",
  "allowlist": [
    "U나의userId",
    "U상대방의userId"
  ]
}
```

---

## 액세스 정책

`~/.claude/channels/line/access.json` 의 `policy` 필드를 편집：

| 정책 | 동작 | 사용 시기 |
|------|------|-----------|
| `pairing` | 누구든 메시지를 보내면 페어링 코드 발송（기본값） | 초기 설정, 사용자 추가 시 |
| `allowlist` | 화이트리스트의 userId만 메시지 수신（나머지는 무시） | 일반 사용（권장） |
| `open` | 누구든 메시지 전송 가능 | 비권장 |

---

## 메시지 전송 유형

Claude는 다음 방식으로 LINE 사용자에게 답장할 수 있습니다：

| 도구 | 유형 | 설명 |
|------|------|------|
| `reply` | 텍스트 | 일반 텍스트 메시지（5,000자 초과 시 자동 분할, 최대 5개） |
| `reply_image` | 이미지 | HTTPS URL을 통해 이미지 전송 |
| `reply_flex` | Flex Message | 버튼, 링크, 이미지, 캐러셀을 지원하는 리치 카드 레이아웃（bubble / carousel） |
| `reply_mixed` | 혼합 | 한 번에 최대 5개의 다양한 유형 메시지 전송 |

> **팁**：`reply_token`은 메시지 수신 후 30초간 유효합니다. 만료 후 Claude는 자동으로 `user_id`를 사용한 푸시 모드로 전환합니다.

---

## 이미지 Google Drive 자동 백업

사용자가 LINE으로 이미지를 전송하면 `webhook-service.ts`가 자동으로 다운로드하여 Google Drive에 백업합니다. 각 이미지는 타임스탬프가 포함된 파일명（`LINE_YYYYMMDD_HHMMSS.jpg`）으로 저장되며, 사용자에게 Drive 링크가 포함된 확인 메시지가 전송됩니다.

### 설정 방법

1. **Google OAuth2 인증 정보**：인증 파일을 다음 경로에 배치：

   ```
   ~/.google_workspace_mcp/credentials/<이메일주소>.json
   ```

   파일에는 유효한 `refresh_token`, `client_id`, `client_secret`이 포함되어야 합니다.

2. **대상 폴더 설정**：`webhook-service.ts`의 `GDRIVE_FOLDER_ID` 상수를 이미지를 업로드할 Google Drive 폴더 ID로 설정합니다.

   > 폴더 ID는 Google Drive URL에서 확인할 수 있습니다：`https://drive.google.com/drive/folders/<FOLDER_ID>`

### 동작 방식

1. 사용자가 LINE 채팅에서 이미지를 전송
2. `webhook-service.ts`가 LINE Content API를 통해 이미지를 다운로드
3. 지정된 Google Drive 폴더에 이미지를 업로드
4. 사용자에게 Google Drive 파일 링크가 포함된 확인 메시지를 LINE으로 답장

---

## 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token | **필수** |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | **필수** |
| `LINE_WEBHOOK_PORT` | Webhook 서버 포트 | `8789` |
| `GDRIVE_FOLDER_ID` | 이미지 백업용 Google Drive 폴더 ID（`webhook-service.ts`에서 설정） | — |

---

## 문제 해결

**Verify에서 502 Bad Gateway 표시**

Webhook 서버가 실행되지 않은 상태입니다. 두 가지 해결 방법이 있습니다：

- **임시 방법**：`claude --dangerously-load-development-channels server:line` 으로 Claude Code를 시작하면 webhook 서버도 함께 시작됩니다.
- **영구적인 방법**：[Webhook 상시 실행 서비스](#webhook-상시-실행-서비스-자동-시작)를 설정하여 Claude Code와 독립적으로 webhook을 항상 실행합니다.

**메시지를 보내도 봇이 응답하지 않음**

- ngrok이 실행 중인지 확인
- LINE Webhook URL이 올바르고 **Use webhook** 이 활성화되어 있는지 확인
- `access.json` 의 policy와 userId가 올바른지 확인

**ngrok 재시작 시마다 URL이 변경됨**

무료 플랜은 재시작할 때마다 URL이 변경됩니다. 매번 LINE Developers Console에서 Webhook URL을 업데이트해야 합니다. 고정 URL이 필요하다면 유료 플랜을 고려하세요.

**Windows에서 토큰에 특수 문자가 포함된 경우**

토큰을 따옴표로 감싸세요：

```powershell
$env:LINE_CHANNEL_ACCESS_TOKEN="특수문자가+포함된/토큰="
```

**MCP server 시작 실패（포트 사용 중）**

상시 실행 서비스가 동작 중인 경우, `server.ts`는 포트 충돌을 자동으로 감지하고 큐 모드로 전환하므로 별도 조치가 필요하지 않습니다.

다른 포트를 사용하려면：

```bash
claude mcp remove line
claude mcp add line bun "/path/to/server.ts" -e LINE_WEBHOOK_PORT=8790
ngrok http 8790
```

---

## 라이선스

MIT
