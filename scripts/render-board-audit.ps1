[CmdletBinding()]
param(
    [ValidateRange(900, 5000)]
    [int]$Size = 1800,
    [string]$Output = ""
)

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node.js 20 или новее не найден в PATH."
}
$nodePath = $nodeCommand.Source
$nodeVersion = & $nodePath -p "process.versions.node"
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -split '\.')[0] -lt 20) {
    throw "Для аудита полей требуется Node.js 20 или новее."
}

$env:AUDIT_SIZE = [string]$Size
if ($Output) {
    $env:AUDIT_OUTPUT = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
} else {
    Remove-Item Env:AUDIT_OUTPUT -ErrorAction SilentlyContinue
}

& $nodePath (Join-Path $PSScriptRoot "render-board-audit.js")
if ($LASTEXITCODE -ne 0) {
    throw "Не удалось создать изображения аудита (код $LASTEXITCODE)."
}
