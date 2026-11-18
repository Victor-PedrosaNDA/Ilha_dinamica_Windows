$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Resolve-Path (Join-Path $projectRoot '..\..')
$workRoot = Join-Path $workspaceRoot 'work'
$env:ELECTRON_CACHE = Join-Path $workRoot 'electron-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $workRoot 'electron-builder-cache'
New-Item -ItemType Directory -Force -Path $env:ELECTRON_CACHE, $env:ELECTRON_BUILDER_CACHE | Out-Null

Push-Location $projectRoot
try {
  npm run build:notification-bridge
  if ($LASTEXITCODE -ne 0) { throw 'A ponte nativa não foi compilada; o MSIX não foi gerado.' }
  & (Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd') --win appx
  if ($LASTEXITCODE -ne 0) { throw 'O Electron Builder não conseguiu gerar o pacote MSIX.' }
} finally {
  Pop-Location
}
