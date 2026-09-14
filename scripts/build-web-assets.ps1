param(
    [int]$Size = 1200,
    [int]$Quality = 82
)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path (Split-Path -Parent $projectDir) "Roborally"
$outputDir = Join-Path $projectDir "public\assets\boards"
$boardsDir = Get-ChildItem -LiteralPath $sourceDir -Directory | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName "Cross.png")
} | Select-Object -First 1 -ExpandProperty FullName

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw "ffmpeg was not found in PATH."
}
if (-not $boardsDir) {
    throw "The source board directory was not found below $sourceDir"
}

$startFiles = @(Get-ChildItem -LiteralPath $boardsDir -File -Filter "*.jpg" | Sort-Object Name)
$markerFile = Get-ChildItem -LiteralPath $sourceDir -Recurse -File -Filter "*.jpg" |
    Where-Object { $_.DirectoryName -ne $boardsDir -and $_.BaseName -match '^0 ' } |
    Select-Object -First 1 -ExpandProperty FullName
if ($startFiles.Count -lt 2 -or -not $markerFile) { throw "Start cards or marker sheet were not found." }

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$assets = @(
    @{Input = Join-Path $boardsDir "Cross.png"; Output = "cross.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "Spin.png"; Output = "spin.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "Chess.png"; Output = "chess.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "ChopShop.png"; Output = "chop-shop.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "exchange.png"; Output = "risky-exchange.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "Island.png"; Output = "island.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "Maelstrom.png"; Output = "maelstrom.webp"; Width = $Size},
    @{Input = Join-Path $boardsDir "Vault.png"; Output = "vault.webp"; Width = $Size},
    @{Input = $startFiles[0].FullName; Output = "start-1.webp"; Width = $Size},
    @{Input = $startFiles[1].FullName; Output = "start-2.webp"; Width = $Size},
    @{Input = $markerFile; Output = "markers.webp"; Width = $Size}
)

foreach ($asset in $assets) {
    $destination = Join-Path $outputDir $asset.Output
    & ffmpeg -hide_banner -loglevel error -y -i $asset.Input -vf "scale=$($asset.Width):-2" -c:v libwebp -quality $Quality -compression_level 6 $destination
    if ($LASTEXITCODE -ne 0) { throw "Failed to create $destination" }
    $file = Get-Item -LiteralPath $destination
    Write-Host ("{0,-22} {1,8:N0} KB" -f $file.Name, ($file.Length / 1KB))
}
