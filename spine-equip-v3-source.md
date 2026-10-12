# Spine.Equip v3 - 全部源码

共 33 个文件 / 98031 字节。

## 文件清单

| 相对路径 | 字节 |
| --- | --- |
| .gitignore | 10 |
| check-mutants.ps1 | 5547 |
| check-structure.ps1 | 19050 |
| check.ps1 | 958 |
| check/Spine.Equip.Check/Extension.cs | 593 |
| check/Spine.Equip.Check/Harness.cs | 1366 |
| check/Spine.Equip.Check/Program.cs | 21717 |
| check/Spine.Equip.Check/Spine.Equip.Check.csproj | 505 |
| data/equipment.json | 2113 |
| data/extension.json | 831 |
| README.md | 5097 |
| REPORT.md | 16890 |
| src/Spine.Equip/Core/Character.cs | 3909 |
| src/Spine.Equip/Core/Item.cs | 688 |
| src/Spine.Equip/Core/ItemKind.cs | 59 |
| src/Spine.Equip/Core/Job.cs | 54 |
| src/Spine.Equip/Core/Mod.cs | 267 |
| src/Spine.Equip/Core/Requirement.cs | 294 |
| src/Spine.Equip/Core/Scene.cs | 351 |
| src/Spine.Equip/Core/Set.cs | 239 |
| src/Spine.Equip/Core/Slot.cs | 102 |
| src/Spine.Equip/Core/Stat.cs | 55 |
| src/Spine.Equip/Core/Stats.cs | 1158 |
| src/Spine.Equip/Load/Catalogue.cs | 1452 |
| src/Spine.Equip/Load/Loader.cs | 11370 |
| src/Spine.Equip/Load/Registry.cs | 535 |
| src/Spine.Equip/Load/World.cs | 1123 |
| src/Spine.Equip/Spine.Equip.csproj | 354 |
| src/Spine.Equip/Variants/Jobs.cs | 98 |
| src/Spine.Equip/Variants/Kinds.cs | 200 |
| src/Spine.Equip/Variants/Requirements.cs | 450 |
| src/Spine.Equip/Variants/Slots.cs | 494 |
| src/Spine.Equip/Variants/Stats.cs | 102 |

## .gitignore

````text
bin/
obj/
````

## check-mutants.ps1

````powershell
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
````

## check-structure.ps1

````powershell
[CmdletBinding()]
param(
    [string]$Root = $PSScriptRoot,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

$script:parts = @{}

function Get-SourceFiles([string]$dir) {
    if (-not (Test-Path $dir)) { return @() }
    return @(Get-ChildItem -Path $dir -Recurse -Filter *.cs -File | Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' })
}

function Get-Parts([string]$path) {
    if ($script:parts.ContainsKey($path)) { return $script:parts[$path] }
    $text = Get-Content -Path $path -Raw
    $code = New-Object System.Text.StringBuilder
    $bare = New-Object System.Text.StringBuilder
    $comments = New-Object System.Collections.Generic.List[string]
    $i = 0
    $n = $text.Length
    while ($i -lt $n) {
        $ch = $text[$i]
        if ($ch -eq '"') {
            $verbatim = ($i -gt 0) -and ($text[$i - 1] -eq '@')
            [void]$code.Append($ch)
            [void]$bare.Append($ch)
            $i++
            while ($i -lt $n) {
                $c = $text[$i]
                [void]$code.Append($c)
                if ($c -eq '"') {
                    if ($verbatim -and ($i + 1 -lt $n) -and ($text[$i + 1] -eq '"')) {
                        [void]$code.Append('"')
                        $i += 2
                        continue
                    }
                    $i++
                    break
                }
                if ((-not $verbatim) -and ($c -eq '\') -and ($i + 1 -lt $n)) {
                    [void]$code.Append($text[$i + 1])
                    $i += 2
                    continue
                }
                $i++
            }
            [void]$bare.Append('"')
            continue
        }
        if (($ch -eq '/') -and ($i + 1 -lt $n) -and ($text[$i + 1] -eq '/')) {
            $end = $text.IndexOf("`n", $i)
            if ($end -lt 0) { $end = $n }
            $comments.Add($text.Substring($i, $end - $i))
            $i = $end
            continue
        }
        if (($ch -eq '/') -and ($i + 1 -lt $n) -and ($text[$i + 1] -eq '*')) {
            $end = $text.IndexOf('*/', $i + 2)
            if ($end -lt 0) { $end = $n - 2 }
            $comments.Add($text.Substring($i, $end + 2 - $i))
            $i = $end + 2
            continue
        }
        [void]$code.Append($ch)
        [void]$bare.Append($ch)
        $i++
    }
    $result = @{ Code = $code.ToString(); Bare = $bare.ToString(); Comments = @($comments) }
    $script:parts[$path] = $result
    return $result
}

function Get-RegistryNames($files) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
        $code = (Get-Parts $file.FullName).Code
        foreach ($line in ($code -split "`n")) {
            if ($line -notmatch 'public\s+Registry<') { continue }
            $m = [regex]::Match($line, '(?<name>\w+)\s*\{\s*get')
            if ($m.Success) { $names.Add($m.Groups['name'].Value) }
        }
    }
    return @($names | Sort-Object -Unique)
}

function Get-Registrations($files, $receivers) {
    $names = New-Object System.Collections.Generic.List[string]
    $types = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
        $code = (Get-Parts $file.FullName).Code
        foreach ($call in [regex]::Matches($code, '(?<recv>\w+)\.Add\(')) {
            if ($receivers -notcontains $call.Groups['recv'].Value) { continue }
            $hit = $call.Index
            $depth = 0
            $i = $hit + $call.Length - 1
            while ($i -lt $code.Length) {
                $c = $code[$i]
                if ($c -eq '(') { $depth++ }
                if ($c -eq ')') {
                    $depth--
                    if ($depth -eq 0) { break }
                }
                $i++
            }
            $statement = $code.Substring($hit, $i - $hit + 1)
            $name = [regex]::Match($statement, '"([^"]+)"')
            $made = [regex]::Matches($statement, '\bnew\s+([A-Z]\w*)')
            if ($name.Success -and ($made.Count -gt 0)) {
                $names.Add($name.Groups[1].Value)
                foreach ($m in $made) { $types.Add($m.Groups[1].Value) }
            }
        }
    }
    return @{ Names = @($names | Sort-Object -Unique); Types = @($types | Sort-Object -Unique) }
}

function Get-DataNames([string]$root) {
    $names = New-Object System.Collections.Generic.List[string]
    $data = Join-Path $root 'data'
    if (-not (Test-Path $data)) { return @() }
    foreach ($file in Get-ChildItem -Path $data -Filter *.json -File) {
        foreach ($m in [regex]::Matches((Get-Content -Path $file.FullName -Raw), ':\s*"(?<value>[^"]*)"')) {
            $names.Add($m.Groups['value'].Value)
        }
    }
    return @($names | Sort-Object -Unique)
}

function Get-ConcreteVariants($files) {
    $variants = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
        $code = (Get-Parts $file.FullName).Code
        foreach ($m in [regex]::Matches($code, '(?m)^\s*(?:public|internal|protected)\s+(?:sealed\s+|static\s+|partial\s+)*class\s+(?<name>\w+)\s*:\s*(?<base>[\w.]+)')) {
            $base = $m.Groups['base'].Value
            if ($base -in @('Slot', 'ItemKind', 'Stat', 'Job', 'Requirement') -or $base -match '^\w+\.Kind$') {
                $variants.Add($m.Groups['name'].Value)
            }
        }
    }
    return @($variants | Sort-Object -Unique)
}

function Get-Graph($files) {
    $nodes = @{}
    foreach ($file in $files) {
        $code = (Get-Parts $file.FullName).Bare
        $types = @()
        foreach ($m in [regex]::Matches($code, '(?m)^(?:public |internal |sealed |abstract |static |readonly |partial )*(?:class|struct|interface)\s+(?<name>\w+)')) {
            $types += $m.Groups['name'].Value
        }
        $nodes[$file.FullName] = @{ Code = $code; Types = $types }
    }
    $graph = @{}
    foreach ($a in $nodes.Keys) {
        $edges = @()
        foreach ($b in $nodes.Keys) {
            if ($a -eq $b) { continue }
            foreach ($type in $nodes[$b].Types) {
                if ($nodes[$a].Code -match ('\b' + [regex]::Escape($type) + '\b')) {
                    $edges += $b
                    break
                }
            }
        }
        $graph[$a] = @($edges)
    }
    return $graph
}

function Visit-Node($graph, [string]$node, $state, $path) {
    $mark = 0
    if ($state.ContainsKey($node)) { $mark = $state[$node] }
    if ($mark -eq 2) { return $null }
    if ($mark -eq 1) {
        $at = $path.IndexOf($node)
        $loop = @()
        for ($i = $at; $i -lt $path.Count; $i++) { $loop += (Split-Path $path[$i] -Leaf) }
        $loop += (Split-Path $node -Leaf)
        return ($loop -join ' -> ')
    }
    $state[$node] = 1
    $path.Add($node)
    foreach ($next in @($graph[$node])) {
        if (-not $graph.ContainsKey($next)) { continue }
        $cycle = Visit-Node $graph $next $state $path
        if ($cycle) { return $cycle }
    }
    $path.RemoveAt($path.Count - 1)
    $state[$node] = 2
    return $null
}

function Find-Cycle($graph) {
    $state = @{}
    $path = New-Object System.Collections.Generic.List[string]
    foreach ($node in @($graph.Keys)) {
        $cycle = Visit-Node $graph $node $state $path
        if ($cycle) { return $cycle }
    }
    return $null
}

function New-Result([string]$name, [bool]$ok, [string]$detail) {
    return [pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail }
}

