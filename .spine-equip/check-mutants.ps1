[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

function Copy-Project([string]$from, [string]$to) {
    New-Item -ItemType Directory -Path $to -Force | Out-Null
    foreach ($item in Get-ChildItem -Path $from -Force) {
        if ($item.Name -in @('.selftest', '.review')) { continue }
        Copy-Item -Path $item.FullName -Destination $to -Recurse -Force
    }
    foreach ($path in @(Get-ChildItem -Path $to -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -in @('bin', 'obj') })) {
        Remove-Item -Path $path.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Set-Mutation([string]$file, [string]$pattern, [string]$replacement) {
    $raw = Get-Content -Path $file -Raw
    $next = [regex]::Replace($raw, $pattern, $replacement)
    if ($next -eq $raw) { return $false }
    Set-Content -Path $file -Value $next -Encoding UTF8 -NoNewline
    return $true
}

function Invoke-Check([string]$dir) {
    $project = Join-Path $dir 'check\Spine.Equip.Check\Spine.Equip.Check.csproj'
    $build = & dotnet build $project -c Release --nologo 2>&1
    if ($LASTEXITCODE -ne 0) {
        return @{ Code = -1; Output = @($build) }
    }
    $output = & dotnet run --project $project -c Release --no-build -- (Join-Path $dir 'data\equipment.json') (Join-Path $dir 'data\extension.json') 2>&1
    return @{ Code = $LASTEXITCODE; Output = @($output) }
}

$core = 'src\Spine.Equip\Core'
$mutants = @(
    @{ Name = 'no-unequip'; What = 'Equip no longer clears the occupied slot'
       File = "$core\Character.cs"; Pattern = 'Clear\(slot\);\s*worn\[slot\] = item;'; Replacement = 'worn[slot] = item;' }
    @{ Name = 'no-reset'; What = 'Rebuild no longer resets the ledger, so contributions leak'
       File = "$core\Character.cs"; Pattern = 'Stats\.Reset\(basis\);\s*'; Replacement = '' }
    @{ Name = 'set-threshold'; What = 'set activates only above its threshold'
       File = "$core\Character.cs"; Pattern = 'Count\(set\) >= set\.Pieces'; Replacement = 'Count(set) > set.Pieces' }
    @{ Name = 'no-unload'; What = 'scene unload releases nothing'
       File = "$core\Scene.cs"; Pattern = 'foreach \(var character in characters\) character\.Release\(\);'; Replacement = '' }
    @{ Name = 'no-requirement'; What = 'Equip ignores requirements'
       File = "$core\Character.cs"; Pattern = 'if \(!requirement\.Met\(wearer\)\) return false;'; Replacement = 'if (!requirement.Met(wearer)) continue;' }
    @{ Name = 'no-single-wearer'; What = 'an item already worn elsewhere can be worn again'
       File = "$core\Character.cs"; Pattern = 'if \(item\.Held\) return false;\s*'; Replacement = '' }
)

$control = @{ Name = 'build-break'; What = 'a mutant that does not compile must be scored as not caught'
              File = "$core\Item.cs"; Pattern = 'public void Destroy\(\)'; Replacement = 'public void Destroy(' }

$work = Join-Path $Root '.selftest'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null

Write-Host '== behaviour mutant check'
Write-Host ('   root: ' + $Root)
Write-Host ''

$wrong = 0

$baselineDir = Join-Path $work 'baseline'
Copy-Project -from $Root -to $baselineDir
$baseline = Invoke-Check $baselineDir
$baselineLine = @($baseline.Output | Select-String 'checks run' | Select-Object -First 1)
$baselineOk = ($baseline.Code -eq 0) -and (@($baseline.Output | Select-String 'RESULT: ALL PASS').Count -eq 1)
$mark = 'FAIL'
if ($baselineOk) { $mark = 'PASS' }
if (-not $baselineOk) { $wrong++ }
Write-Host ('  {0}  {1,-16} clean copy is green [{2}]' -f $mark, 'baseline', [string]$baselineLine)
Remove-Item $baselineDir -Recurse -Force

foreach ($mutant in $mutants) {
    $dir = Join-Path $work $mutant.Name
    Copy-Project -from $Root -to $dir
    $applied = Set-Mutation (Join-Path $dir $mutant.File) $mutant.Pattern $mutant.Replacement
    if (-not $applied) {
        Write-Host ('  FAIL  {0,-16} mutation did not apply: {1}' -f $mutant.Name, $mutant.Pattern)
        $wrong++
        Remove-Item $dir -Recurse -Force
        continue
    }
    $run = Invoke-Check $dir
    $red = @($run.Output | Select-String 'FAIL' | Select-Object -First 2)
    $caught = ($run.Code -eq 1) -and ($red.Count -gt 0)
    $mark = 'FAIL'
    if ($caught) { $mark = 'RED ' }
    if (-not $caught) { $wrong++ }
    Write-Host ('  {0}  {1,-16} {2}' -f $mark, $mutant.Name, $mutant.What)
    if ($caught) {
        foreach ($line in $red) { Write-Host ('        first red: ' + $line.ToString().Trim()) }
    }
    if ($run.Code -eq -1) { Write-Host '        the mutant did not compile, so nothing was proved' }
    if (($run.Code -ne -1) -and ($red.Count -eq 0)) { Write-Host '        the behaviour check stayed green on a broken core' }
    Remove-Item $dir -Recurse -Force
}

$controlDir = Join-Path $work $control.Name
Copy-Project -from $Root -to $controlDir
Set-Mutation (Join-Path $controlDir $control.File) $control.Pattern $control.Replacement | Out-Null
$controlRun = Invoke-Check $controlDir
$controlOk = $controlRun.Code -eq -1
$mark = 'FAIL'
if ($controlOk) { $mark = 'PASS' }
if (-not $controlOk) { $wrong++ }
Write-Host ('  {0}  {1,-16} {2}' -f $mark, 'build-break', $control.What)
Remove-Item $controlDir -Recurse -Force

Remove-Item $work -Recurse -Force
Write-Host ''
if ($wrong -eq 0) {
    Write-Host 'MUTANTS: every broken core was caught with a red check, clean core is green'
    exit 0
}
Write-Host ('MUTANTS: ' + $wrong + ' mutants were not caught')
exit 1
