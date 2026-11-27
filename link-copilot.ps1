#Requires -Version 5.1
<#
.SYNOPSIS
  把全局 Copilot 安装切换成指向当前仓库的目录软链（Windows 用 junction）。

.DESCRIPTION
  安装脚本 install-copilot.ps1 是“构建后复制”的快照；开发时希望 Copilot
  立刻看到当前工作区的技能与检查器，就用本脚本做链接：

    ~/.copilot/skills/<name>  ->  <repo>/dsh-plugins/dsh-phicoding/skills/<name>
    ~/.copilot/phicoding      ->  <repo>/dsh-plugins/dsh-phicoding

  Windows 创建符号链接通常需要管理员权限；这里用 junction（目录重解析点），
  效果是同一份目录的实时链接，不需要管理员。已有的真实安装会先移到
  ~/.copilot/backup-before-link-<时间>/，可手工回滚。

.EXAMPLE
  .\link-copilot.ps1

.EXAMPLE
  .\link-copilot.ps1 -Unlink      # 只解除链接；真实目录不动
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = $PSScriptRoot,
    [string]$CopilotHome = '',
    [switch]$Unlink
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) { Write-Host "▸ $message" }
function Write-Note($message) { Write-Host "  $message" -ForegroundColor DarkGray }

if (-not $CopilotHome) {
    $CopilotHome = if ($env:COPILOT_HOME) { $env:COPILOT_HOME } else { Join-Path $HOME '.copilot' }
}

$plugin = Join-Path $RepoRoot 'dsh-plugins\dsh-phicoding'
$skillsSource = Join-Path $plugin 'skills'
$skillsTarget = Join-Path $CopilotHome 'skills'
$checkerTarget = Join-Path $CopilotHome 'phicoding'
$manifestPath = Join-Path $CopilotHome '.installed.json'
$userInstruction = Join-Path $CopilotHome 'copilot-instructions.md'
$onWindows = $env:OS -eq 'Windows_NT'

if (-not (Test-Path $plugin)) { throw "找不到插件目录：$plugin" }
if (-not (Test-Path $skillsSource)) { throw "找不到技能目录：$skillsSource" }

function Remove-LinkOrDir($path) {
    if (-not (Test-Path $path)) { return $false }
    $item = Get-Item $path -Force
    if (-not $item.LinkType) { return $false }
    if ($onWindows) {
        & cmd /c rmdir "$path" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "解除链接失败：$path" }
    } else {
        Remove-Item $path -Force
    }
    return $true
}

function New-DirectoryLink($link, $target) {
    if (Test-Path $link) { throw "链接目标已存在：$link" }
    if ($onWindows) {
        & cmd /c mklink /J "$link" "$target" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "创建 junction 失败：$link -> $target" }
    } else {
        New-Item -ItemType SymbolicLink -Path $link -Target $target | Out-Null
    }
}

$backup = Join-Path $CopilotHome ('backup-before-link-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backedUp = $false

function Backup-RealEntry($path, $name) {
    if (-not (Test-Path $path)) { return }
    $item = Get-Item $path -Force
    if ($item.LinkType) { return }
    if (-not $backedUp) {
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $script:backedUp = $true
    }
    $destination = Join-Path $backup $name
    Move-Item -Path $path -Destination $destination
    Write-Note "备份 $path -> $destination"
}

$names = @(Get-ChildItem $skillsSource -Directory | Select-Object -ExpandProperty Name)

if ($Unlink) {
    foreach ($name in $names) {
        $link = Join-Path $skillsTarget $name
        if (Remove-LinkOrDir $link) { Write-Note "解除 $link" }
    }
    if (Remove-LinkOrDir $checkerTarget) { Write-Note "解除 $checkerTarget" }
    if (Test-Path $userInstruction) {
        $text = Get-Content $userInstruction -Raw
        $next = [regex]::Replace($text, '(?s)<!-- phicoding:start -->.*?<!-- phicoding:end -->', '').Trim()
        if ($next) { Set-Content $userInstruction $next -Encoding utf8 }
        else { Remove-Item $userInstruction -Force }
        Write-Note "移除用户级 instruction 块 $userInstruction"
    }
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.mode -eq 'link') {
            Remove-Item $manifestPath -Force
            Write-Note "删除 link manifest $manifestPath"
        }
    }
    Write-Host '已解除软链；真实目录与备份都没有动。' -ForegroundColor Green
    return
}

New-Item -ItemType Directory -Path $skillsTarget -Force | Out-Null

foreach ($name in $names) {
    $source = Join-Path $skillsSource $name
    $link = Join-Path $skillsTarget $name
    if (Test-Path $link) {
        $item = Get-Item $link -Force
        if ($item.LinkType) { Remove-LinkOrDir $link | Out-Null }
        else { Backup-RealEntry $link $name }
    }
    New-DirectoryLink $link $source
    Write-Note "技能 $name -> $source"
}

if (Test-Path $checkerTarget) {
    $item = Get-Item $checkerTarget -Force
    if ($item.LinkType) { Remove-LinkOrDir $checkerTarget | Out-Null }
    else { Backup-RealEntry $checkerTarget 'phicoding' }
}
New-DirectoryLink $checkerTarget $plugin
Write-Note "检查器 -> $plugin"

$runner = Join-Path $checkerTarget 'checks\phicoding.mjs'
$instructionHelper = Join-Path $plugin 'scripts\copilot-kit\copilot-instruction.mjs'
$instructionTemplate = Join-Path $plugin 'scripts\copilot-kit\copilot-instructions.user.md'
if (-not (Test-Path $instructionHelper) -or -not (Test-Path $instructionTemplate)) {
    throw '找不到用户级 instruction 模板或合并脚本。'
}
& node $instructionHelper $instructionTemplate $userInstruction $skillsTarget $runner
if ($LASTEXITCODE -ne 0) { throw "写入用户级 instruction 失败（exit $LASTEXITCODE）" }
Write-Note "用户级 instruction -> $userInstruction"

if (Test-Path $manifestPath) {
    if (-not $backedUp) {
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $backedUp = $true
    }
    Copy-Item $manifestPath (Join-Path $backup '.installed.json') -Force
}

[ordered]@{
    name        = 'phicoding-copilot'
    mode        = 'link'
    target      = $plugin
    skills      = $names
    linkedAt    = (Get-Date).ToUniversalTime().ToString('o')
    backup      = $(if ($backedUp) { $backup } else { $null })
    destination = $CopilotHome
    instruction = $userInstruction
} | ConvertTo-Json -Depth 4 | Set-Content $manifestPath -Encoding utf8

Write-Host ''
Write-Host "Copilot 已链接到当前工作区：$plugin" -ForegroundColor Green
Write-Host '现在改仓库里的技能 / 规则，Copilot 会直接看到。'
Write-Host '注意：不要直接重跑 install-copilot.ps1；它的更新会尝试覆盖安装。'
Write-Host ("还原：.\link-copilot.ps1 -Unlink（真实安装的备份在 " + $backup + "）")