function Test-Structure([string]$root) {
    $results = New-Object System.Collections.Generic.List[object]
    $files = @(Get-SourceFiles (Join-Path $root 'src')) + @(Get-SourceFiles (Join-Path $root 'check'))
    if ($files.Count -eq 0) {
        $results.Add((New-Result 'source tree exists' $false "no .cs files under $root"))
        return $results
    }
    $coreFiles = @(Get-SourceFiles (Join-Path $root 'src\Spine.Equip\Core'))

    foreach ($rule in @(
        @{ Name = 'no else in any C# file'; Pattern = '\belse\b' },
        @{ Name = 'no switch in any C# file'; Pattern = '\bswitch\b' },
        @{ Name = 'no enum in any C# file'; Pattern = '\benum\b' },
        @{ Name = 'no filler naming (Manager/Service/Helper/Util/Impl)'; Pattern = '\b[A-Za-z_]\w*(Manager|Service|Helper|Util|Impl)\w*\b' }
    )) {
        $hits = @()
        foreach ($file in $files) {
            if ((Get-Parts $file.FullName).Bare -match $rule.Pattern) { $hits += (Split-Path $file.FullName -Leaf) }
        }
        $detail = ''
        if ($hits.Count -gt 0) { $detail = ($hits -join ', ') + ' matches ' + $rule.Pattern }
        $results.Add((New-Result $rule.Name ($hits.Count -eq 0) $detail))
    }

    $badComments = @()
    foreach ($file in $files) {
        foreach ($comment in (Get-Parts $file.FullName).Comments) {
            $m = [regex]::Match($comment, '^//\s*(?<who>\S+)\s+-\s+(?<date>\d{4}-\d{2}-\d{2})\s*:\s*(?<why>\S.*)$')
            if (-not $m.Success) {
                $badComments += (Split-Path $file.FullName -Leaf) + ' ' + $comment
                continue
            }
            if ($m.Groups['who'].Value -ne $env:USERNAME) {
                $badComments += (Split-Path $file.FullName -Leaf) + ' author is ' + $m.Groups['who'].Value
            }
        }
    }
    $detail = ''
    if ($badComments.Count -gt 0) { $detail = ($badComments | Select-Object -First 3) -join '; ' }
    $results.Add((New-Result 'comments are trace comments with the real author' ($badComments.Count -eq 0) $detail))

    $registrations = Get-Registrations $files (Get-RegistryNames $files)
    $names = Get-DataNames $root
    $guard = ($names.Count -ge 10) -and ($registrations.Names.Count -ge 10) -and ($registrations.Types.Count -ge 5)
    $results.Add((New-Result 'name list is derived from data and factory (not hand written)' $guard (
        'data names ' + $names.Count + ', factory names ' + $registrations.Names.Count + ', factory types ' + $registrations.Types.Count)))

    $nameHits = @()
    foreach ($file in $coreFiles) {
        $code = (Get-Parts $file.FullName).Code
        foreach ($name in $names) {
            if ($code -match ('"' + [regex]::Escape($name) + '"')) { $nameHits += (Split-Path $file.FullName -Leaf) + ' contains "' + $name + '"' }
        }
    }
    if ($names.Count -eq 0) { $nameHits += 'no data names to check' }
    $detail = ''
    if ($nameHits.Count -gt 0) { $detail = ($nameHits | Select-Object -First 3) -join '; ' }
    $results.Add((New-Result 'core contains no data name' ($nameHits.Count -eq 0) $detail))

    $variantHits = @()
    foreach ($file in $coreFiles) {
        $code = (Get-Parts $file.FullName).Code
        foreach ($type in $registrations.Types) {
            if ($code -match ('\b' + [regex]::Escape($type) + '\b')) { $variantHits += (Split-Path $file.FullName -Leaf) + ' references ' + $type }
        }
    }
    $detail = ''
    if ($variantHits.Count -gt 0) { $detail = ($variantHits | Select-Object -First 3) -join '; ' }
    $results.Add((New-Result 'core contains no variant type' ($variantHits.Count -eq 0) $detail))

    $staticHits = @()
    foreach ($file in $coreFiles) {
        if ((Get-Parts $file.FullName).Bare -match '\bstatic\b') { $staticHits += (Split-Path $file.FullName -Leaf) }
    }
    $results.Add((New-Result 'core has no static member (no process wide state)' ($staticHits.Count -eq 0) ($staticHits -join ', ')))

    $stringHits = @()
    foreach ($file in $coreFiles) {
        if ((Get-Parts $file.FullName).Code.Contains('"')) { $stringHits += (Split-Path $file.FullName -Leaf) }
    }
    $results.Add((New-Result 'core has no string literal at all' ($stringHits.Count -eq 0) ($stringHits -join ', ')))

    $variants = Get-ConcreteVariants $files
    $unregistered = @($variants | Where-Object { $_ -notin $registrations.Types })
    $detail = ''
    if ($unregistered.Count -gt 0) { $detail = 'defined but never registered: ' + ($unregistered -join ', ') }
    $results.Add((New-Result 'every concrete variant type is registered in some factory' ($unregistered.Count -eq 0) $detail))

    $cycle = Find-Cycle (Get-Graph $files)
    $results.Add((New-Result 'dependency graph has no cycle' ($null -eq $cycle) ([string]$cycle)))

    return $results
}

