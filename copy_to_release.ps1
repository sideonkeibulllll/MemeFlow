param(
    [string]$version = $null
)

$projectDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$releaseDir = Join-Path $projectDir "release"
$debugApk = Join-Path $projectDir "android\app\build\outputs\apk\debug\app-debug.apk"
$liteApk = Join-Path $projectDir "android\app\src\main\assets\lite\app-lite.apk"

if (-not (Test-Path $debugApk)) {
    Write-Host "错误: 未找到 APK 文件: $debugApk"
    Write-Host "请先运行: npm run sync:android && node build-lite.js && cd android && .\gradlew.bat assembleDebug"
    exit 1
}

if (-not $version) {
    $packageJson = Join-Path $projectDir "package.json"
    if (Test-Path $packageJson) {
        $jsonContent = Get-Content $packageJson -Raw | ConvertFrom-Json
        $version = $jsonContent.version
    } else {
        $version = "unknown"
    }
}

Write-Host "版本号: $version"
Write-Host "目标目录: $releaseDir"

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$fullDest = Join-Path $releaseDir "meme-random-full-v$version.apk"
Copy-Item $debugApk $fullDest -Force
$fullSize = [math]::Round((Get-Item $fullDest).Length / 1MB, 2)
Write-Host "已复制: meme-random-full-v$version.apk ($fullSize MB)"

if (Test-Path $liteApk) {
    $liteDest = Join-Path $releaseDir "meme-random-lite-v$version.apk"
    Copy-Item $liteApk $liteDest -Force
    $liteSize = [math]::Round((Get-Item $liteDest).Length / 1MB, 2)
    Write-Host "已复制: meme-random-lite-v$version.apk ($liteSize MB)"
} else {
    Write-Host "注意: 未找到 Lite APK ($liteApk)"
}

Write-Host ""
Write-Host "=== release 目录内容 ==="
Get-ChildItem $releaseDir -Filter "*.apk" | Sort-Object LastWriteTime -Descending | Select-Object Name, @{Name='SizeMB';Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime