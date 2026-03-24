# LINE Webhook Service - Windows 安裝腳本
# 在開機啟動資料夾建立 VBScript，登入後自動在背景啟動

$BunPath = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $BunPath) {
    Write-Error "❌ 找不到 bun，請先安裝：powershell -c `"irm bun.sh/install.ps1 | iex`""
    exit 1
}

$ScriptDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ServiceTs = Join-Path $ScriptDir "webhook-service.ts"
$StartupDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$VbsPath = Join-Path $StartupDir "line-webhook.vbs"

Write-Host "bun 路徑：$BunPath"
Write-Host "服務腳本：$ServiceTs"

$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """$BunPath"" ""$ServiceTs""", 0, False
"@

Set-Content -Path $VbsPath -Value $vbsContent -Encoding UTF8

# 立刻啟動（不用等重開機）
$wsh = New-Object -ComObject WScript.Shell
$wsh.Run("""$VbsPath""")

Write-Host "✅ LINE Webhook Service 已啟動並設定為開機自動執行"
Write-Host "   啟動腳本位置：$VbsPath"
Write-Host "   停止服務：在工作管理員結束 bun.exe 程序"
Write-Host "   移除自動啟動：刪除 $VbsPath"
