# Arranca la app en local. Abre la URL que muestre Vite en el navegador (no uses el preview de Cursor).
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Yellow
  npm install
}

if (-not (Test-Path ".env")) {
  Write-Host ""
  Write-Host "AVISO: No hay archivo .env" -ForegroundColor Red
  Write-Host "Copia .env.example a .env y pon tu URL y clave de Supabase." -ForegroundColor Yellow
  Write-Host ""
}

Write-Host ""
Write-Host "Iniciando servidor de desarrollo..." -ForegroundColor Cyan
Write-Host "Cuando aparezca la linea 'Local:', abre ESA direccion en Chrome o Edge." -ForegroundColor Green
Write-Host "(Ejemplo: http://localhost:5173/ o http://localhost:5174/)" -ForegroundColor Green
Write-Host "No uses la pestaña Simple Browser de Cursor si se ve mal." -ForegroundColor Yellow
Write-Host "Pulsa Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

npm run dev
