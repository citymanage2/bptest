#!/bin/bash
set -e

echo "==> Installing dependencies (including dev)..."
npm install --include=dev

echo "==> Building client..."
npx vite build --mode production

echo "==> Building server..."
npx tsc -p tsconfig.server.json

echo "==> Pre-migration: enums, tables, and enum column casts..."
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function createEnumIfNotExists(name, values) {
  await sql\`DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = \${name}) THEN EXECUTE 'CREATE TYPE ' || \${name} || ' AS ENUM (' || \${values.map(v => \"'\" + v + \"'\").join(',') } || ')'; END IF; END \$\$\`;
}

async function castColumnToEnum(table, column, enumType) {
  const rows = await sql\`SELECT data_type FROM information_schema.columns WHERE table_name = \${table} AND column_name = \${column}\`;
  if (rows.length > 0 && rows[0].data_type !== 'USER-DEFINED') {
    await sql\`ALTER TABLE \${sql(table)} ALTER COLUMN \${sql(column)} TYPE \${sql(enumType)} USING \${sql(column)}::\${sql(enumType)}\`;
    console.log('cast', table + '.' + column, '->', enumType);
  }
}

async function run() {
  // Create all enums
  await sql\`DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('user','admin'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_mode') THEN CREATE TYPE interview_mode AS ENUM ('full','express'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_status') THEN CREATE TYPE interview_status AS ENUM ('draft','completed'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'process_status') THEN CREATE TYPE process_status AS ENUM ('draft','active','archived'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_request_status') THEN CREATE TYPE change_request_status AS ENUM ('pending','applied','rejected'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_priority') THEN CREATE TYPE recommendation_priority AS ENUM ('high','medium','low'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_chat_status') THEN CREATE TYPE support_chat_status AS ENUM ('open','closed'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_role') THEN CREATE TYPE sender_role AS ENUM ('user','admin'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'token_operation_type') THEN CREATE TYPE token_operation_type AS ENUM ('generation','regeneration','change_request','recommendations','transcription','topup','file_upload'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_type') THEN CREATE TYPE consent_type AS ENUM ('privacy_policy','personal_data','cookie_policy','marketing'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_action') THEN CREATE TYPE consent_action AS ENUM ('granted','revoked'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN CREATE TYPE payment_status AS ENUM ('pending','confirmed','cancelled','failed'); END IF;
  END \$\$\`;
  console.log('All enums ready');

  // Pre-create tables
  await sql\`CREATE TABLE IF NOT EXISTS interview_attachments (
    id SERIAL PRIMARY KEY,
    interview_id INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(500) NOT NULL,
    stored_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )\`;
  await sql\`ALTER TABLE documents ADD COLUMN IF NOT EXISTS source VARCHAR(100)\`;
  await sql\`CREATE TABLE IF NOT EXISTS api_call_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    operation_type VARCHAR(100) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )\`;
  console.log('Tables ready');

  // Cast all enum columns that may still be text/varchar
  const casts = [
    ['users',           'role',        'user_role'],
    ['interviews',      'mode',        'interview_mode'],
    ['interviews',      'status',      'interview_status'],
    ['processes',       'status',      'process_status'],
    ['change_requests', 'status',      'change_request_status'],
    ['recommendations', 'priority',    'recommendation_priority'],
    ['support_chats',   'status',      'support_chat_status'],
    ['support_messages','sender_role', 'sender_role'],
    ['token_operations','type',        'token_operation_type'],
    ['payments',        'status',      'payment_status'],
  ];
  for (const [table, col, enumType] of casts) {
    const rows = await sql\`SELECT data_type FROM information_schema.columns WHERE table_name = \${table} AND column_name = \${col}\`;
    if (rows.length > 0 && rows[0].data_type !== 'USER-DEFINED') {
      await sql.unsafe('ALTER TABLE ' + table + ' ALTER COLUMN ' + col + ' TYPE ' + enumType + ' USING ' + col + '::' + enumType);
      console.log('cast', table + '.' + col, '->', enumType);
    }
  }
  console.log('Column casts done');

  // Clean up orphaned rows that would block FK constraint creation/validation during table recreation
  const cleanups = [
    'DELETE FROM interview_attachments WHERE interview_id NOT IN (SELECT id FROM interviews)',
    'DELETE FROM interview_attachments WHERE company_id NOT IN (SELECT id FROM companies)',
    'DELETE FROM interview_attachments WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM legal_attachments WHERE legal_document_id NOT IN (SELECT id FROM legal_documents)',
    'DELETE FROM payments WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM token_operations WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM user_consents WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM cookie_consents WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM business_models WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM kpi_plans WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM legal_documents WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM regulations WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM block_files WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM support_messages WHERE sender_id NOT IN (SELECT id FROM users)',
    'DELETE FROM support_chats WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM companies WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM interviews WHERE company_id NOT IN (SELECT id FROM companies)',
    'DELETE FROM processes WHERE company_id NOT IN (SELECT id FROM companies)',
  ];
  for (const q of cleanups) {
    try { await sql.unsafe(q); } catch(e) { /* table may not exist yet */ }
  }
  console.log('Orphaned rows cleaned');

  // Normalize emails to lowercase (fix case-sensitivity login issues)
  await sql\`UPDATE users SET email = lower(email) WHERE email != lower(email)\`;
  console.log('Emails normalized to lowercase');

  // Fix consent_type enum: add new values if missing (old DB had 'data_processing','marketing' only)
  await sql\`ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'privacy_policy'\`;
  await sql\`ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'personal_data'\`;
  await sql\`ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'cookie_policy'\`;
  console.log('consent_type enum values ensured');

  await sql.end();
}
run().catch(e => { console.error('Pre-migration error:', e); process.exit(1); });
"

echo "==> Pushing database schema..."
npx drizzle-kit push --force

echo "==> Build complete!"
