import { db } from './db'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
import { ADMIN_STEP_UP_TTL_MS } from '@/lib/admin-mfa'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: 'BUYER' | 'ADMIN' | 'SHOP_OWNER'
  phone?: string | null
  avatar?: string | null
  emailNotifications?: boolean
  emailDeliveryStatus?: string
  emailDeliveryReason?: string | null
  emailDeliveryAt?: Date | null
  sessionVersion?: number
  mfaVerifiedAt?: number | null
}

const SESSION_COOKIE = 'spare_parts_session'
const TOKEN_VERSION = 'v3:'

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'local-development-only-change-me'
}

function sign(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(user: SessionUser): Promise<void> {
  if (user.role === 'ADMIN' && (!user.mfaVerifiedAt || !Number.isFinite(user.mfaVerifiedAt))) {
    throw new Error('ADMIN_MFA_REQUIRED')
  }
  const cookieStore = await cookies()
  const payload = Buffer.from(JSON.stringify({ ...user, sessionVersion: user.sessionVersion ?? 0, mfaVerifiedAt: user.mfaVerifiedAt ?? null })).toString('base64url')
  const unsigned = TOKEN_VERSION + payload
  cookieStore.set(SESSION_COOKIE, `${unsigned}.${sign(unsigned)}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const separator = token.lastIndexOf('.')
    if (separator <= TOKEN_VERSION.length) return null
    const unsigned = token.slice(0, separator)
    const signature = token.slice(separator + 1)
    if (!unsigned.startsWith(TOKEN_VERSION)) return null
    const expected = sign(unsigned)
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null
    const decoded = JSON.parse(Buffer.from(unsigned.slice(TOKEN_VERSION.length), 'base64url').toString('utf-8'))
    const user = await db.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, name: true, email: true, role: true, phone: true, avatar: true,
        emailNotifications: true, emailDeliveryStatus: true, emailDeliveryReason: true,
        emailDeliveryAt: true, sessionVersion: true, adminMfaEnabledAt: true,
      },
    })
    if (!user || (decoded.sessionVersion ?? 0) !== user.sessionVersion) return null
    const mfaVerifiedAt = typeof decoded.mfaVerifiedAt === 'number' && Number.isFinite(decoded.mfaVerifiedAt) ? decoded.mfaVerifiedAt : null
    if (user.role === 'ADMIN' && (!user.adminMfaEnabledAt || !mfaVerifiedAt)) return null
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as SessionUser['role'],
      phone: user.phone,
      avatar: user.avatar,
      emailNotifications: user.emailNotifications,
      emailDeliveryStatus: user.emailDeliveryStatus,
      emailDeliveryReason: user.emailDeliveryReason,
      emailDeliveryAt: user.emailDeliveryAt,
      sessionVersion: user.sessionVersion,
      mfaVerifiedAt,
    }
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHORIZED')
  return session
}

export async function requireRole(role: SessionUser['role']): Promise<SessionUser> {
  const session = await requireAuth()
  if (session.role !== role) throw new Error('FORBIDDEN')
  return session
}

export async function requireRoles(roles: SessionUser['role'][]): Promise<SessionUser> {
  const session = await requireAuth()
  if (!roles.includes(session.role)) throw new Error('FORBIDDEN')
  return session
}

export async function requireAdminStepUp(): Promise<SessionUser> {
  const session = await requireRole('ADMIN')
  if (!session.mfaVerifiedAt || Date.now() - session.mfaVerifiedAt > ADMIN_STEP_UP_TTL_MS) throw new Error('STEP_UP_REQUIRED')
  return session
}
