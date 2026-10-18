#Requires -Version 5.1
<#
.SYNOPSIS
  把 phicoding 一键装进全局 Copilot（个人技能 + 检查器）。

.DESCRIPTION
  从 GitHub 拉取源码，现场构建 Copilot 套件，然后把
    - 6 个技能  →  ~/.copilot/skills/<name>/SKILL.md   （VS Code 个人 Agent Skills）
    - 检查器    →  ~/.copilot/phicoding/               （Node + Roslyn 语法底座）
  装到你自己的账户下，对所有仓库生效，不碰任何项目目录。

.EXAMPLE
  irm https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.ps1 | iex

.EXAMPLE
  .\install-copilot.ps1 -Shared      # 同时装到 ~/.agents/skills（跨 Agent 开放标准位置）
#>
[CmdletBinding()]
param(
    [string]$Ref = 'main',
    [string]$Destination = '',
    [switch]$Shared
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) { Write-Host "▸ $message" }
function Write-Note($message) { Write-Host "  $message" -ForegroundColor DarkGray }

# 别用 -Home 作参数名：PowerShell 里那会和只读自动变量 $HOME 撞名。
if (-not $Destination) {
    $Destination = if ($env:COPILOT_HOME) { $env:COPILOT_HOME } else { Join-Path $env:USERPROFILE '.copilot' }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw '没找到 node。本套件需要 Node.js >= 18：https://nodejs.org/'
}

$archive = "https://codeload.github.com/wlxms/dsh-phicoding/zip/refs/heads/$Ref"
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("phicoding-install-" + [guid]::NewGuid().ToString('N').Substring(0, 8))

try {
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null

    Write-Step "下载源码（$Ref）"
    $zip = Join-Path $scratch 'source.zip'
    Invoke-WebRequest -Uri $archive -OutFile $zip -UseBasicParsing

    Write-Step '解压'
    Expand-Archive -Path $zip -DestinationPath (Join-Path $scratch 'src') -Force
    $repo = (Get-ChildItem (Join-Path $scratch 'src') -Directory | Select-Object -First 1).FullName
    if (-not $repo) { throw '压缩包里没找到仓库目录' }

    Write-Step '构建 Copilot 套件'
    $kit = Join-Path $scratch 'kit'
    $builder = Join-Path $repo 'dsh-plugins\dsh-phicoding\scripts\build-copilot-kit.mjs'
    if (-not (Test-Path $builder)) { throw "仓库里没有构建脚本：$builder" }
    & node $builder $kit
    if ($LASTEXITCODE -ne 0) { throw "构建失败（exit $LASTEXITCODE）" }

    Write-Step "安装到 $Destination"
    $skills = Join-Path $Destination 'skills'
    New-Item -ItemType Directory -Path $skills -Force | Out-Null
    Copy-Item -Path (Join-Path $kit '.github\skills\*') -Destination $skills -Recurse -Force
    Write-Note "技能 → $skills"

    $checker = Join-Path $Destination 'phicoding'
    if (Test-Path $checker) { Remove-Item $checker -Recurse -Force }
    Copy-Item -Path (Join-Path $kit 'phicoding') -Destination $checker -Recurse -Force
    Write-Note "检查器 → $checker"

    # 技能正文里写的是抽象的 `phicoding --root <项目>`；这台机器上真正的路径要说清楚，
    # 否则 Copilot 会去 PATH 里找一个不存在的命令。
    $runner = Join-Path $checker 'checks\phicoding.mjs'
    $note = "`n> **本机安装位置**：检查器在 ``$runner``。运行：``node `"$runner`" --root <项目>``。`n"
    foreach ($name in @('phicoding', 'phicoding-check')) {
        $file = Join-Path $skills (Join-Path $name 'SKILL.md')
        if (Test-Path $file) { Add-Content -Path $file -Value $note -Encoding utf8 }
    }

    if ($Shared) {
        $shared = Join-Path $env:USERPROFILE '.agents\skills'
        New-Item -ItemType Directory -Path $shared -Force | Out-Null
        Copy-Item -Path (Join-Path $kit '.github\skills\*') -Destination $shared -Recurse -Force
        Write-Note "技能 → $shared（跨 Agent 开放标准位置）"
    }

    Write-Host ''
    Write-Host '装好了。' -ForegroundColor Green
    Write-Host ''
    Write-Host '  在 VS Code 的 Copilot Chat 里：'
    Write-Host '    - 直接说「按 phicoding 设计这个功能」，它会自动加载对应技能'
    Write-Host '    - 或者敲 /phicoding、/phicoding-check 显式调用'
    Write-Host ''
    Write-Host '  跑检查器：'
    Write-Host "    node `"$runner`" --root <你的项目>"
    Write-Host ''
    Write-Host '  还需要：.NET SDK >= 8（检查器首次运行会用 Roslyn 编译语法底座，约 3 秒）'
    Write-Host '  项目侧配置：在目标仓库建 .phicoding/config.json，写明 trunk / variants / author'
}
finally {
    if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
}
