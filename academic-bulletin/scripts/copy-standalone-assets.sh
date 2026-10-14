#!/usr/bin/env bash
# ==============================================================================
# Synchronize static assets (.next/static, public, .env) into .next/standalone
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

STANDALONE_DIR="${APP_DIR}/.next/standalone"

if [ ! -d "${STANDALONE_DIR}" ]; then
  echo "⚠️  .next/standalone directory not found. Skipping asset copy."
  exit 0
fi

echo "📦 [Standalone Assets] Copying static files into .next/standalone..."

# 1. Copy .next/static
if [ -d "${APP_DIR}/.next/static" ]; then
  mkdir -p "${STANDALONE_DIR}/.next/static"
  cp -r "${APP_DIR}/.next/static/." "${STANDALONE_DIR}/.next/static/"
  echo "✅ Copied .next/static -> .next/standalone/.next/static"
fi

# 2. Copy public directory
if [ -d "${APP_DIR}/public" ]; then
  mkdir -p "${STANDALONE_DIR}/public"
  cp -r "${APP_DIR}/public/." "${STANDALONE_DIR}/public/"
  echo "✅ Copied public -> .next/standalone/public"
fi

# 3. Copy .env file
if [ -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env" "${STANDALONE_DIR}/.env"
  echo "✅ Copied .env -> .next/standalone/.env"
elif [ -f "${APP_DIR}/../.env" ]; then
  cp "${APP_DIR}/../.env" "${STANDALONE_DIR}/.env"
  echo "✅ Copied ../.env -> .next/standalone/.env"
fi

echo "✨ [Standalone Assets] Assets synchronized successfully!"

