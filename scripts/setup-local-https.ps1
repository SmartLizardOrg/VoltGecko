param([string]$LanAddress)
$ErrorActionPreference = 'Stop'
$plannerRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Host 'A mkcert nincs telepitve. Telepites: winget install FiloSottile.mkcert'
  Write-Host 'Ezutan futtasd ujra ezt a szkriptet. A mkcert helyi CA-t hoz letre a gepen.'
  exit 1
}
if (-not $LanAddress) {
  $plannerAddresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|Docker|WSL' } | Select-Object -ExpandProperty IPAddress)
  if ($plannerAddresses.Count -eq 1) { $LanAddress = $plannerAddresses[0] }
  else { Write-Host 'Add meg a gep helyi halozati cimet: scripts/setup-local-https.ps1 -LanAddress 192.168.1.10'; exit 1 }
}
$plannerAddressValue = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$plannerAddressValue)) { throw 'Ervenytelen IP-cim.' }
$plannerCertDir = Join-Path $plannerRoot '.cert'
New-Item -ItemType Directory -Path $plannerCertDir -Force | Out-Null
& mkcert -install
if ($LASTEXITCODE -ne 0) { throw 'A helyi CA telepitese nem sikerult.' }
& mkcert -cert-file (Join-Path $plannerCertDir 'localhost.pem') -key-file (Join-Path $plannerCertDir 'localhost-key.pem') localhost 127.0.0.1 ::1 $LanAddress
if ($LASTEXITCODE -ne 0) { throw 'A tanusitvany keszitese nem sikerult.' }
Write-Host "Elonezet: npm run build, majd npm run preview:https"
Write-Host "Telefonon: https://${LanAddress}:4173"
Write-Host 'A telefonra csak a mkcert -CAROOT mappaban levo rootCA.pem kerulhet; a rootCA-key.pem titkos, ne masold at.'
