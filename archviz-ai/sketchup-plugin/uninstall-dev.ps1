param([string]$SketchUpVersion = '2026')
$ErrorActionPreference = 'Stop'
if ($SketchUpVersion -notmatch '^20\d{2}$') { throw 'Invalid version.' }
$pluginsDirectory = [IO.Path]::GetFullPath((Join-Path $env:APPDATA "SketchUp\SketchUp $SketchUpVersion\SketchUp\Plugins"))
$moduleDirectory = Join-Path $pluginsDirectory 'archviz_ai'
$loader = Join-Path $pluginsDirectory 'archviz_ai.rb'
$expectedTarget = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'archviz_ai'))
if (Test-Path -LiteralPath $moduleDirectory) {
    $link = Get-Item -LiteralPath $moduleDirectory
    if ($link.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath($link.Target[0]) -ne $expectedTarget) {
        throw 'This is not the development junction for this checkout. Nothing removed.'
    }
    # Non-recursive removal of the verified junction itself, never its target.
    [IO.Directory]::Delete($moduleDirectory)
}
if (Test-Path -LiteralPath $loader) {
    if ((Get-FileHash -LiteralPath $loader).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'archviz_ai.rb')).Hash) {
        throw 'The loader differs from this checkout. Remove it manually after review.'
    }
    Remove-Item -LiteralPath $loader
}
Write-Output 'Development extension removed. Restart SketchUp. Repository files were preserved.'
