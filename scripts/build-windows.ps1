param(
  [string]$CefRoot = $env:CEF_ROOT,
  [switch]$Launch
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $CefRoot) {
  $cefHome = 'F:\Nexora-CEF'
  if (Test-Path $cefHome) {
    $cefPackage = Get-ChildItem -LiteralPath $cefHome -Directory -Filter 'cef_binary_*windows64' |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($cefPackage) {
      $CefRoot = $cefPackage.FullName
    }
  }
}
if (-not $CefRoot -or -not (Test-Path (Join-Path $CefRoot 'Release\libcef.lib'))) {
  throw 'CEF Windows x64 was not found. Pass -CefRoot or set the CEF_ROOT environment variable.'
}
$CefRoot = (Resolve-Path $CefRoot).Path

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
  $vswhereCommand = Get-Command vswhere.exe -ErrorAction SilentlyContinue
  if ($vswhereCommand) {
    $vswhere = $vswhereCommand.Source
  }
}
if (-not (Test-Path $vswhere)) {
  throw 'Visual Studio Installer vswhere.exe was not found; install the C++ desktop build workload first.'
}
$vsPath = (& $vswhere -latest -products '*' -property installationPath | Select-Object -First 1).Trim()
if (-not $vsPath) {
  throw 'Visual Studio installation was not found.'
}
$cmake = Join-Path $vsPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
if (-not (Test-Path $cmake)) {
  throw "CMake was not found in the Visual Studio installation: $cmake"
}

Push-Location $projectRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw 'The Vite production build failed.'
  }

  $buildDirectory = Join-Path $projectRoot 'build\windows'
  & $cmake -S $projectRoot -B $buildDirectory -G 'Visual Studio 18 2026' -A x64 "-DCEF_ROOT=$CefRoot"
  if ($LASTEXITCODE -ne 0) {
    throw 'CMake configuration failed. Confirm the installed Visual Studio generator and CEF version.'
  }

  & $cmake --build $buildDirectory --config Release --target nexora
  if ($LASTEXITCODE -ne 0) {
    throw 'The native CEF build failed.'
  }

  $releaseDirectory = Join-Path $buildDirectory 'Release'
  $executable = Join-Path $releaseDirectory 'nexora.exe'
  $clientLibrary = Join-Path $releaseDirectory 'nexora.dll'
  if (-not (Test-Path $executable)) {
    throw "The build completed without producing the expected CEF bootstrap executable: $executable"
  }
  if (-not (Test-Path $clientLibrary)) {
    throw "The build completed without producing the sandboxed Nexora client library: $clientLibrary"
  }
  Write-Host "Nexora Browser built: $executable"
  Write-Host "Sandboxed CEF client: $clientLibrary"
  if ($Launch) {
    Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable)
  }
} finally {
  Pop-Location
}
