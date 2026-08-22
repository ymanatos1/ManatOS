#!/usr/bin/env bash
set -euo pipefail
[ -f api/.env ] || cp api/.env.example api/.env
[ -f ui/.env ] || cp ui/.env.example ui/.env

npm install
npm run build

echo "Initialization complete. Run: npm run dev"
