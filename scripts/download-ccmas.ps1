param(
    [string]$OutputDirectory = "tmp/pdfs/ccmas",
    [string]$SourceManifest = "data/ccmas/sources.json"
)

$ErrorActionPreference = "Stop"
$outputPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$sources = Get-Content -LiteralPath $SourceManifest -Raw | ConvertFrom-Json
foreach ($source in $sources) {
    $destination = Join-Path $outputPath $source.file
    if ((Test-Path -LiteralPath $destination) -and (Get-Item -LiteralPath $destination).Length -gt 1024) {
        Write-Output "Already downloaded: $($source.name)"
        continue
    }
    Write-Output "Downloading: $($source.name)"
    try {
        Invoke-WebRequest -Uri $source.url -OutFile $destination
    }
    catch {
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Force
        }
        throw
    }
}

Write-Output "CCMAS source files are available in $outputPath"
