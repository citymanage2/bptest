#!/bin/bash
set -e

echo "==> Installing dependencies (including dev)..."
npm install --include=dev

echo "==> Building client..."
npx vite build --mode production

echo "==> Building server..."
npx tsc -p tsconfig.server.json

echo "==> Clearing recommendations table for schema migration..."
node -e "
(async () => {
  const postgres = require('postgres');
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql\\\`TRUNCATE TABLE recommendations CASCADE\\\`;
    console.log('Recommendations table cleared');
  } catch(e) {
    console.log('Table might not exist yet, continuing...', e.message);
  }
  await sql.end();
})();
"

echo "==> Pushing database schema..."
npx drizzle-kit push --force

echo "==> Build complete!"
