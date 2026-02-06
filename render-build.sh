#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install

echo "==> Building client..."
npx vite build --mode production

echo "==> Building server..."
npx tsc -p tsconfig.server.json

echo "==> Pushing database schema..."
npx drizzle-kit push --force

echo "==> Build complete!"