function Copy-Tree([string]$from, [string]$to) {
    New-Item -ItemType Directory -Path $to -Force | Out-Null
    foreach ($part in @('src', 'data', 'check')) {
        $source = Join-Path $from $part
        if (-not (Test-Path $source)) { continue }
        Copy-Item -Path $source -Destination $to -Recurse -Force
    }
    foreach ($path in @(Get-ChildItem -Path $to -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -in @('bin', 'obj') })) {
        Remove-Item -Path $path.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Replace-Text([string]$file, [string]$from, [string]$to) {
    $raw = Get-Content -Path $file -Raw
    Set-Content -Path $file -Value $raw.Replace($from, $to) -Encoding UTF8 -NoNewline
}

function Invoke-SelfTest([string]$root) {
    Write-Host ''
    Write-Host '== structure check self test (each counterexample must turn the named check red)'
    $work = Join-Path $root '.selftest'
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    $core = 'src\Spine.Equip\Core'
    $variants = 'src\Spine.Equip\Variants'
    $cases = @(
        @{ Name = 'else'; Expect = 'no else in any C# file'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        if (probe) return; else return;' } }
        @{ Name = 'else-after-string'; Expect = 'no else in any C# file'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        if (probe) return "http://x - 2020-01-01 : y"; else return "z";' } }
        @{ Name = 'switch'; Expect = 'no switch in any C# file'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        switch (probe) { }' } }
        @{ Name = 'enum'; Expect = 'no enum in any C# file'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value 'public enum Probe { A }' } }
        @{ Name = 'filler'; Expect = 'no filler naming (Manager/Service/Helper/Util/Impl)'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value 'public sealed class ProbeHelper { }' } }
        @{ Name = 'comment'; Expect = 'comments are trace comments with the real author'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '// probe' } }
        @{ Name = 'author'; Expect = 'comments are trace comments with the real author'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '// nobody - 2020-01-01 : probe' } }
        @{ Name = 'name'; Expect = 'core contains no data name'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        private readonly string probe = "sword";' } }
        @{ Name = 'variant'; Expect = 'core contains no variant type'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        private Sword probe;' } }
        @{ Name = 'variant-reformatted'; Expect = 'core contains no variant type'; Apply = {
            param($d)
            Replace-Text (Join-Path $d 'src\Spine.Equip\Load\Catalogue.cs') 'catalogue.Kinds.Add("sword", new Sword());' "catalogue.Kinds.Add(`n            `"sword`",`n            new Sword());"
            Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        private Sword probe;'
        } }
        @{ Name = 'static'; Expect = 'core has no static member (no process wide state)'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        private static int probe;' } }
        @{ Name = 'string'; Expect = 'core has no string literal at all'; Apply = { param($d) Add-Content -Path (Join-Path $d "$core\Character.cs") -Value '        private readonly string probe = "probe";' } }
        @{ Name = 'unregistered'; Expect = 'every concrete variant type is registered in some factory'; Apply = { param($d) Replace-Text (Join-Path $d 'src\Spine.Equip\Load\Catalogue.cs') 'catalogue.Kinds.Add("sword", new Sword());' '' } }
        @{ Name = 'unregistered2'; Expect = 'every concrete variant type is registered in some factory'; Apply = { param($d) Add-Content -Path (Join-Path $d "$variants\Slots.cs") -Value 'internal sealed class ProbeSlot : Slot
{
    public override bool Takes(ItemKind kind) => false;
}' } }
        @{ Name = 'unregistered3'; Expect = 'every concrete variant type is registered in some factory'; Apply = { param($d) Add-Content -Path (Join-Path $d "$variants\Slots.cs") -Value 'public sealed class ProbeHolder
{
    internal sealed class Hidden : Weapon.Kind
    {
    }
}' } }
        @{ Name = 'nodata'; Expect = 'name list is derived from data and factory (not hand written)'; Apply = { param($d) Remove-Item (Join-Path $d 'data') -Recurse -Force } }
        @{ Name = 'cycle'; Expect = 'dependency graph has no cycle'; Apply = {
            param($d)
            $replacement = @"
public abstract class Stat
{
    private Character probe;
}

public abstract class StatBase
"@
            Replace-Text (Join-Path $d "$core\Stat.cs") 'public abstract class Stat' $replacement
        } }
    )

    $wrong = 0
    foreach ($case in $cases) {
        $dir = Join-Path $work $case.Name
        Copy-Tree -from $root -to $dir
        & $case.Apply $dir
        $results = Test-Structure -Root $dir
        $hit = @($results | Where-Object { ($_.Name -eq $case.Expect) -and (-not $_.Ok) })
        $mark = 'FAIL'
        if ($hit.Count -eq 1) { $mark = 'RED ' }
        if ($hit.Count -ne 1) { $wrong++ }
        Write-Host ('  {0}  {1,-19} -> {2}' -f $mark, $case.Name, $case.Expect)
        Remove-Item $dir -Recurse -Force
    }
    Remove-Item $work -Recurse -Force
    $baseline = @(Test-Structure -Root $root | Where-Object { -not $_.Ok })
    $mark = 'FAIL'
    if ($baseline.Count -eq 0) { $mark = 'PASS' }
    if ($baseline.Count -gt 0) { $wrong++ }
    Write-Host ('  {0}  {1,-19} -> clean tree stays green' -f $mark, 'baseline')
    Write-Host ''
    if ($wrong -eq 0) {
        Write-Host 'SELF TEST: all counterexamples caught, clean tree green'
        return 0
    }
    Write-Host ('SELF TEST: ' + $wrong + ' counterexamples were not caught')
    return 1
}

Write-Host '== spine structure check'
Write-Host ('   root: ' + $Root)
$failed = 0
foreach ($result in (Test-Structure -Root $Root)) {
    $mark = 'FAIL'
    if ($result.Ok) { $mark = 'PASS' }
    if (-not $result.Ok) { $failed++ }
    Write-Host ('  {0}  {1}' -f $mark, $result.Name)
    if (-not $result.Ok -and $result.Detail) { Write-Host ('        ' + $result.Detail) }
}
Write-Host ''
Write-Host ('checks failed: ' + $failed)

$selfTestFailed = 0
if ($SelfTest) { $selfTestFailed = Invoke-SelfTest -root $Root }

if (($failed -eq 0) -and ($selfTestFailed -eq 0)) {
    Write-Host 'RESULT: ALL PASS'
    exit 0
}
Write-Host 'RESULT: FAILED'
exit 1
````

## check.ps1

````powershell
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
````

## check/Spine.Equip.Check/Extension.cs

````csharp
using Spine.Equip;

namespace Check;

public sealed class OffHand : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Wand : OffHand.Kind
{
}

public sealed class Relic : Slot
{
    public override bool Takes(ItemKind kind) => kind is Trinket.Kind;
}

public sealed class Focus : Stat
{
}

public sealed class MaxLevel : Requirement
{
    private readonly int level;

    public MaxLevel(int level) => this.level = level;

    public override bool Met(Wearer wearer) => wearer.Level <= level;
}
````

## check/Spine.Equip.Check/Harness.cs

````csharp
namespace Check;

internal static class Harness
{
    private static int total;
    private static int failures;

    public static void Section(string title)
    {
        Console.WriteLine();
        Console.WriteLine("== " + title);
    }

    public static void Note(string message) => Console.WriteLine("     " + message);

    public static void Check(string what, bool ok)
    {
        total++;
        var mark = "FAIL";
        if (ok) mark = "PASS";
        if (!ok) failures++;
        Console.WriteLine("  " + mark + "  " + what);
    }

    public static void Near(string what, float expected, float actual)
    {
        Check(what + " [" + expected + "] (actual " + actual + ")", Math.Abs(expected - actual) < 0.001f);
    }

    public static void Throws<T>(string what, Action action) where T : Exception
    {
        var thrown = false;
        try
        {
            action();
        }
        catch (Exception error)
        {
            thrown = error is T;
        }
        Check(what, thrown);
    }

    public static int Report()
    {
        Console.WriteLine();
        Console.WriteLine("checks run: " + total + ", failed: " + failures);
        if (failures == 0)
        {
            Console.WriteLine("RESULT: ALL PASS");
            return 0;
        }
        Console.WriteLine("RESULT: FAILED");
        return 1;
    }
}
````

## check/Spine.Equip.Check/Program.cs

````csharp
using System.Text.Json;
using Spine.Equip;

namespace Check;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("usage: Spine.Equip.Check <equipment.json> <extension.json>");
            return 2;
        }
        Console.WriteLine("Spine.Equip behaviour check");
        Harness.Note("equipment data: " + args[0]);
        Harness.Note("extension data: " + args[1]);

        Diagnostics(args[0]);
        Accumulation(args[0]);
        Occupied(args[0]);
        Gated(args[0]);
        Sets(args[0]);
        Cleanup(args[0]);
        Destroyed(args[0]);
        Unload(args[0]);
        Extension(args[1]);
        Registration();
        OneWearer(args[0]);

        return Harness.Report();
    }

    private static World Load(string path) => new Loader(Catalogue.Default()).Load(path);

    private static bool Empty(Character character)
    {
        foreach (var pair in character.Slots)
        {
            if (pair.Value != null) return false;
        }
        return true;
    }

    private static void Diagnostics(string path)
    {
        Harness.Section("1. data kinds resolve through the catalogue; bad rows are named and dropped");
        var world = Load(path);
        foreach (var note in world.Diagnostics) Harness.Note(note);
        Harness.Check("exactly 9 diagnostics", world.Diagnostics.Count == 9);
        Harness.Check("unregistered kind: warning naming item and kind",
            world.Diagnostics.Contains("warning: item ghost-blade uses unregistered kind halberd"));
        Harness.Check("duplicate id: error naming the id",
            world.Diagnostics.Contains("error: duplicate item id steel-sword"));
        Harness.Check("dangling set id: error naming item and set",
            world.Diagnostics.Contains("error: item orphan-ring references unknown set mithril"));
        Harness.Check("unregistered requirement: warning naming item and key",
            world.Diagnostics.Contains("warning: item cursed-ring requires unregistered soul_bound"));
        Harness.Check("non numeric mod: error naming item and field",
            world.Diagnostics.Contains("error: item broken-ring: add is not a number"));
        Harness.Check("duplicate set id: error naming the set",
            world.Diagnostics.Contains("error: duplicate set id iron"));
        Harness.Check("set that is not a name: error naming the item",
            world.Diagnostics.Contains("error: item odd-ring has a set that is not a name"));
        Harness.Check("unregistered stat in mods: warning naming item and stat",
            world.Diagnostics.Contains("warning: item lucky-charm mods unregistered stat luck"));
        Harness.Check("unregistered stat in basis: warning naming character and stat",
            world.Diagnostics.Contains("warning: character ghost basis has unregistered stat luck"));

        Harness.Check("dropped rows produce no item at all",
            !world.HasItem("ghost-blade") && !world.HasItem("orphan-ring") && !world.HasItem("cursed-ring")
            && !world.HasItem("broken-ring") && !world.HasItem("odd-ring") && !world.HasItem("lucky-charm"));
        Harness.Throws<KeyNotFoundException>("looking up a dropped item throws", () => world.Item("ghost-blade"));
        Harness.Check("the duplicate set row did not replace the first", world.Item("iron-sword").Set!.Pieces == 3);
        Harness.Check("a character with an unregistered basis stat does not exist", !world.HasCharacter("ghost"));
        Harness.Near("first of two duplicate ids survives", 12f, world.Item("steel-sword").Mods[0].Add);
        Harness.Check("both characters loaded", world.HasCharacter("hero") && world.HasCharacter("mage"));
        Harness.Check("hero has three slots", world.Character("hero").Slots.Count == 3);
        Harness.Check("hero starts empty", Empty(world.Character("hero")));
        Harness.Throws<FileNotFoundException>("an unreadable data file throws", () => Load(Path.Combine(Path.GetDirectoryName(path)!, "no-such-file.json")));
        Harness.Throws<JsonException>("broken json throws instead of reporting a diagnostic", () => new Loader(Catalogue.Default()).LoadText("{ items: "));

        var wrongContainer = new Loader(Catalogue.Default()).LoadText("{\"items\":{}}");
        Harness.Check("a wrong container shape is reported, not thrown",
            wrongContainer.Diagnostics.Contains("error: items must be an array"));
        var wrongMods = new Loader(Catalogue.Default()).LoadText("{\"items\":[{\"id\":\"x\",\"kind\":\"sword\",\"mods\":5}]}");
        Harness.Check("a wrong mods shape names the item", wrongMods.Diagnostics.Contains("error: item x: mods must be an array"));
        var unknownJob = new Loader(Catalogue.Default()).LoadText("{\"items\":[{\"id\":\"x\",\"kind\":\"sword\",\"requires\":[{\"class\":\"paladin\"}]}]}");
        Harness.Check("a requirement value naming an unknown job warns and drops the row",
            unknownJob.Diagnostics.Count == 1 && unknownJob.Diagnostics[0].Contains("x requires class") && unknownJob.Diagnostics[0].Contains("paladin"));
    }

    private static void Accumulation(string path)
    {
        Harness.Section("2. additive and multiplicative contributions, order independent");
        var world = Load(path);
        var hero = world.Character("hero");
        Harness.Near("hero base attack", 10f, hero.Stats.Get<Attack>());
        Harness.Near("hero base defense", 5f, hero.Stats.Get<Defense>());
        var sword = world.Item("steel-sword");
        Harness.Check("steel-sword equips", hero.Equip(sword));
        Harness.Near("attack after +12", 22f, hero.Stats.Get<Attack>());
        Harness.Near("additive mod lands in Flat", 22f, hero.Stats.Pool<Attack>().Flat);
        Harness.Near("no ratio yet", 1f, hero.Stats.Pool<Attack>().Ratio);

        var mage = world.Character("mage");
        Harness.Check("level 9 mage wears a level_min 9 ring", mage.Equip(world.Item("grand-ring")));
        Harness.Near("attack after x1.1", 6.6f, mage.Stats.Get<Attack>());
        Harness.Near("multiplicative mod lands in Ratio", 1.1f, mage.Stats.Pool<Attack>().Ratio);

        var forward = Load(path);
        var first = forward.Character("hero");
        Harness.Check("order A equips sword, plate, ring",
            first.Equip(forward.Item("iron-sword")) && first.Equip(forward.Item("iron-plate")) && first.Equip(forward.Item("iron-ring")));
        var backward = Load(path);
        var second = backward.Character("hero");
        Harness.Check("order B equips ring, plate, sword",
            second.Equip(backward.Item("iron-ring")) && second.Equip(backward.Item("iron-plate")) && second.Equip(backward.Item("iron-sword")));
        Harness.Near("attack does not depend on equip order", first.Stats.Get<Attack>(), second.Stats.Get<Attack>());
        Harness.Near("defense does not depend on equip order", first.Stats.Get<Defense>(), second.Stats.Get<Defense>());
        Harness.Near("both orders reach the set bonus", 21.6f, first.Stats.Get<Attack>());
    }

    private static void Occupied(string path)
    {
        Harness.Section("3. equipping into an occupied slot revokes the old item completely");
        var world = Load(path);
        var hero = world.Character("hero");
        var steel = world.Item("steel-sword");
        var iron = world.Item("iron-sword");
        Harness.Check("steel-sword equips", hero.Equip(steel));
        Harness.Near("attack with steel-sword", 22f, hero.Stats.Get<Attack>());
        Harness.Check("iron-sword takes the occupied weapon slot", hero.Equip(iron));
        Harness.Check("weapon slot holds iron-sword", ReferenceEquals(hero.Worn<Weapon>(), iron));
        Harness.Check("steel-sword is out", !steel.Held);
        Harness.Near("attack is iron-sword only", 18f, hero.Stats.Get<Attack>());
        Harness.Check("displaced item can be equipped again", hero.Equip(steel));
        Harness.Check("weapon slot holds steel-sword again", ReferenceEquals(hero.Worn<Weapon>(), steel));
        Harness.Near("attack is steel-sword only", 22f, hero.Stats.Get<Attack>());
        iron.Destroy();
        Harness.Check("the displaced item stayed out", !iron.Held);
        Harness.Near("the destroyed displaced item adds nothing", 22f, hero.Stats.Get<Attack>());
    }

    private static void Gated(string path)
    {
        Harness.Section("4. requirements gate equipping");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        Harness.Check("level 7 cannot wear level_min 9", !hero.Equip(world.Item("grand-ring")));
        Harness.Check("trinket slot stays empty", hero.Worn<Trinket>() == null);
        Harness.Near("refused equip leaves attack alone", 10f, hero.Stats.Get<Attack>());
        Harness.Check("warrior cannot wear mage-only armor", !hero.Equip(world.Item("mage-robe")));
        Harness.Check("armor slot stays empty", hero.Worn<Armor>() == null);
        Harness.Check("mage wears the mage-only armor", mage.Equip(world.Item("mage-robe")));
        Harness.Near("mage defense after +3", 7f, mage.Stats.Get<Defense>());
        var blade = world.Item("iron-sword");
        Harness.Check("hero wears a blade first", hero.Equip(blade));
        Harness.Check("refusal does not disturb another slot", !hero.Equip(world.Item("grand-ring")) && ReferenceEquals(hero.Worn<Weapon>(), blade));
    }

    private static void Sets(string path)
    {
        Harness.Section("5. set effect activates at the threshold and dies with any single piece");
        var world = Load(path);
        var hero = world.Character("hero");
        var iron = world.Item("iron-sword").Set!;
        Harness.Check("one piece: inactive", hero.Equip(world.Item("iron-sword")) && !hero.Active(iron));
        Harness.Near("attack with one piece", 18f, hero.Stats.Get<Attack>());
        Harness.Near("defense with one piece", 5f, hero.Stats.Get<Defense>());
        Harness.Check("two pieces: still inactive", hero.Equip(world.Item("iron-plate")) && !hero.Active(iron));
        Harness.Near("defense with two pieces", 15f, hero.Stats.Get<Defense>());
        Harness.Check("three pieces: active", hero.Equip(world.Item("iron-ring")) && hero.Active(iron));
        Harness.Near("attack with the set ratio", 21.6f, hero.Stats.Get<Attack>());
        Harness.Near("defense with the set bonus applied once", 25f, hero.Stats.Get<Defense>());
        Harness.Check("replacing one piece deactivates immediately", hero.Equip(world.Item("steel-sword")) && !hero.Active(iron));
        Harness.Near("attack without the set", 22f, hero.Stats.Get<Attack>());
        Harness.Near("defense without the set (plate and ring only)", 17f, hero.Stats.Get<Defense>());
        Harness.Check("set returns when the piece returns", hero.Equip(world.Item("iron-sword")) && hero.Active(iron));
        Harness.Near("attack with the set again", 21.6f, hero.Stats.Get<Attack>());
        Harness.Check("unequipping one piece deactivates immediately", hero.Unequip<Trinket>() && !hero.Active(iron));
        Harness.Near("attack back to pieces only", 18f, hero.Stats.Get<Attack>());
        Harness.Near("defense back to pieces only", 15f, hero.Stats.Get<Defense>());
        Harness.Check("trinket slot empty", hero.Worn<Trinket>() == null);
    }

    private static void Cleanup(string path)
    {
        Harness.Section("6. the four cleanup paths in all 24 orders");
        var orders = new[] { 0, 1, 2, 3 };
        var seen = 0;
        var wrong = 0;
        EachOrder(orders, 0, order =>
        {
            seen++;
            var world = Load(path);
            var hero = world.Character("hero");
            var iron = world.Item("iron-sword").Set!;
            var dressed = hero.Equip(world.Item("iron-sword")) && hero.Equip(world.Item("iron-plate")) && hero.Equip(world.Item("iron-ring"));
            if (!dressed) wrong++;
            foreach (var step in order)
            {
                Act(step, hero, world);
                if (!Empty(hero)) wrong++;
            }
            if (!Empty(hero)) wrong++;
            if (Math.Abs(hero.Stats.Get<Attack>() - 10f) > 0.001f) wrong++;
            if (Math.Abs(hero.Stats.Get<Defense>() - 5f) > 0.001f) wrong++;
            if (hero.Active(iron)) wrong++;
        });
        Harness.Check("24 orders were exercised", seen == 24);
        Harness.Check("every order left no equipment, base stats and an inactive set", wrong == 0);
        Harness.Note("orders: unequip / destroy / death / scene unload, applied in every sequence");
        var dead = Load(path);
        var corpse = dead.Character("hero");
        corpse.Die();
        Harness.Check("death blocks further equipping", !corpse.Equip(dead.Item("steel-sword")));
        Harness.Check("the dead character stayed empty", Empty(corpse));
    }

    private static void Act(int step, Character character, World world)
    {
        if (step == 0) UnequipAll(character);
        if (step == 1) DestroyAll(character);
        if (step == 2) character.Die();
        if (step == 3) world.Scene.Unload();
    }

    private static void UnequipAll(Character character)
    {
        foreach (var slot in character.Slots.Keys) character.Unequip(slot);
    }

    private static void DestroyAll(Character character)
    {
        foreach (var pair in character.Slots) pair.Value?.Destroy();
    }

    private static void EachOrder(int[] values, int at, Action<int[]> visit)
    {
        if (at == values.Length)
        {
            visit(values);
            return;
        }
        for (var i = at; i < values.Length; i++)
        {
            Swap(values, at, i);
            EachOrder(values, at + 1, visit);
            Swap(values, at, i);
        }
    }

    private static void Swap(int[] values, int left, int right)
    {
        var hold = values[left];
        values[left] = values[right];
        values[right] = hold;
    }

    private static void Destroyed(string path)
    {
        Harness.Section("7. destroying equipment revokes it, and destroying is idempotent");
        var world = Load(path);
        var hero = world.Character("hero");
        var blade = world.Item("steel-sword");
        Harness.Check("steel-sword equips", hero.Equip(blade));
        Harness.Near("attack before destroy", 22f, hero.Stats.Get<Attack>());
        blade.Destroy();
        Harness.Check("destroyed flag is set", blade.Destroyed);
        Harness.Check("weapon slot is empty", hero.Worn<Weapon>() == null);
        Harness.Near("attack after destroy", 10f, hero.Stats.Get<Attack>());
        blade.Destroy();
        Harness.Near("second destroy changes nothing", 10f, hero.Stats.Get<Attack>());
        Harness.Check("destroyed item cannot be equipped again", !hero.Equip(blade) && hero.Worn<Weapon>() == null);
        Harness.Check("armor equips", hero.Equip(world.Item("iron-plate")));
        Harness.Near("defense with armor", 15f, hero.Stats.Get<Defense>());
        world.Item("iron-ring").Destroy();
        Harness.Near("destroying an unworn item changes nothing", 15f, hero.Stats.Get<Defense>());
    }

    private static void Unload(string path)
    {
        Harness.Section("8. scene unload clears every character of the scene");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        Harness.Check("hero dressed", hero.Equip(world.Item("iron-sword")) && hero.Equip(world.Item("iron-plate")));
        Harness.Check("mage dressed", mage.Equip(world.Item("mage-robe")));
        Harness.Check("scene knows two characters", world.Scene.Characters.Count == 2);
        world.Scene.Unload();
        Harness.Check("hero left empty", Empty(hero));
        Harness.Check("mage left empty", Empty(mage));
        Harness.Near("hero attack back to base", 10f, hero.Stats.Get<Attack>());
        Harness.Near("mage defense back to base", 4f, mage.Stats.Get<Defense>());
        Harness.Check("unload releases, it does not kill", !hero.Dead && !mage.Dead);
        Harness.Check("an unloaded character can be dressed again", hero.Equip(world.Item("iron-sword")));
        Harness.Near("and its contribution comes back", 18f, hero.Stats.Get<Attack>());
    }

    private static void Extension(string path)
    {
        Harness.Section("9. new slot kinds, item kind, stat and requirement, with zero core change");
        var plain = new Loader(Catalogue.Default()).Load(path);
        Harness.Check("without the extension the new data is only warned about", plain.Diagnostics.Count == 4);
        Harness.Check("unknown kind", plain.Diagnostics.Contains("warning: item oak-wand uses unregistered kind wand"));
        Harness.Check("unknown requirement", plain.Diagnostics.Contains("warning: item novice-blade requires unregistered level_max"));
        Harness.Check("unknown slot", plain.Diagnostics.Contains("warning: character scout uses unregistered slot offhand"));
        Harness.Check("unknown slot reusing an existing kind family", plain.Diagnostics.Contains("warning: character keeper uses unregistered slot relic"));
        Harness.Check("neither character exists without its slot kind", !plain.HasCharacter("scout") && !plain.HasCharacter("keeper"));
        Harness.Check("a row with a known kind still loads", plain.HasItem("plain-blade"));
        Harness.Check("a row with an unknown requirement is dropped", !plain.HasItem("novice-blade"));

        var catalogue = Catalogue.Default();
        catalogue.Slots.Add("offhand", new OffHand());
        catalogue.Slots.Add("relic", new Relic());
        catalogue.Kinds.Add("wand", new Wand());
        catalogue.Stats.Add("focus", new Focus());
        catalogue.Requires.Add("level_max", element => new MaxLevel(element.GetInt32()));
        var world = new Loader(catalogue).Load(path);
        Harness.Check("with the extension there are no diagnostics", world.Diagnostics.Count == 0);
        var scout = world.Character("scout");
        Harness.Check("scout has weapon and the new offhand slot", scout.Slots.Count == 2);
        Harness.Check("new kind equips into the new slot", scout.Equip(world.Item("oak-wand")));
        Harness.Near("new stat accumulates", 7f, scout.Stats.Get<Focus>());
        Harness.Check("plain blade equips", scout.Equip(world.Item("plain-blade")));
        Harness.Near("attack with plain blade", 8f, scout.Stats.Get<Attack>());
        Harness.Check("new requirement admits the novice blade", scout.Equip(world.Item("novice-blade")));
        Harness.Check("novice blade replaced the plain blade", ReferenceEquals(scout.Worn<Weapon>(), world.Item("novice-blade")));
        Harness.Near("attack with novice blade", 6f, scout.Stats.Get<Attack>());
        Harness.Check("new requirement rejects level 7", !new MaxLevel(5).Met(new Wearer(7, new Mage())));
        Harness.Check("new requirement accepts level 5", new MaxLevel(5).Met(new Wearer(5, new Mage())));
        Harness.Check("an item whose slot the character lacks is refused", !scout.Equip(world.Item("scout-vest")));
        Harness.Check("the weapon slot kept working meanwhile", ReferenceEquals(scout.Worn<Weapon>(), world.Item("novice-blade")));

        var keeper = world.Character("keeper");
        Harness.Check("keeper has a trinket and a slot reusing the trinket kind family", keeper.Slots.Count == 2);
        Harness.Check("first ring fills the free trinket slot", keeper.Equip(world.Item("jade-ring")));
        Harness.Check("second ring fills the other free slot", keeper.Equip(world.Item("bone-ring")));
        Harness.Check("the two rings did not displace each other",
            ReferenceEquals(keeper.Worn<Trinket>(), world.Item("jade-ring")) && ReferenceEquals(keeper.Worn<Relic>(), world.Item("bone-ring")));
        Harness.Near("both rings contribute", 7f, keeper.Stats.Get<Defense>());
    }

    private static void Registration()
    {
        Harness.Section("10. duplicate registration fails loudly instead of overwriting");
        var catalogue = Catalogue.Default();
        Harness.Throws<InvalidOperationException>("re-registering a name throws", () => catalogue.Slots.Add("weapon", new Weapon()));
        Harness.Throws<KeyNotFoundException>("looking up an unknown name throws", () => catalogue.Kinds.Get("halberd"));
        Harness.Check("the original registration is intact",
            catalogue.Slots.Get("weapon").Takes(catalogue.Kinds.Get("sword")));
    }

    private static void OneWearer(string path)
    {
        Harness.Section("11. one item instance is worn by at most one character, and state is per character");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        var blade = world.Item("steel-sword");
        Harness.Check("hero wears the blade", hero.Equip(blade));
        Harness.Check("mage cannot wear the same instance", !mage.Equip(blade));
        Harness.Check("mage stays empty", Empty(mage));
        Harness.Near("hero keeps the contribution", 22f, hero.Stats.Get<Attack>());
        Harness.Check("mage wears its own trinket", mage.Equip(world.Item("grand-ring")));
        Harness.Check("hero wears another trinket of the same kind", hero.Equip(world.Item("iron-ring")));
        Harness.Near("hero defense sees only its own ring", 7f, hero.Stats.Get<Defense>());
        Harness.Near("mage defense sees only its own ring", 4f, mage.Stats.Get<Defense>());
        Harness.Near("mage attack sees only its own ring", 6.6f, mage.Stats.Get<Attack>());
        Harness.Near("hero attack is untouched by the mage ring", 22f, hero.Stats.Get<Attack>());
    }
}
````

## check/Spine.Equip.Check/Spine.Equip.Check.csproj

````xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <RootNamespace>Spine.Equip.Check</RootNamespace>
    <AssemblyName>Spine.Equip.Check</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Spine.Equip\Spine.Equip.csproj" />
  </ItemGroup>

</Project>
````

## data/equipment.json

````json
{
  "sets": [
    {
      "id": "iron",
      "pieces": 3,
      "mods": [
        { "stat": "defense", "add": 8 },
        { "stat": "attack", "mul": 1.2 }
      ]
    },
    { "id": "iron", "pieces": 9, "mods": [ { "stat": "attack", "add": 999 } ] }
  ],
  "items": [
    { "id": "steel-sword", "kind": "sword", "mods": [ { "stat": "attack", "add": 12 } ] },
    { "id": "iron-sword", "kind": "sword", "set": "iron", "requires": [ { "level_min": 3 } ], "mods": [ { "stat": "attack", "add": 8 } ] },
    { "id": "iron-plate", "kind": "plate", "set": "iron", "requires": [ { "class": "warrior" } ], "mods": [ { "stat": "defense", "add": 10 } ] },
    { "id": "iron-ring", "kind": "ring", "set": "iron", "mods": [ { "stat": "defense", "add": 2 } ] },
    { "id": "grand-ring", "kind": "ring", "requires": [ { "level_min": 9 } ], "mods": [ { "stat": "attack", "mul": 1.1 } ] },
    { "id": "mage-robe", "kind": "robe", "requires": [ { "class": "mage" } ], "mods": [ { "stat": "defense", "add": 3 } ] },

    { "id": "ghost-blade", "kind": "halberd", "mods": [ { "stat": "attack", "add": 99 } ] },
    { "id": "steel-sword", "kind": "sword", "mods": [ { "stat": "attack", "add": 77 } ] },
    { "id": "orphan-ring", "kind": "ring", "set": "mithril", "mods": [ { "stat": "defense", "add": 99 } ] },
    { "id": "cursed-ring", "kind": "ring", "requires": [ { "soul_bound": true } ], "mods": [ { "stat": "defense", "add": 99 } ] },
    { "id": "broken-ring", "kind": "ring", "mods": [ { "stat": "attack", "add": "many" } ] },
    { "id": "odd-ring", "kind": "ring", "set": 5, "mods": [ { "stat": "defense", "add": 99 } ] },
    { "id": "lucky-charm", "kind": "ring", "mods": [ { "stat": "luck", "add": 5 } ] }
  ],
  "characters": [
    { "id": "hero", "level": 7, "job": "warrior", "slots": [ "weapon", "armor", "trinket" ], "basis": { "attack": 10, "defense": 5 } },
    { "id": "mage", "level": 9, "job": "mage", "slots": [ "weapon", "armor", "trinket" ], "basis": { "attack": 6, "defense": 4 } },
    { "id": "ghost", "level": 5, "job": "warrior", "slots": [ "weapon" ], "basis": { "attack": 5, "luck": 3 } }
  ]
}
````

## data/extension.json

````json
{
  "items": [
    { "id": "oak-wand", "kind": "wand", "mods": [ { "stat": "focus", "add": 7 } ] },
    { "id": "plain-blade", "kind": "sword", "mods": [ { "stat": "attack", "add": 3 } ] },
    { "id": "novice-blade", "kind": "sword", "requires": [ { "level_max": 5 } ], "mods": [ { "stat": "attack", "add": 1 } ] },
    { "id": "scout-vest", "kind": "plate", "mods": [ { "stat": "defense", "add": 4 } ] },
    { "id": "jade-ring", "kind": "ring", "mods": [ { "stat": "defense", "add": 2 } ] },
    { "id": "bone-ring", "kind": "ring", "mods": [ { "stat": "defense", "add": 3 } ] }
  ],
  "characters": [
    { "id": "scout", "level": 3, "job": "mage", "slots": [ "offhand", "weapon" ], "basis": { "attack": 5 } },
    { "id": "keeper", "level": 4, "job": "mage", "slots": [ "trinket", "relic" ], "basis": { "defense": 2 } }
  ]
}
````

## README.md

````markdown
# Spine.Equip

一个最小完备的装备系统模型：槽位、种类、加算/乘算贡献、使用需求、套装效果、四种清理时机，以及数据驱动的种类装载。

## 跑一次

```powershell
pwsh -NoProfile -File .\check.ps1          # 构建 + 行为检查 + 结构检查
pwsh -NoProfile -File .\check-structure.ps1            # 只跑结构红线
pwsh -NoProfile -File .\check-structure.ps1 -SelfTest  # 结构红线 + 13 个反例必须变红
pwsh -NoProfile -File .\check-mutants.ps1              # 往核心里注入 5 个坏实现，行为检查必须变红
```

`check.ps1` 退出码 0 = 全绿。

## 目录

| 目录 | 是什么 | 允许出现什么 |
| --- | --- | --- |
| `src\Spine.Equip\Core\` | 主干：模型与不变量 | 抽象；**不允许**出现任何名字、字符串、具体变体、static 状态 |
| `src\Spine.Equip\Variants\` | 具体变体：槽位、种类、属性、职业、需求 | 具体类型 |
| `src\Spine.Equip\Load\` | 装载层：`Catalogue` 登记表 + `Loader` JSON 解析 | 名字（**唯一的缝**） |
| `check\Spine.Equip.Check\` | 可运行的行为检查（控制台程序） | 用户面用法，含"新增一种槽位"的扩展示范 |
| `data\*.json` | 数据 | 名字与数值 |

## 加一个"解释"要写几处

| 想做的事 | 代价 |
| --- | --- |
| 加一件装备（已有种类/套装/需求形状） | **0 处代码**，只加一行 JSON |
| 加一种装备种类（例：`wand`） | **1 个类型 + 1 行登记**：`sealed class Wand : OffHand.Kind` + `catalogue.Kinds.Add("wand", new Wand())` |
| 加一种槽位（例：`offhand`） | **1 个类型 + 1 行登记**：`sealed class OffHand : Slot`（内含 `Kind` 基类）+ `catalogue.Slots.Add("offhand", new OffHand())` |
| 加一种使用需求（例：`level_max`） | **1 个类型 + 1 行登记**：`sealed class MaxLevel : Requirement` + `catalogue.Requires.Add("level_max", e => new MaxLevel(e.GetInt32()))` |
| 加一种属性（例：`focus`） | **1 个类型 + 1 行登记**：`sealed class Focus : Stat` + `catalogue.Stats.Add("focus", new Focus())` |

核心（`Core\`）在以上任何一种情况下都是 0 行改动——`check-structure.ps1` 的"core contains no variant type"就是这条的机械判据：变体名清单**从工厂的登记行推导**，核心一旦出现任何一个即变红。

`check\Spine.Equip.Check\Extension.cs` 就是一个照抄样板：它在**库之外**新增了 `OffHand` 槽位、`Wand` 种类、`Focus` 属性、`MaxLevel` 需求，然后装载 `data\extension.json` 并走通全流程。

## 主干的不变量

- **一份真相**：角色身上的 `worn`（槽位 → 占用物）是唯一状态。属性账本 `Stats` 与套装激活都是**从它重新算出来的**，不是增量加减。因此"旧装备贡献被完全撤销"是结构保证，不依赖记账纪律。
- **加算与乘算分开**：`Pool{Flat,Ratio}`，`Final = Flat * Ratio`。加算进 `Flat`、乘算进 `Ratio`，所以施加顺序不参与结果。
- **四种清理时机归一**：主动卸下 / 装备销毁 / 角色死亡 / 场景卸载 全部走同一个幂等的 `Clear`，顺序不保证也无所谓；24 种排列都被检查覆盖。
- **装备实例唯一**：一件被穿着的装备不能被另一个角色再穿（`Item.Held`）。
- **装载期不抛，查找期可抛**：引用了未登记的种类/需求/槽位/职业 = 警告；重复 id、悬空 set id、非法数值 = 错误；两者都跳过该条目、不产出半成品；只有文件读不了/JSON 语法错才抛。

## 数据格式

```json
{
  "sets": [ { "id": "iron", "pieces": 3, "mods": [ { "stat": "defense", "add": 8 }, { "stat": "attack", "mul": 1.2 } ] } ],
  "items": [ { "id": "iron-sword", "kind": "sword", "set": "iron",
               "requires": [ { "level_min": 3 } ],
               "mods": [ { "stat": "attack", "add": 8 } ] } ],
  "characters": [ { "id": "hero", "level": 7, "job": "warrior",
                    "slots": [ "weapon", "armor", "trinket" ],
                    "basis": { "attack": 10, "defense": 5 } } ]
}
```

`kind` / `slot` / `stat` / `job` / 需求键 / `set` 都以字符串出现在数据里，只在 `Catalogue` 与 `Loader` 被解释成类型；主干拿到的已经是类型。

## 检查清单

| 文件 | 能判定什么 |
| --- | --- |
| `check.ps1` | 构建 + 行为检查 + 结构检查，一条命令的总闸 |
| `check\Spine.Equip.Check\Program.cs` | 137 条行为断言（见脚本输出分节） |
| `check-structure.ps1` | 12 条结构红线，含依赖无环、核心无名字/无变体/无字符串/无 static |
| `check-structure.ps1 -SelfTest` | 17 个反例注入临时副本，逐条验证红线真的会红 |
| `check-mutants.ps1` | 6 个坏核心（不卸下旧装备 / 不重置账本 / 套装阈值差一 / 场景卸载空转 / 无视需求 / 允许一件两穿），验证行为检查真的会红；外加一个"编译不过的变异体必须不算被抓到"的对照 |

改动前请先读 `REPORT.md`（判断点、刻意没做的、不可判定的需求、独立复审结论）。
````

## REPORT.md

````markdown
# 报告：Spine.Equip 装备系统

落盘位置 `H:\Git\dsh-mydsh\.spine-equip\`（只写了这个目录）。

一条命令复跑：

```powershell
pwsh -NoProfile -File H:\Git\dsh-mydsh\.spine-equip\check.ps1
```

当前结果：构建 0 警告 0 错误 → 行为检查 `checks run: 137, failed: 0 / RESULT: ALL PASS` → 结构检查 12 条全绿 → `CHECK: ALL PASS`，exit 0。

---

## 1. 加载了哪些 skill

| skill | 用到了它的什么 |
| --- | --- |
| `spine` | 总准则：最小完备、信息单向、"新增一个解释要写几处代码"是唯一度量、八条硬约束（No Else / No Switch / 类型替代枚举 / 主干只知抽象 / 不写注释 / 依赖无环 / 无填充词 / 最小公开） |
| `spine-design` | 找主干的设零法（拆最小实现的环节 → 每个环节一个抽象）；"Type Object 的位置是载入边界，不是主干"；装载诊断模型（编译器类比：未登记种类=警告、悬空 id=错误、文件读不了=异常，绝不产出半成品）；"扩展点与主干之间只允许一个窄缝" |
| `spine-shape` | 按类型索引定理（开放的集合必然表现为按类型索引，字符串键只允许出现在工厂）；修正累积 `Pool{Flat,Ratio}` 让施加顺序无关；账本+变化（状态只有一份，变化从状态派生）；容器必须能被枚举，否则会逼出外挂账本 |
| `spine-level` | 等级律与"推/拉"不对称；把上层能力下沉成契约、注入面从"整个对象"缩到"一项能力"（→ `Requirement` 只拿 `Wearer` 的 level/job，而不是 `Character`，否则 `Requirement ⇄ Character` 成环） |
| `spine-check` | 九条红线的可 grep 判据；"检查的覆盖面必须从被检查的东西推导出来，不能手写"（→ 变体名清单从工厂登记行推导、数据名清单从 JSON 推导）；"> 0 次出现型断言基本等于没有断言"；"反例要造这条检查声称要防的那个东西"；注册静默覆盖；复审代理的四项职责 |

没有加载：`spine-unity`（不是 Unity 工程）、office/openviking/azure 系列（与本次交付无关）。

## 2. 主干与扩展点怎么划分

**最小实现（设零）**：一套装备系统 = ①槽位 ②装备与它的种类 ③贡献累积 ④使用需求判定 ⑤套装计数 ⑥清理与撤销 ⑦"数据里的种类标识 → 行为"的映射。七个环节，对应下面七个抽象（⑦落在装载边界，不在主干里）。

| 层 | 内容 | 位置 | 处方 |
| --- | --- | --- | --- |
| **固化（主干）** | 不变量：一份真相 + 全量重算；四时机归一到一个幂等 `Clear`；一件实例只能被一个角色穿；名字/字符串/static 一律不得进主干 | `Core\Character.cs` | 写死，不动 |
| **固化（主干）** | 累积语义：`Final = (basis + Flat) * Ratio`，加算进 Flat、乘算进 Ratio | `Core\Stats.cs` | 写死，不动 |
| **可替换** | `Slot.Takes(ItemKind)`、`Requirement.Met(Wearer)`、`Stat` / `Job` 作身份 | `Core\*.cs` 抽象 + `Variants\*.cs` 实现 | 继承与多态 |
| **可新增** | 装备种类 `ItemKind`、槽位种类 `Slot`、属性 `Stat`、职业 `Job`、需求 `Requirement` | 各一条登记行 | 组合 |
| **可新增（零代码）** | 具体装备、套装、数值、角色模板 | `data\*.json` | 加一行数据 |
| **唯一的缝** | `Load\Registry<T>` + `Catalogue`（一张登记表，5 张子表：Slots/Kinds/Stats/Jobs/Requires） | `Load\Catalogue.cs` | 名字只允许出现在这里 |

扩展成本（这是设计是否成立的唯一度量）：

| 想做的事 | 代价 |
| --- | --- |
| 加一件装备 / 改数值 / 加一套装 | **0 处代码**，只加 JSON 行 |
| 加一种装备种类 | 1 个类型（`sealed class Wand : OffHand.Kind`）+ 1 行登记 |
| 加一种槽位 | 1 个类型（`sealed class OffHand : Slot`，内含 `Kind` 基类）+ 1 行登记 |
| 加一种需求 | 1 个类型（`sealed class MaxLevel : Requirement`）+ 1 行登记（含解析 lambda） |
| 加一种属性 | 1 个类型 + 1 行登记 |

`check\Spine.Equip.Check\Extension.cs` 就是照抄样板：它在**库之外**新加了 2 种槽位（`OffHand` 新种类族、`Relic` 复用 `Trinket.Kind`）、1 种装备种类（`Wand`）、1 种属性（`Focus`）、1 种需求（`MaxLevel`），装载 `data\extension.json` 走通全流程；而结构检查里的 "core contains no variant type" 用**从工厂登记行推导出来的变体名清单**去 grep 主干，证明主干 0 处引用。

补充一条：同一个 `kind` 可以被多个槽位接受时，`Character.Find` **优先返回空着的那个可接受槽位**，都满了才顶掉第一个——否则"复用已有种类族加一个槽位"会做出一个永远装不进东西的槽位（这是复审发现并修掉的）。

## 3. 哪些决定是我判断出来的（不是需求推导的）

1. **每角色每槽位种类一个槽位**。需求说"若干装备槽"但没说同种能否有多个（双戒指/主副手）。我按每种一个；`Find` 的"先空后顶"策略让"多槽位接受同一 kind"有了确定语义，但仍不支持"两个 `Trinket` 槽位"。
2. **槽位种类、装备种类、属性、职业都是 CLR 类型，不是数据行**。理由：它们需要被区分（`kind is Weapon.Kind`），数据行进不了 `is`。
3. **属性账本用"全量重算"而不是增量加减**。这是"旧装备贡献必须被完全撤销"的结构保证：唯一状态是 `worn`，账本每次从它重算，不可能漏减、也不可能双减。代价是每次变更 O(装备数)，个位数，可接受。
4. **`Final = (基础 + 加算) × 乘算连乘`**，乘算放大"基础+加算"，多个乘算连乘；因 `Pool` 形状而顺序无关。
5. **一件装备实例同一时刻只能被一个角色穿**（`Item.Held`）；否则 `unbind` 回调会被后一个角色覆盖，静默错位。
6. **角色死亡 = 释放全部装备 + 之后禁止再装备**；复活/恢复死亡前装备不在范围内。
7. **场景卸载只释放装备**，不销毁角色对象、不清空 `Scene.Characters`（场景对象可复用）。
8. **装载期分级**：未登记的名字（kind/slot/stat/job/需求键/需求值）= 警告（策划先行、程序未实现是正常态）；数据自相矛盾（重复 id、重复 set id、悬空 set id、非法数值、`set` 不是名字）= 错误；两类都**跳过该行、不产出半成品**；只有文件读不了、JSON 语法错才抛。
9. **未解释的行就是不存在**：item 引用未登记 stat、character 的 basis 里出现未登记 stat、`"mods": 5` 这种形状错，都把**整行**丢掉，而不是留一个"半成品"或"少一项"的对象。
10. **注册表重复登记直接抛**（编程错误），而数据里的重复 id 是诊断（数据错误）——两者语义不同，不共用一套处理。
11. **行内解析异常用一个窄过滤器**（`FormatException / InvalidOperationException / ArgumentException / KeyNotFoundException`）转成 error 诊断；其他异常（真 bug）继续向上抛。
12. **诊断消息用英文 ASCII**（避免控制台编码问题），报告用中文。
13. **`Equip` 返回 bool，不区分失败原因**（死亡/已销毁/已被穿/需求不满足/没有槽位接受它）。需要区分时再加类型，现在加就是"为一个不存在的差异建抽象"。
14. **`Stats.Get<T>()` 对未知属性返回 0**，不抛。
15. **检查工程用控制台自断言，不引入 xunit/任何 NuGet 包**——离线可跑、零依赖。
16. **每种变体都被登记**：结构检查断言"库/检查工程里每一个具体变体类型都出现在某条登记行上"，防止"类型写了但忘了登记"这种静默消失。

## 4. 我刻意没有做的东西

| 没做 | 为什么 |
| --- | --- |
| 配置编辑器 / 表工具 | 需求明说不用做 |
| 背包、掉落、耐久、堆叠、数量 | 需求只讲"角色身上的槽位"；加进来会把主干从"装备"扩成"物品经济" |
| 双手武器占两个槽 / 双戒指 / 主副手 | 需求里没有，且会引入"装哪个槽、满了怎么办"的未定义策略 |
| 属性上下限、最终值裁剪、施加顺序 | 需求没说；`Pool` 的形状已经让顺序问题消失 |
| 事件/观察者（装备变化通知） | 需求没有订阅者；`Active(set)`、`Slots`、`Stats` 都是可查询的派生量，够用。加事件是为不存在的订阅者建抽象 |
| 存档 / 序列化回写 | 数据是只读输入 |
| 线程安全 | 单线程游戏循环假设；加锁是为不存在的并发建抽象 |
| 对象池 / 性能优化 | 每次变更全量重算，装备数个位数；"高频才优化，且要有依据" |
| Unity 集成、MonoBehaviour、生命周期钩子 | 交付要求是"能编译能运行的 C# 代码"；纯类库可移植 |
| 失败原因枚举 / 错误码 | 见判断 13 |
| `Check-behaviour.ps1` 之类的第四层脚本 | 行为断言由控制台程序承担，再包一层脚本只是重复 |
| 潜在缺陷库中"未知种类的占位对象" | 明确反模式：未解释的条目就是不存在 |

## 5. 我认为不可判定、需要人来定的需求

1. **乘算的作用对象与组合方式**：乘算是放大"基础+加算"，还是只放大基础？多个乘算是连乘、相加、还是取最大？我取"放大基础+加算、连乘"。
2. **同种槽位能否有多个**（双戒指/主副手/双手武器占两格）？我按每种一个。
3. **一件装备实例能否被多个角色同时穿**？我判不能。
4. **"装备被销毁"指实例销毁还是数据行删除**？我按实例，且销毁后不可再装。
5. **死亡语义**：死后能否复活并恢复死亡前的装备？我按"释放且不保留快照、死后不可再装"。
6. **场景卸载后角色对象是否还存在**？我按只释放装备、角色仍可用。
7. **使用需求里那个"等"还包括什么事实**？现在是 `Wearer{Level, Job}` 两个事实的契约面；要加"当前属性/阵营/声望"就得扩这个 struct（签名不变，但数据形状变）。
8. **未登记种类应该警告还是阻断启动**？我按编译器模型（警告+跳过），需求没说。
9. **数据里重复 id 谁赢**？先者、后者、还是报错？我按"报错并保留先者"（不静默覆盖）。
10. **套装阈值是否只有一档**（`pieces: 3`）？要不要"2 件/3 件/5 件"多档效果？我按单档。
11. **多套套装同时激活是否互相影响**？（例如"全套铁装 + 全套皮装"）我按各自独立计数。
12. **职业判定是否含子类**？`ClassOnly` 用 `IsInstanceOfType`，即 `Knight : Warrior` 也能穿战士专属——需求没说职业是否有继承。
13. **属性用什么数值类型**（float / 定点 / 整数）？我按 float，检查里用 1e-3 容差比较。
14. **`Stats.Get<T>()` 查未知属性该返回 0 还是抛**？我按返回 0。

## 6. 我在项目里留下的所有可执行检查

| 文件 | 能判什么 |
| --- | --- |
| `check.ps1` | 总闸：Release 构建（warnings-as-errors，当前 0 警告）→ 跑行为检查 → 跑结构检查 → 汇总退出码 |
| `check\Spine.Equip.Check\Program.cs` + `Harness.cs` | **137 条行为断言**，11 节：①装载诊断（9 条诊断逐条点名 + 被丢的行不存在 + 重复 id 先者存活 + 重复 set 不覆盖 + 形状错不抛异常）②加算/乘算与顺序无关 ③占用槽顶替后旧装备完全撤销且可再装 ④需求门禁 ⑤套装阈值与"卸一件立即失效" ⑥四种清理时机的 **24 种全排列** + 死亡后禁止装备 ⑦销毁的幂等与撤销 ⑧场景卸载（含"卸载不是杀死"）⑨**扩展性**：库外新增 2 种槽位/1 种种类/1 种属性/1 种需求后全流程可用，且未扩展时只警告不崩 ⑩重复登记显式失败 ⑪一件实例只能一穿 + 角色状态互不串味 |
| `check-structure.ps1` | **12 条结构红线**：No Else / No Switch / No Enum / 无填充词命名 / 注释只能是可追溯注释且作者必须等于 `$env:USERNAME` / 名称清单必须推导而来（防空跑）/ **核心不含任何数据名** / **核心不含任何变体类型** / 核心无 static 状态 / 核心无字符串字面量 / 每个具体变体都必须被登记 / **依赖图无环**（自建类型图 + DFS 回边） |
| `check-structure.ps1 -SelfTest` | **17 个反例**注入临时副本，逐条验证上面每条红线真的会红（含"字符串里的 `//` 掩盖真 `else`"、"嵌套具体变体"、"登记语句被换行"三个阴招），并验证干净树仍然是绿 |
| `check-mutants.ps1` | 往核心里注入 **6 个坏实现**（不卸下旧装备 / 不重置账本 / 套装阈值差一 / 场景卸载空转 / 无视需求 / 允许一件两穿），每个都必须让行为检查**红出具体的 FAIL 行**才算被抓到；外加一个"编译不过的变异体必须被判为没抓到"的对照，防止拿编译失败冒充通过 |

检查自身被反例验证过（"一个会红的检查才有价值"）：结构 17 个反例、行为 6 个变异体全部为红，干净树全绿。

**仍然没有覆盖的**（诚实列出）：Loader 里还有若干诊断分支没有数据走到（item 行缺 id、character 行缺 id/job、非字符串槽位名、重复 character id、`slots` 非数组、requirement 项非对象、`pieces <= 0`、basis 非对象、mod 非对象、set 行缺 id）；`Set(0)` 这种 API 级边界（装载期会拒）；`Character` 构造函数传重复槽位实例（数据路径已被 Loader 拦掉）。

## 7. 独立复审与回改

代码写完后，把**代码 + 需求原文 + 上面这份报告**交给了一个**独立上下文**的复审代理（明确告知："作者的结论是声称，不是证据"），它自己复跑、自己写检查、自己做变异测试。它证伪了我 4 条说法，我据此改了代码与检查：

| 复审发现 | 性质 | 处理 |
| --- | --- | --- |
| `{"class":"paladin"}` 报成 `error: not registered: paladin`，没点名到行，且"未登记的名字"在这一条上被降级成错误 | 违规（我声称"两类都点名到行"） | 需求工厂改为可返回 `null`（回答不了这个值），装载层据此发**警告并点名**行与值 |
| `{"items":{}}` 等"形状错"会从 `Load` 抛异常 | 违规（我声称只有文件/语法错才抛） | 统一 `Rows` 守卫 + 各字段的形状守卫，形状错现在是**诊断** |
| `{"set":5}` **静默无诊断**，装备被当成"没有套装"造出来 | 违规（静默丢数据） | `ReadSet` 区分"没有 set"与"set 不是名字"，后者是错误并丢掉该行 |
| `basis` 里未登记属性只警告并保留半成品角色 | 规格留白（我的判断） | 改为与 item 一致：警告 + **整行丢弃**，检查里加断言 |
| `Character.Slots` 交出的是活的 `Dictionary`，外面可以强转后写穿，导致账本与真相脱节 | 规格留白 | 改为缓存的 `ReadOnlyDictionary` 视图 |
| 复用已有种类族新增的槽位**永远装不进东西**（`Find` 只认第一个可接受槽位） | 规格留白 → 实际是缺陷 | `Find` 改为"先空后顶"；检查里加了 `Relic : Slot`（1 类型 + 1 行）与两只戒指分别落入两个槽的断言 |
| `Scene.Unload` 改成 `Die()` 也全绿（没有任何断言区分"卸载"与"杀死"） | 我的检查缺口 | 加断言：卸载后角色未死亡、可再装备、属性回来 |
| 结构检查看不见**缩进嵌套**的具体变体、看不见被换行的登记语句、看不见被字符串里 `//` 掩盖的 `else` | 我的检查缺口（假绿 + 归因错） | 注释扫描改为字符串感知；登记语句改为括号配对提取、登记表名从 `Catalogue` 的 `Registry<...>` 属性推导；新增 4 个反例（`else-after-string`、`variant-reformatted`、`unregistered3` 嵌套变体…） |
| `check-mutants.ps1` 把**编译失败**也记成"抓到了" | 我的检查缺口（虚假信心） | 判定改为"退出码 1 **且**有 FAIL 行"；并加"编译不过必须算没抓到"的对照项 |
| Loader 里 5 个守卫没有任何数据走到（重复 set id、mods 里未登记属性、basis 里未登记属性…） | 覆盖缺口 | 数据与内联 `LoadText` 探针把这些分支全部走红/走绿一遍 |
| 报告/README 里的数字过期（113/13） | 文档错 | 已更新为 137 / 12 / 17 / 6 |

复审同时**证实**了：核心 0 字符串、0 static、0 具体变体引用、依赖图 0 环（它自己建图）；24 种排列是真跑了 24 种；被顶替装备的贡献与"全新角色只穿那件"逐值相同；套装阈值是 `>=` 且只加一次；一件实例只能一穿；重复登记会抛。它**没能证伪**的部分我原样保留。

复审后仍未修（属于"留白"而不是"错"）：职业继承语义（判断 12）、`Set(0)` 的 API 边界、死亡后 `Unequip` 仍允许。
````

## src/Spine.Equip/Core/Character.cs

````csharp
using System.Collections.ObjectModel;

namespace Spine.Equip;

public sealed class Character
{
    private readonly Dictionary<Slot, Item?> worn = new();
    private readonly List<KeyValuePair<Stat, float>> basis = new();
    private readonly ReadOnlyDictionary<Slot, Item?> view;

    public Character(int level, Job job, IEnumerable<Slot> slots, IEnumerable<KeyValuePair<Stat, float>> basis)
    {
        Level = level;
        Job = job;
        this.basis.AddRange(basis);
        foreach (var slot in slots) worn.Add(slot, null);
        view = new ReadOnlyDictionary<Slot, Item?>(worn);
        Stats = new Stats();
        Rebuild();
    }

    public int Level { get; }

    public Job Job { get; }

    public bool Dead { get; private set; }

    public Stats Stats { get; }

    public IReadOnlyDictionary<Slot, Item?> Slots => view;

    public bool Equip(Item item)
    {
        if (Dead) return false;
        if (item.Destroyed) return false;
        if (item.Held) return false;
        var wearer = new Wearer(Level, Job);
        foreach (var requirement in item.Requires)
        {
            if (!requirement.Met(wearer)) return false;
        }
        var slot = Find(item.Kind);
        if (slot == null) return false;
        Clear(slot);
        worn[slot] = item;
        item.unbind = () => Remove(item);
        Rebuild();
        return true;
    }

    public bool Unequip(Slot slot)
    {
        if (!worn.TryGetValue(slot, out var item)) return false;
        if (item == null) return false;
        Clear(slot);
        Rebuild();
        return true;
    }

    public bool Unequip<T>() where T : Slot
    {
        var slot = FindSlot<T>();
        if (slot == null) return false;
        return Unequip(slot);
    }

    public Item? Worn<T>() where T : Slot
    {
        var slot = FindSlot<T>();
        if (slot == null) return null;
        return worn[slot];
    }

    public bool Active(Set set) => Count(set) >= set.Pieces;

    public void Die()
    {
        Dead = true;
        Release();
    }

    public void Release()
    {
        foreach (var slot in worn.Keys) Clear(slot);
        Rebuild();
    }

    private void Clear(Slot slot)
    {
        var item = worn[slot];
        if (item == null) return;
        item.unbind = null;
        worn[slot] = null;
    }

    private void Remove(Item item)
    {
        foreach (var slot in worn.Keys)
        {
            if (!ReferenceEquals(worn[slot], item)) continue;
            worn[slot] = null;
            Rebuild();
            return;
        }
    }

    private Slot? Find(ItemKind kind)
    {
        Slot? occupied = null;
        foreach (var slot in worn.Keys)
        {
            if (!slot.Takes(kind)) continue;
            if (worn[slot] == null) return slot;
            if (occupied == null) occupied = slot;
        }
        return occupied;
    }

    private Slot? FindSlot<T>() where T : Slot
    {
        foreach (var slot in worn.Keys)
        {
            if (slot is T) return slot;
        }
        return null;
    }

    private int Count(Set set)
    {
        var count = 0;
        foreach (var item in worn.Values)
        {
            if (item?.Set == set) count++;
        }
        return count;
    }

    private void Rebuild()
    {
        Stats.Reset(basis);
        foreach (var item in worn.Values)
        {
            if (item == null) continue;
            Stats.Apply(item.Mods);
        }
        foreach (var set in WornSets())
        {
            if (!Active(set)) continue;
            Stats.Apply(set.Mods);
        }
    }

    private List<Set> WornSets()
    {
        var sets = new List<Set>();
        foreach (var item in worn.Values)
        {
            var set = item?.Set;
            if (set == null) continue;
            if (sets.Contains(set)) continue;
            sets.Add(set);
        }
        return sets;
    }
}
````

## src/Spine.Equip/Core/Item.cs

````csharp
namespace Spine.Equip;

public sealed class Item
{
    internal Action? unbind;

    public Item(ItemKind kind, IReadOnlyList<Mod> mods, IReadOnlyList<Requirement> requires, Set? set)
    {
        Kind = kind;
        Mods = mods;
        Requires = requires;
        Set = set;
    }

    public ItemKind Kind { get; }

    public IReadOnlyList<Mod> Mods { get; }

    public IReadOnlyList<Requirement> Requires { get; }

    public Set? Set { get; }

    public bool Destroyed { get; private set; }

    public bool Held => unbind != null;

    public void Destroy()
    {
        Destroyed = true;
        var notify = unbind;
        unbind = null;
        notify?.Invoke();
    }
}
````

## src/Spine.Equip/Core/ItemKind.cs

````csharp
namespace Spine.Equip;

public abstract class ItemKind
{
}
````

## src/Spine.Equip/Core/Job.cs

````csharp
namespace Spine.Equip;

public abstract class Job
{
}
````

## src/Spine.Equip/Core/Mod.cs

````csharp
namespace Spine.Equip;

public readonly struct Mod
{
    public Mod(Stat stat, float add, float mul)
    {
        Stat = stat;
        Add = add;
        Mul = mul;
    }

    public Stat Stat { get; }

    public float Add { get; }

    public float Mul { get; }
}
````

## src/Spine.Equip/Core/Requirement.cs

````csharp
namespace Spine.Equip;

public readonly struct Wearer
{
    public Wearer(int level, Job job)
    {
        Level = level;
        Job = job;
    }

    public int Level { get; }

    public Job Job { get; }
}

public abstract class Requirement
{
    public abstract bool Met(Wearer wearer);
}
````

## src/Spine.Equip/Core/Scene.cs

````csharp
namespace Spine.Equip;

public sealed class Scene
{
    private readonly List<Character> characters = new();

    public IReadOnlyList<Character> Characters => characters;

    public void Add(Character character) => characters.Add(character);

    public void Unload()
    {
        foreach (var character in characters) character.Release();
    }
}
````

## src/Spine.Equip/Core/Set.cs

````csharp
namespace Spine.Equip;

public sealed class Set
{
    public Set(int pieces, IReadOnlyList<Mod> mods)
    {
        Pieces = pieces;
        Mods = mods;
    }

    public int Pieces { get; }

    public IReadOnlyList<Mod> Mods { get; }
}
````

## src/Spine.Equip/Core/Slot.cs

````csharp
namespace Spine.Equip;

public abstract class Slot
{
    public abstract bool Takes(ItemKind kind);
}
````

## src/Spine.Equip/Core/Stat.cs

````csharp
namespace Spine.Equip;

public abstract class Stat
{
}
````

## src/Spine.Equip/Core/Stats.cs

````csharp
namespace Spine.Equip;

public struct Pool
{
    public float Flat;
    public float Ratio;

    public Pool(float basis)
    {
        Flat = basis;
        Ratio = 1f;
    }

    public void Add(float value) => Flat += value;

    public void Mul(float value) => Ratio *= value;

    public readonly float Final => Flat * Ratio;
}

public sealed class Stats
{
    private readonly Dictionary<Type, Pool> pools = new();

    internal void Reset(IReadOnlyList<KeyValuePair<Stat, float>> basis)
    {
        pools.Clear();
        foreach (var pair in basis) pools[pair.Key.GetType()] = new Pool(pair.Value);
    }

    internal void Apply(IReadOnlyList<Mod> mods)
    {
        foreach (var mod in mods)
        {
            var key = mod.Stat.GetType();
            if (!pools.TryGetValue(key, out var pool)) pool = new Pool(0f);
            pool.Add(mod.Add);
            pool.Mul(mod.Mul);
            pools[key] = pool;
        }
    }

    public Pool Pool<T>() where T : Stat
    {
        if (pools.TryGetValue(typeof(T), out var pool)) return pool;
        return new Pool(0f);
    }

    public float Get<T>() where T : Stat => Pool<T>().Final;
}
````

## src/Spine.Equip/Load/Catalogue.cs

````csharp
using System.Text.Json;

namespace Spine.Equip;

public sealed class Catalogue
{
    public Registry<Slot> Slots { get; } = new();

    public Registry<ItemKind> Kinds { get; } = new();

    public Registry<Stat> Stats { get; } = new();

    public Registry<Job> Jobs { get; } = new();

    public Registry<Func<JsonElement, Requirement?>> Requires { get; } = new();

    public static Catalogue Default()
    {
        var catalogue = new Catalogue();
        catalogue.Slots.Add("weapon", new Weapon());
        catalogue.Slots.Add("armor", new Armor());
        catalogue.Slots.Add("trinket", new Trinket());
        catalogue.Kinds.Add("sword", new Sword());
        catalogue.Kinds.Add("plate", new Plate());
        catalogue.Kinds.Add("robe", new Robe());
        catalogue.Kinds.Add("ring", new Ring());
        catalogue.Stats.Add("attack", new Attack());
        catalogue.Stats.Add("defense", new Defense());
        catalogue.Jobs.Add("warrior", new Warrior());
        catalogue.Jobs.Add("mage", new Mage());
        catalogue.Requires.Add("level_min", element => new MinLevel(element.GetInt32()));
        catalogue.Requires.Add("class", element =>
        {
            if (element.ValueKind != JsonValueKind.String) return null;
            var name = element.GetString()!;
            if (!catalogue.Jobs.Has(name)) return null;
            return new ClassOnly(catalogue.Jobs.Get(name));
        });
        return catalogue;
    }
}
````

## src/Spine.Equip/Load/Loader.cs

````csharp
using System.Text.Json;

namespace Spine.Equip;

public sealed class Loader
{
    private readonly Catalogue catalogue;

    public Loader(Catalogue catalogue) => this.catalogue = catalogue;

    public World Load(string path) => LoadText(File.ReadAllText(path));

    public World LoadText(string json)
    {
        var world = new World();
        var root = JsonDocument.Parse(json).RootElement;
        var sets = ReadSets(root, world);
        ReadItems(root, world, sets);
        ReadCharacters(root, world);
        return world;
    }

    private Dictionary<string, Set> ReadSets(JsonElement root, World world)
    {
        var sets = new Dictionary<string, Set>();
        foreach (var row in Rows(root, "sets", world))
        {
            var id = Text(row, "id");
            if (id == null)
            {
                world.Note("error: set row has no id");
                continue;
            }
            if (sets.ContainsKey(id))
            {
                world.Note("error: duplicate set id " + id);
                continue;
            }
            try
            {
                var pieces = (int)Number(row, "pieces", 0f, "set " + id);
                if (pieces <= 0)
                {
                    world.Note("error: set " + id + " has no valid pieces");
                    continue;
                }
                var mods = ReadMods(row, world, "set " + id);
                if (mods == null) continue;
                sets.Add(id, new Set(pieces, mods));
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
        return sets;
    }

    private void ReadItems(JsonElement root, World world, Dictionary<string, Set> sets)
    {
        foreach (var row in Rows(root, "items", world))
        {
            try
            {
                ReadItem(row, world, sets);
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
    }

    private void ReadItem(JsonElement row, World world, Dictionary<string, Set> sets)
    {
        var id = Text(row, "id");
        if (id == null)
        {
            world.Note("error: item row has no id");
            return;
        }
        if (world.HasItem(id))
        {
            world.Note("error: duplicate item id " + id);
            return;
        }
        var name = Text(row, "kind");
        if (name == null)
        {
            world.Note("error: item " + id + " has no kind");
            return;
        }
        if (!catalogue.Kinds.Has(name))
        {
            world.Note("warning: item " + id + " uses unregistered kind " + name);
            return;
        }
        var mods = ReadMods(row, world, "item " + id);
        if (mods == null) return;
        var requires = ReadRequires(row, world, "item " + id);
        if (requires == null) return;
        if (!ReadSet(row, world, sets, id, out var set)) return;
        world.Add(id, new Item(catalogue.Kinds.Get(name), mods, requires, set));
    }

    private void ReadCharacters(JsonElement root, World world)
    {
        foreach (var row in Rows(root, "characters", world))
        {
            try
            {
                ReadCharacter(row, world);
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
    }

    private void ReadCharacter(JsonElement row, World world)
    {
        var id = Text(row, "id");
        if (id == null)
        {
            world.Note("error: character row has no id");
            return;
        }
        if (world.HasCharacter(id))
        {
            world.Note("error: duplicate character id " + id);
            return;
        }
        var name = Text(row, "job");
        if (name == null)
        {
            world.Note("error: character " + id + " has no job");
            return;
        }
        if (!catalogue.Jobs.Has(name))
        {
            world.Note("warning: character " + id + " uses unregistered job " + name);
            return;
        }
        var level = (int)Number(row, "level", 0f, "character " + id);
        if (level < 1)
        {
            world.Note("error: character " + id + " has no valid level");
            return;
        }
        var slots = ReadSlots(row, world, id);
        if (slots == null) return;
        var basis = ReadBasis(row, world, id);
        if (basis == null) return;
        world.Add(id, new Character(level, catalogue.Jobs.Get(name), slots, basis));
    }

    private List<Slot>? ReadSlots(JsonElement row, World world, string id)
    {
        var slots = new List<Slot>();
        if (!row.TryGetProperty("slots", out var value)) return slots;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: character " + id + " has slots that are not an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.String)
            {
                world.Note("error: character " + id + " has a slot that is not a name");
                return null;
            }
            var name = entry.GetString()!;
            if (!catalogue.Slots.Has(name))
            {
                world.Note("warning: character " + id + " uses unregistered slot " + name);
                return null;
            }
            var slot = catalogue.Slots.Get(name);
            if (slots.Contains(slot))
            {
                world.Note("error: character " + id + " lists slot " + name + " twice");
                return null;
            }
            slots.Add(slot);
        }
        return slots;
    }

    private List<KeyValuePair<Stat, float>>? ReadBasis(JsonElement row, World world, string id)
    {
        var basis = new List<KeyValuePair<Stat, float>>();
        if (!row.TryGetProperty("basis", out var value)) return basis;
        if (value.ValueKind != JsonValueKind.Object)
        {
            world.Note("error: character " + id + " has a basis that is not an object");
            return null;
        }
        foreach (var property in value.EnumerateObject())
        {
            if (!catalogue.Stats.Has(property.Name))
            {
                world.Note("warning: character " + id + " basis has unregistered stat " + property.Name);
                return null;
            }
            basis.Add(KeyValuePair.Create(catalogue.Stats.Get(property.Name), Value(property.Value, property.Name, "character " + id)));
        }
        return basis;
    }

    private List<Mod>? ReadMods(JsonElement row, World world, string owner)
    {
        var mods = new List<Mod>();
        if (!row.TryGetProperty("mods", out var value)) return mods;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + owner + ": mods must be an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
            {
                world.Note("error: " + owner + " has a mod that is not an object");
                return null;
            }
            var name = Text(entry, "stat");
            if (name == null)
            {
                world.Note("error: " + owner + " has a mod without stat");
                return null;
            }
            if (!catalogue.Stats.Has(name))
            {
                world.Note("warning: " + owner + " mods unregistered stat " + name);
                return null;
            }
            mods.Add(new Mod(
                catalogue.Stats.Get(name),
                Number(entry, "add", 0f, owner),
                Number(entry, "mul", 1f, owner)));
        }
        return mods;
    }

    private List<Requirement>? ReadRequires(JsonElement row, World world, string owner)
    {
        var requires = new List<Requirement>();
        if (!row.TryGetProperty("requires", out var value)) return requires;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + owner + ": requires must be an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
            {
                world.Note("error: " + owner + " has a requirement that is not an object");
                return null;
            }
            foreach (var property in entry.EnumerateObject())
            {
                if (!catalogue.Requires.Has(property.Name))
                {
                    world.Note("warning: " + owner + " requires unregistered " + property.Name);
                    return null;
                }
                var requirement = catalogue.Requires.Get(property.Name).Invoke(property.Value);
                if (requirement == null)
                {
                    world.Note("warning: " + owner + " requires " + property.Name + " " + property.Value + ", which is not registered");
                    return null;
                }
                requires.Add(requirement);
            }
        }
        return requires;
    }

    private static bool ReadSet(JsonElement row, World world, Dictionary<string, Set> sets, string id, out Set? set)
    {
        set = null;
        if (!row.TryGetProperty("set", out var value)) return true;
        if (value.ValueKind != JsonValueKind.String)
        {
            world.Note("error: item " + id + " has a set that is not a name");
            return false;
        }
        var name = value.GetString()!;
        if (!sets.TryGetValue(name, out var found))
        {
            world.Note("error: item " + id + " references unknown set " + name);
            return false;
        }
        set = found;
        return true;
    }

    private static List<JsonElement> Rows(JsonElement root, string name, World world)
    {
        var rows = new List<JsonElement>();
        if (!root.TryGetProperty(name, out var value)) return rows;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + name + " must be an array");
            return rows;
        }
        foreach (var row in value.EnumerateArray()) rows.Add(row);
        return rows;
    }

    private static string? Text(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.String) return null;
        return value.GetString();
    }

    private static float Number(JsonElement row, string name, float fallback, string owner)
    {
        if (!row.TryGetProperty(name, out var value)) return fallback;
        return Value(value, name, owner);
    }

    private static float Value(JsonElement value, string name, string owner)
    {
        if (value.ValueKind != JsonValueKind.Number) throw new FormatException(owner + ": " + name + " is not a number");
        return value.GetSingle();
    }

    private static bool Expected(Exception error) =>
        error is FormatException or InvalidOperationException or ArgumentException or KeyNotFoundException;
}
````

## src/Spine.Equip/Load/Registry.cs

````csharp
namespace Spine.Equip;

public sealed class Registry<T>
{
    private readonly Dictionary<string, T> map = new();

    public void Add(string name, T value)
    {
        if (map.ContainsKey(name)) throw new InvalidOperationException("already registered: " + name);
        map[name] = value;
    }

    public bool Has(string name) => map.ContainsKey(name);

    public T Get(string name)
    {
        if (map.TryGetValue(name, out var value)) return value;
        throw new KeyNotFoundException("not registered: " + name);
    }
}
````

## src/Spine.Equip/Load/World.cs

````csharp
namespace Spine.Equip;

public sealed class World
{
    private readonly Dictionary<string, Item> items = new();
    private readonly Dictionary<string, Character> characters = new();
    private readonly List<string> diagnostics = new();

    public Scene Scene { get; } = new();

    public IReadOnlyList<string> Diagnostics => diagnostics;

    public Item Item(string id)
    {
        if (items.TryGetValue(id, out var item)) return item;
        throw new KeyNotFoundException("no such item: " + id);
    }

    public Character Character(string id)
    {
        if (characters.TryGetValue(id, out var character)) return character;
        throw new KeyNotFoundException("no such character: " + id);
    }

    public bool HasItem(string id) => items.ContainsKey(id);

    public bool HasCharacter(string id) => characters.ContainsKey(id);

    internal void Note(string message) => diagnostics.Add(message);

    internal void Add(string id, Item item) => items.Add(id, item);

    internal void Add(string id, Character character)
    {
        characters.Add(id, character);
        Scene.Add(character);
    }
}
````

## src/Spine.Equip/Spine.Equip.csproj

````xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <RootNamespace>Spine.Equip</RootNamespace>
    <AssemblyName>Spine.Equip</AssemblyName>
  </PropertyGroup>

</Project>
````

## src/Spine.Equip/Variants/Jobs.cs

````csharp
namespace Spine.Equip;

public sealed class Warrior : Job
{
}

public sealed class Mage : Job
{
}
````

## src/Spine.Equip/Variants/Kinds.cs

````csharp
namespace Spine.Equip;

public sealed class Sword : Weapon.Kind
{
}

public sealed class Plate : Armor.Kind
{
}

public sealed class Robe : Armor.Kind
{
}

public sealed class Ring : Trinket.Kind
{
}
````

## src/Spine.Equip/Variants/Requirements.cs

````csharp
namespace Spine.Equip;

public sealed class MinLevel : Requirement
{
    private readonly int level;

    public MinLevel(int level) => this.level = level;

    public override bool Met(Wearer wearer) => wearer.Level >= level;
}

public sealed class ClassOnly : Requirement
{
    private readonly Job job;

    public ClassOnly(Job job) => this.job = job;

    public override bool Met(Wearer wearer) => job.GetType().IsInstanceOfType(wearer.Job);
}
````

## src/Spine.Equip/Variants/Slots.cs

````csharp
namespace Spine.Equip;

public sealed class Weapon : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Armor : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Trinket : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}
````

## src/Spine.Equip/Variants/Stats.cs

````csharp
namespace Spine.Equip;

public sealed class Attack : Stat
{
}

public sealed class Defense : Stat
{
}
````


