$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Resolve-Path (Join-Path $projectRoot '..\..')
$localDotnet = Join-Path $workspaceRoot 'work\dotnet\dotnet.exe'
$dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
$dotnetPath = if ($dotnetCommand) { $dotnetCommand.Source } elseif (Test-Path $localDotnet) { $localDotnet } else { throw 'Instale o .NET 10 SDK ou use o SDK local em work\dotnet.' }

$workRoot = Join-Path $workspaceRoot 'work'
$env:DOTNET_ROOT = Split-Path -Parent $dotnetPath
$env:DOTNET_CLI_HOME = Join-Path $workRoot 'dotnet-home'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:NUGET_PACKAGES = Join-Path $workRoot 'nuget-packages'
$env:NUGET_HTTP_CACHE_PATH = Join-Path $workRoot 'nuget-http-cache'
$env:APPDATA = Join-Path $workRoot 'appdata'
New-Item -ItemType Directory -Force -Path $env:DOTNET_CLI_HOME, $env:NUGET_PACKAGES, $env:NUGET_HTTP_CACHE_PATH, $env:APPDATA | Out-Null

$bridgeProject = Join-Path $projectRoot 'native\notification-bridge\NotificationBridge.csproj'
$publishDirectory = Join-Path $projectRoot 'native\notification-bridge\publish'
$nugetConfig = Join-Path $workRoot 'NuGet.Config'
& $dotnetPath restore $bridgeProject --runtime win-x64 --configfile $nugetConfig
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível restaurar as dependências da ponte de notificações.' }
& $dotnetPath publish $bridgeProject --configuration Release --runtime win-x64 --output $publishDirectory --no-restore
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível compilar a ponte de notificações.' }
