#!/bin/bash
set -e

echo "==> Installing dependencies (including dev)..."
npm install --include=dev

echo "==> Building client..."
npx vite build --mode production

echo "==> Building server..."
npx tsc -p tsconfig.server.json

echo "==> Clearing recommendations table for schema migration..."
node scripts/clear-recommendations.js

echo "==> Pushing database schema..."
npx drizzle-kit push --force

echo "==> Build complete!"
