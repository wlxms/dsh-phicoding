#Requires -Version 5.1
<#
.SYNOPSIS
  把 phicoding 装进全局 Copilot；再跑一次就是更新。

.DESCRIPTION
  从 GitHub 拉取源码，现场构建，然后装到你的账户下：
    - 6 个技能  →  ~/.copilot/skills/<name>/SKILL.md   （VS Code 个人 Agent Skills）
    - 检查器    →  ~/.copilot/phicoding/               （Node + Roslyn 语法底座）

  同一个脚本既是安装也是更新：它会比对内容指纹，没变化就什么都不做，有变化就整份替换。
  记录写在 <目标>/.installed.json。

.EXAMPLE
  irm https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.ps1 | iex

.EXAMPLE
  .\install-copilot.ps1 -Shared      # 同时装到 ~/.agents/skills（跨 Agent 开放标准位置）

.EXAMPLE
  .\install-copilot.ps1 -Force       # 指纹相同也重装一遍

.EXAMPLE
  .\install-copilot.ps1 -Uninstall   # 卸载（不需要网络）
#>
[CmdletBinding()]
param(
    [string]$Ref = 'main',
    [string]$Destination = '',
    [switch]$Shared,
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) { Write-Host "▸ $message" }
function Write-Note($message) { Write-Host "  $message" -ForegroundColor DarkGray }

# 别用 -Home 作参数名：PowerShell 里那会和只读自动变量 $HOME 撞名。
if (-not $Destination) {
    $Destination = if ($env:COPILOT_HOME) { $env:COPILOT_HOME } else { Join-Path $env:USERPROFILE '.copilot' }
}
$manifestPath = Join-Path $Destination '.installed.json'
$checker = Join-Path $Destination 'phicoding'
$skills = Join-Path $Destination 'skills'
$sharedSkills = Join-Path $env:USERPROFILE '.agents\skills'

# ---- 卸载：不联网，只删自己装过的东西 --------------------------------------
if ($Uninstall) {
    foreach ($dir in @($skills, $sharedSkills)) {
        if (-not (Test-Path $dir)) { continue }
        Get-ChildItem $dir -Directory | Where-Object { $_.Name -like 'phicoding*' } | ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force
            Write-Note "删除 $($_.FullName)"
        }
    }
    if (Test-Path $checker) { Remove-Item $checker -Recurse -Force; Write-Note "删除 $checker" }
    if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force; Write-Note "删除 $manifestPath" }
    Write-Host '已卸载。' -ForegroundColor Green
    return
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw '没找到 node。本套件需要 Node.js >= 18：https://nodejs.org/' }

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

    # ---- 比对指纹：这一步决定了它是"安装"还是"更新"，或者什么都不用做 ----
    $incoming = Get-Content (Join-Path $kit 'VERSION.json') -Raw | ConvertFrom-Json
    $installed = if (Test-Path $manifestPath) { Get-Content $manifestPath -Raw | ConvertFrom-Json } else { $null }
    $intact = Test-Path (Join-Path $checker 'checks\phicoding.mjs')

    if ($installed -and $installed.hash -eq $incoming.hash -and $intact -and -not $Force) {
        Write-Host ''
        Write-Host "已是最新（$($incoming.hash.Substring(0, 12))，$($incoming.files) 个文件），没有改动。" -ForegroundColor Green
        Write-Host "要强制重装：.\install-copilot.ps1 -Force"
        return
    }

    if ($installed -and $installed.hash -ne $incoming.hash) {
        Write-Host "▸ 更新 $($installed.hash.Substring(0, 12)) → $($incoming.hash.Substring(0, 12))"
    }

    Write-Step "安装到 $Destination"
    New-Item -ItemType Directory -Path $skills -Force | Out-Null
    Copy-Item -Path (Join-Path $kit '.github\skills\*') -Destination $skills -Recurse -Force
    Write-Note "技能 → $skills"

    if (Test-Path $checker) { Remove-Item $checker -Recurse -Force }
    Copy-Item -Path (Join-Path $kit 'phicoding') -Destination $checker -Recurse -Force
    Write-Note "检查器 → $checker"

    # 技能正文里写的是抽象的 `phicoding --root <项目>`；这台机器上真正的路径要说清楚，
    # 否则 Copilot 会去 PATH 里找一个不存在的命令。
    # 每次安装都是先用源文件覆盖、再追加，所以反复更新不会堆出多行。
    $runner = Join-Path $checker 'checks\phicoding.mjs'
    $note = "`n> **本机安装位置**：检查器在 ``$runner``。运行：``node `"$runner`" --root <项目>``。`n"
    foreach ($name in @('phicoding', 'phicoding-check')) {
        $file = Join-Path $skills (Join-Path $name 'SKILL.md')
        if (Test-Path $file) { Add-Content -Path $file -Value $note -Encoding utf8 }
    }

    if ($Shared) {
        New-Item -ItemType Directory -Path $sharedSkills -Force | Out-Null
        Copy-Item -Path (Join-Path $kit '.github\skills\*') -Destination $sharedSkills -Recurse -Force
        Write-Note "技能 → $sharedSkills（跨 Agent 开放标准位置）"
    }

    [ordered]@{
        name           = 'phicoding-copilot'
        hash           = $incoming.hash
        packageVersion = $incoming.packageVersion
        ref            = $Ref
        skills         = $incoming.skills
        installedAt    = (Get-Date).ToUniversalTime().ToString('o')
        destination    = $Destination
    } | ConvertTo-Json -Depth 4 | Set-Content $manifestPath -Encoding utf8

    Write-Host ''
    Write-Host "装好了（$($incoming.hash.Substring(0, 12))）。" -ForegroundColor Green
    Write-Host ''
    Write-Host '  在 VS Code 的 Copilot Chat 里：'
    Write-Host '    - 直接说「按 phicoding 设计这个功能」，它会自动加载对应技能'
    Write-Host '    - 或者敲 /phicoding、/phicoding-check 显式调用'
    Write-Host ''
    Write-Host '  跑检查器：'
    Write-Host "    node `"$runner`" --root <你的项目>"
    Write-Host ''
    Write-Host '  更新：再跑一次本脚本即可（内容没变就什么都不做）'
    Write-Host '  卸载：.\install-copilot.ps1 -Uninstall'
    Write-Host ''
    Write-Host '  还需要：.NET SDK >= 8（检查器首次运行会用 Roslyn 编译语法底座，约 3 秒）'
    Write-Host '  项目侧配置不用手写：首次运行会在目标仓库自动推断 .phicoding/config.json（trunk / variants / author），不满意再改。'
}
finally {
    if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
}
