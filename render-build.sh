#!/bin/bash
set -e

echo "==> Installing dependencies (including dev)..."
npm install --include=dev

echo "==> Building client..."
npx vite build --mode production

echo "==> Building server..."
npx tsc -p tsconfig.server.json

echo "==> Ensuring enums exist..."
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
sql\`DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('user', 'admin'); END IF; END \$\$\`
  .then(() => { console.log('Enum check done'); return sql.end(); })
  .catch(e => { console.error('Enum error:', e); sql.end(); process.exit(1); });
"

echo "==> Pushing database schema..."
printf '\n' | npx drizzle-kit push --force

echo "==> Build complete!"
