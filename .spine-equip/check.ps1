[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$project = Join-Path $Root 'check\Spine.Equip.Check\Spine.Equip.Check.csproj'
$equipment = Join-Path $Root 'data\equipment.json'
$extension = Join-Path $Root 'data\extension.json'
$structure = Join-Path $Root 'check-structure.ps1'

Write-Host '== build (Release)'
& dotnet build $project -c Release --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host 'CHECK: BUILD FAILED'
    exit 1
}

Write-Host ''
& dotnet run --project $project -c Release --no-build -- $equipment $extension
$behaviour = $LASTEXITCODE

Write-Host ''
& $structure -Root $Root
$structural = $LASTEXITCODE

Write-Host ''
Write-Host '== summary'
Write-Host ('   behaviour check exit code: ' + $behaviour)
Write-Host ('   structure check exit code: ' + $structural)
if (($behaviour -eq 0) -and ($structural -eq 0)) {
    Write-Host 'CHECK: ALL PASS'
    exit 0
}
Write-Host 'CHECK: FAILED'
exit 1
