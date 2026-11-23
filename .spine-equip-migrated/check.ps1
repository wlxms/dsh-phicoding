[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$project = Join-Path $Root 'check\Spine.Equip.Check\Spine.Equip.Check.csproj'
$equipment = Join-Path $Root 'data\equipment.json'
$extension = Join-Path $Root 'data\extension.json'

Write-Host '== build (Release)'
& dotnet build $project -c Release --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host 'BEHAVIOUR: BUILD FAILED'
    exit 1
}

Write-Host ''
& dotnet run --project $project -c Release --no-build -- $equipment $extension
if ($LASTEXITCODE -ne 0) {
    Write-Host 'BEHAVIOUR: FAILED'
    exit 1
}

Write-Host ''
Write-Host 'BEHAVIOUR: ALL PASS'
exit 0
