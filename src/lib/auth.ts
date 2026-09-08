import { cache } from 'react'
import { db } from './db'
import bcrypt from 'bcryptjs'
import { cookies, headers } from 'next/headers'
import { createHmac, randomBytes, randomUUID } from 'crypto'
import { ADMIN_STEP_UP_TTL_MS } from '@/lib/admin-mfa'
import { purposeSecret } from '@/lib/crypto-purpose'

export interface SessionUser { id:string; name:string; email:string; role:'BUYER'|'ADMIN'|'SHOP_OWNER'; phone?:string|null; avatar?:string|null; emailNotifications?:boolean; emailDeliveryStatus?:string; emailDeliveryReason?:string|null; emailDeliveryAt?:Date|null; sessionVersion?:number; mfaVerifiedAt?:number|null; sessionId?:string }
type SessionRow={sessionId:string;sessionVersion:number;mfaVerifiedAt:Date|null;expiresAt:Date;id:string;name:string;email:string;role:string;phone:string|null;avatar:string|null;emailNotifications:boolean;emailDeliveryStatus:string;emailDeliveryReason:string|null;emailDeliveryAt:Date|null;userSessionVersion:number;adminMfaEnabledAt:Date|null}
const PROD_SESSION_COOKIE='__Host-ghyar_session';const DEV_SESSION_COOKIE='ghyar_session';const LEGACY_SESSION_COOKIE='spare_parts_session';const SESSION_TTL_SECONDS=60*60*24*7
function cookieName(){return process.env.NODE_ENV==='production'?PROD_SESSION_COOKIE:DEV_SESSION_COOKIE}
function tokenHash(token:string){return createHmac('sha256',purposeSecret('session')).update(token).digest('hex')}
function metadataHash(value:string|null){return value?createHmac('sha256',purposeSecret('security-telemetry')).update(value).digest('hex'):null}
export async function hashPassword(password:string){return bcrypt.hash(password,10)}
export async function verifyPassword(password:string,hash:string){return bcrypt.compare(password,hash)}
export async function createSession(user:SessionUser,request?:Request,replaceSessionId?:string|null):Promise<void>{
  if(user.role==='ADMIN'&&(!user.mfaVerifiedAt||!Number.isFinite(user.mfaVerifiedAt)))throw new Error('ADMIN_MFA_REQUIRED')
  const token=randomBytes(32).toString('base64url');const id=randomUUID();const expiresAt=new Date(Date.now()+SESSION_TTL_SECONDS*1000);const requestHeaders=request?.headers||await headers();const userAgentHash=metadataHash(requestHeaders.get('user-agent'));const forwarded=requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()||requestHeaders.get('x-real-ip');const ipHash=metadataHash(forwarded||null);const mfaVerifiedAt=user.mfaVerifiedAt?new Date(user.mfaVerifiedAt):null
  await db.$transaction(async(tx)=>{if(replaceSessionId)await tx.$executeRaw`DELETE FROM public."Session" WHERE "id"=${replaceSessionId} AND "userId"=${user.id}`;await tx.$executeRaw`INSERT INTO public."Session" ("id","userId","tokenHash","sessionVersion","mfaVerifiedAt","userAgentHash","ipHash","createdAt","lastSeenAt","expiresAt") VALUES (${id},${user.id},${tokenHash(token)},${user.sessionVersion??0},${mfaVerifiedAt},${userAgentHash},${ipHash},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${expiresAt})`})
  const cookieStore=await cookies();cookieStore.set(cookieName(),token,{httpOnly:true,sameSite:'lax',path:'/',secure:process.env.NODE_ENV==='production',maxAge:SESSION_TTL_SECONDS});cookieStore.delete(LEGACY_SESSION_COOKIE)
}
const loadSession=cache(async():Promise<SessionUser|null>=>{const cookieStore=await cookies();const token=cookieStore.get(cookieName())?.value;if(!token||token.length<32||token.length>128)return null;try{const rows=await db.$queryRaw<SessionRow[]>`SELECT s."id" AS "sessionId",s."sessionVersion",s."mfaVerifiedAt",s."expiresAt",u."id",u."name",u."email",u."role",u."phone",u."avatar",u."emailNotifications",u."emailDeliveryStatus",u."emailDeliveryReason",u."emailDeliveryAt",u."sessionVersion" AS "userSessionVersion",u."adminMfaEnabledAt" FROM public."Session" s JOIN public."User" u ON u."id"=s."userId" WHERE s."tokenHash"=${tokenHash(token)} AND s."expiresAt">CURRENT_TIMESTAMP LIMIT 1`;const row=rows[0];if(!row||row.sessionVersion!==row.userSessionVersion)return null;const mfaVerifiedAt=row.mfaVerifiedAt?row.mfaVerifiedAt.getTime():null;if(row.role==='ADMIN'&&(!row.adminMfaEnabledAt||!mfaVerifiedAt))return null;return{id:row.id,name:row.name,email:row.email,role:row.role as SessionUser['role'],phone:row.phone,avatar:row.avatar,emailNotifications:row.emailNotifications,emailDeliveryStatus:row.emailDeliveryStatus,emailDeliveryReason:row.emailDeliveryReason,emailDeliveryAt:row.emailDeliveryAt,sessionVersion:row.userSessionVersion,mfaVerifiedAt,sessionId:row.sessionId}}catch{return null}})
export async function getSession(){return loadSession()}
export async function destroySession(){const cookieStore=await cookies();const token=cookieStore.get(cookieName())?.value;if(token)await db.$executeRaw`DELETE FROM public."Session" WHERE "tokenHash"=${tokenHash(token)}`;cookieStore.delete(cookieName());cookieStore.delete(LEGACY_SESSION_COOKIE)}
export async function revokeOtherSessions(userId:string,keepSessionId?:string|null){if(keepSessionId)return db.$executeRaw`DELETE FROM public."Session" WHERE "userId"=${userId} AND "id"<>${keepSessionId}`;return db.$executeRaw`DELETE FROM public."Session" WHERE "userId"=${userId}`}
export async function requireAuth(){const session=await getSession();if(!session)throw new Error('UNAUTHORIZED');return session}
export async function requireRole(role:SessionUser['role']){const session=await requireAuth();if(session.role!==role)throw new Error('FORBIDDEN');return session}
export async function requireRoles(roles:SessionUser['role'][]){const session=await requireAuth();if(!roles.includes(session.role))throw new Error('FORBIDDEN');return session}
export async function requireAdminStepUp(){const session=await requireRole('ADMIN');if(!session.mfaVerifiedAt||Date.now()-session.mfaVerifiedAt>ADMIN_STEP_UP_TTL_MS)throw new Error('STEP_UP_REQUIRED');return session}
