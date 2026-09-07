import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL or DIRECT_URL is required')

mkdirSync('.tmp', { recursive: true })
const baseline = '.tmp/prisma-baseline.sql'
const sql = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', shell: process.platform === 'win32' })
writeFileSync(baseline, sql)
execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', baseline], { stdio: 'inherit' })

// Supabase projects provide these roles. CI uses a plain PostgreSQL service, so
// create non-login stand-ins before replaying Supabase-specific GRANT/REVOKE SQL.
const supabaseRoles = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$$;
`
execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', supabaseRoles], { stdio: 'inherit' })

const directory = 'supabase/migrations'
if (existsSync(directory)) {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    console.log(`Applying ${file}`)
    execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', join(directory, file)], { stdio: 'inherit' })
  }
}
