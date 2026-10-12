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
