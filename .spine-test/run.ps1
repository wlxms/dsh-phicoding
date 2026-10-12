[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

dotnet run --project (Join-Path $Root 'Effects.Check\Effects.Check.csproj') -c Release -- $Root
exit $LASTEXITCODE
