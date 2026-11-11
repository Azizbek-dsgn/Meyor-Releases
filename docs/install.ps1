# Hustler - Windows installer without browser warnings.
# PowerShell downloads the file itself, so Edge / SmartScreen do not stop it; the file is checked
# with the SHA-256 from the official catalog before it runs.
#   irm https://azizbek-dsgn.github.io/Meyor-Releases/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$catalog = Invoke-RestMethod 'https://raw.githubusercontent.com/Azizbek-dsgn/Meyor-Releases/main/catalog.json'
$asset = $catalog.meyor.assets.'win-x64'
if (-not $asset) { throw 'Windows paketi topilmadi.' }
$file = Join-Path $env:TEMP ('Hustler-' + $catalog.meyor.version + '-setup.exe')
Write-Host ('Hustler ' + $catalog.meyor.version + ' yuklanmoqda (' + [math]::Round($asset.bytes / 1MB) + ' MB)...')
Invoke-WebRequest -UseBasicParsing -Uri $asset.url -OutFile $file
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLower() -ne $asset.sha256) {
  Remove-Item -LiteralPath $file -Force
  throw 'Yuklangan fayl tekshiruvdan o''tmadi. Qayta urinib ko''ring.'
}
Get-Process -Name 'Hustler', 'Meyor' -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'O''rnatilmoqda...'
Start-Process -FilePath $file -ArgumentList '/S', '--force-run' -Wait
Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
Write-Host 'Tayyor: Hustler ochildi.' -ForegroundColor Green
