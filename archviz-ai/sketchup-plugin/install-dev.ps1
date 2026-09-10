param([string]$SketchUpVersion = '2026')
$ErrorActionPreference = 'Stop'
if ($SketchUpVersion -notmatch '^20\d{2}$') { throw 'Versão inválida.' }
$pluginSource = [IO.Path]::GetFullPath($PSScriptRoot)
$pluginsDirectory = Join-Path $env:APPDATA "SketchUp\SketchUp $SketchUpVersion\SketchUp\Plugins"
if (-not (Test-Path -LiteralPath $pluginsDirectory)) { throw 'Diretório Plugins do SketchUp não encontrado.' }
$loader = Join-Path $pluginsDirectory 'archviz_ai.rb'
$moduleDirectory = Join-Path $pluginsDirectory 'archviz_ai'
if ((Test-Path -LiteralPath $loader) -or (Test-Path -LiteralPath $moduleDirectory)) {
    throw 'ArchViz AI já está instalado. Consulte o README antes de substituir ou remover.'
}
Copy-Item -LiteralPath (Join-Path $pluginSource 'archviz_ai.rb') -Destination $loader
try {
    New-Item -ItemType Junction -Path $moduleDirectory -Target (Join-Path $pluginSource 'archviz_ai') | Out-Null
} catch {
    # Only the loader created by this invocation is removed on installation failure.
    Remove-Item -LiteralPath $loader
    throw
}
Write-Output "Extensão instalada para desenvolvimento em $pluginsDirectory"
Write-Output 'Reinicie o SketchUp. Menu Extensions > ArchViz AI.'
