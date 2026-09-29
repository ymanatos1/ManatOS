#!/usr/bin/env bash
set -euo pipefail
[ -f api/.env ] || cp api/.env.example api/.env
[ -f ui.EJS0/.env ] || cp ui.EJS0/.env.example ui.EJS0/.env

npm install
npm run build

echo "Initialization complete. Run: npm run dev"
