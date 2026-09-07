import 'server-only'
import { hkdfSync } from 'crypto'

export type CryptoPurpose = 'session' | 'login-challenge' | 'password-reset' | 'email-change' | 'admin-mfa' | 'security-telemetry'

function rootSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'local-development-only-change-me'
}

export function purposeSecret(purpose: CryptoPurpose) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(rootSecret()), Buffer.alloc(0), Buffer.from(`ghyar-market/${purpose}/v1`), 32))
}
