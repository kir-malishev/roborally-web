[CmdletBinding()]
param(
    [ValidateRange(900, 5000)]
    [int]$Size = 1800,
    [string]$Output = ""
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
    $nodeCommand.Source
} else {
    Join-Path $projectRoot "..\demo-server\.tools\node\node.exe"
}

if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw "Node.js не найден ни в PATH, ни в demo-server/.tools/node."
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
