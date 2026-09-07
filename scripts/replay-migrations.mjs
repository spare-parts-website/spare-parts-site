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

const directory = 'supabase/migrations'
if (existsSync(directory)) {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    console.log(`Applying ${file}`)
    execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', join(directory, file)], { stdio: 'inherit' })
  }
}
