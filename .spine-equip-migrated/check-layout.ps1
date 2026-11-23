[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$checker = Join-Path $Root '..\dsh-plugins\dsh-phicoding\checks\phicoding.mjs'
if (-not (Test-Path $checker)) {
    Write-Host 'LAYOUT: 找不到仓库里的 phicoding 检查器；请在仓库内运行本脚本。'
    exit 2
}

Write-Host '== interface-module rules 0900–0930'
& node $checker --root $Root --only 09
exit $LASTEXITCODE
