$ErrorActionPreference = "Stop"
if (Get-Command nvm -ErrorAction SilentlyContinue) {
  $version = Get-Content ".nvmrc"
  nvm install $version
  nvm use $version
}
if (!(Test-Path "api/.env")) { Copy-Item "api/.env.example" "api/.env" }
if (!(Test-Path "ui/.env"))  { Copy-Item "ui/.env.example" "ui/.env" }
npm install
npm run build
Write-Host "Initialization complete. Run: npm run dev"
