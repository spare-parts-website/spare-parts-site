import 'server-only'

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

export const ADMIN_MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000
export const ADMIN_MFA_ENROLL_TTL_MS = 10 * 60 * 1000
export const ADMIN_MFA_MAX_ATTEMPTS = 5
export const ADMIN_STEP_UP_TTL_MS = 15 * 60 * 1000

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_PERIOD_SECONDS = 30
const TOTP_DIGITS = 6

function rootSecret() {
  const secret = process.env.ADMIN_MFA_ENCRYPTION_KEY || process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_MFA_ENCRYPTION_KEY or AUTH_SECRET is required in production')
  return 'local-development-admin-mfa-key'
}

function encryptionKey() {
  return createHash('sha256').update(`ghyar-market:admin-mfa:v1:${rootSecret()}`).digest()
}

function base32Encode(input: Buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of input) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/[\s-]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of normalized) {
    const index = BASE32.indexOf(char)
    if (index < 0) throw new Error('INVALID_MFA_SECRET')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function equalCode(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function hotp(secret: string, counter: bigint) {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(counter)
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0')
}

export function verifyTotpCode(secret: string, code: string, lastCounter: bigint | null = null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const current = BigInt(Math.floor(now / 1000 / TOTP_PERIOD_SECONDS))
  for (const delta of [-1n, 0n, 1n]) {
    const counter = current + delta
    if (counter < 0n || (lastCounter !== null && counter <= lastCounter)) continue
    if (equalCode(hotp(secret, counter), code)) return counter
  }
  return null
}

export function generateAdminMfaSecret() {
  return base32Encode(randomBytes(20))
}

export function encryptAdminMfaSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function decryptAdminMfaSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(':')
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) throw new Error('INVALID_MFA_SECRET')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

function hashRecoveryCode(value: string) {
  return createHash('sha256').update(`ghyar-market:admin-recovery:v1:${normalizeRecoveryCode(value)}`).digest('hex')
}

export function generateRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10)).slice(0, 16)
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
  })
  return { codes, hashes: codes.map(hashRecoveryCode) }
}

function recoveryHashes(value: string | null) {
  if (!value) return [] as string[]
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return [] as string[]
  }
}

export function adminMfaEnrollmentDetails(secret: string, email: string) {
  const issuer = 'Ghyar Market'
  const label = `${issuer}:${email}`
  const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`
  return { secret, otpauthUri: uri, issuer, account: email }
}

export async function createAdminLoginChallenge(userId: string) {
  const now = new Date()
  await db.adminMfaChallenge.deleteMany({ where: { userId, purpose: 'LOGIN', OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: now } }] } })
  return db.adminMfaChallenge.create({ data: { userId, purpose: 'LOGIN', expiresAt: new Date(Date.now() + ADMIN_MFA_CHALLENGE_TTL_MS) } })
}

export async function verifyAndConsumeAdminMfa(userId: string, rawCode: string) {
  const code = rawCode.trim()
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`admin-mfa:${userId}`}))`
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, adminMfaSecret: true, adminMfaEnabledAt: true, adminMfaRecoveryCodes: true, adminMfaLastCounter: true },
    })
    if (!user || user.role !== 'ADMIN' || !user.adminMfaSecret || !user.adminMfaEnabledAt) throw new Error('MFA_NOT_CONFIGURED')

    if (/^\d{6}$/.test(code)) {
      const secret = decryptAdminMfaSecret(user.adminMfaSecret)
      const counter = verifyTotpCode(secret, code, user.adminMfaLastCounter)
      if (counter === null) throw new Error('INVALID_MFA_CODE')
      await tx.user.update({ where: { id: userId }, data: { adminMfaLastCounter: counter } })
      return { method: 'totp' as const }
    }

    const normalized = normalizeRecoveryCode(code)
    if (normalized.length !== 16) throw new Error('INVALID_MFA_CODE')
    const candidate = hashRecoveryCode(normalized)
    const hashes = recoveryHashes(user.adminMfaRecoveryCodes)
    const index = hashes.findIndex((hash) => equalCode(hash, candidate))
    if (index < 0) throw new Error('INVALID_MFA_CODE')
    hashes.splice(index, 1)
    await tx.user.update({ where: { id: userId }, data: { adminMfaRecoveryCodes: JSON.stringify(hashes) } })
    return { method: 'recovery' as const, remainingRecoveryCodes: hashes.length }
  })
}
