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

echo "==> Pre-creating payment_status enum..."
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
sql\`DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN CREATE TYPE payment_status AS ENUM ('pending','confirmed','cancelled','failed'); END IF; END \$\$\`
  .then(() => { console.log('payment_status enum ready'); return sql.end(); })
  .catch(e => { console.error('payment_status enum error:', e); sql.end(); process.exit(1); });
"

echo "==> Pre-creating new tables to avoid drizzle-kit interactive prompts..."
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
Promise.all([
  sql\`CREATE TABLE IF NOT EXISTS interview_attachments (
    id SERIAL PRIMARY KEY,
    interview_id INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(500) NOT NULL,
    stored_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )\`,
  sql\`ALTER TABLE documents ADD COLUMN IF NOT EXISTS source VARCHAR(100)\`,
])
  .then(() => { console.log('Pre-migration done'); return sql.end(); })
  .catch(e => { console.error('Pre-migration error:', e); sql.end(); process.exit(1); });
"

echo "==> Pre-creating api_call_logs table..."
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
sql\`CREATE TABLE IF NOT EXISTS api_call_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  operation_type VARCHAR(100) NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
)\`
  .then(() => { console.log('api_call_logs ready'); return sql.end(); })
  .catch(e => { console.error('api_call_logs error:', e); sql.end(); process.exit(1); });
"

echo "==> Pushing database schema..."
npx drizzle-kit push --force

echo "==> Build complete!"
