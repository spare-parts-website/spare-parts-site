import 'server-only'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { privateImagePath } from '@/lib/private-image'

export type ProtectedPurpose = 'chat' | 'evidence' | 'verification' | 'ai' | 'public'
type ObjectRow = { id:string; storagePath:string; bucket:string; ownerId:string; purpose:string; resourceType:string|null; resourceId:string|null; status:string; deleteAfter:Date|null }

export async function registerUploadedObject(input:{storagePath:string;bucket:string;ownerId:string;purpose:ProtectedPurpose;temporaryForMs?:number}){
  const deleteAfter=new Date(Date.now()+(input.temporaryForMs??24*60*60_000))
  await db.$executeRaw`INSERT INTO public."ProtectedObject" ("id","storagePath","bucket","ownerId","purpose","status","deleteAfter","createdAt","updatedAt") VALUES (${randomUUID()},${input.storagePath},${input.bucket},${input.ownerId},${input.purpose},'TEMPORARY',${deleteAfter},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("storagePath") DO UPDATE SET "ownerId"=EXCLUDED."ownerId","purpose"=EXCLUDED."purpose","updatedAt"=CURRENT_TIMESTAMP`
}

export async function attachUploadedObject(url:unknown,input:{ownerId:string;resourceType:string;resourceId:string}){
  const path=privateImagePath(url);if(!path)return false
  const count=await db.$executeRaw`UPDATE public."ProtectedObject" SET "status"='ATTACHED',"resourceType"=${input.resourceType},"resourceId"=${input.resourceId},"deleteAfter"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "storagePath"=${path} AND "ownerId"=${input.ownerId} AND "status"<>'DELETED'`
  return Number(count)>0
}

export async function lookupProtectedObject(path:string){const rows=await db.$queryRaw<ObjectRow[]>`SELECT "id","storagePath","bucket","ownerId","purpose","resourceType","resourceId","status","deleteAfter" FROM public."ProtectedObject" WHERE "storagePath"=${path} AND "status"<>'DELETED' LIMIT 1`;return rows[0]||null}

export async function attachLegacyProtectedObject(path:string,input:{ownerId:string;purpose:string;resourceType:string;resourceId:string}){
  await db.$executeRaw`INSERT INTO public."ProtectedObject" ("id","storagePath","bucket","ownerId","purpose","resourceType","resourceId","status","deleteAfter","createdAt","updatedAt") VALUES (${randomUUID()},${path},'protected-uploads',${input.ownerId},${input.purpose},${input.resourceType},${input.resourceId},'ATTACHED',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("storagePath") DO UPDATE SET "ownerId"=EXCLUDED."ownerId","purpose"=EXCLUDED."purpose","resourceType"=EXCLUDED."resourceType","resourceId"=EXCLUDED."resourceId","status"='ATTACHED',"deleteAfter"=NULL,"updatedAt"=CURRENT_TIMESTAMP`
}

export async function markObjectDeletion(bucket:string,path:string){
  await db.$executeRaw`INSERT INTO public."ProtectedObject" ("id","storagePath","bucket","ownerId","purpose","status","deleteAfter","createdAt","updatedAt") VALUES (${randomUUID()},${path},${bucket},'system','public','DELETION_PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("storagePath") DO UPDATE SET "bucket"=EXCLUDED."bucket","status"='DELETION_PENDING',"deleteAfter"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`
}

export async function processObjectLifecycle(limit=100){
  await db.$executeRaw`UPDATE public."ProtectedObject" SET "status"='DELETION_PENDING',"updatedAt"=CURRENT_TIMESTAMP WHERE "status"='TEMPORARY' AND "deleteAfter" IS NOT NULL AND "deleteAfter"<CURRENT_TIMESTAMP`
  const rows=await db.$queryRaw<Array<{id:string;storagePath:string;bucket:string}>>`SELECT "id","storagePath","bucket" FROM public."ProtectedObject" WHERE "status"='DELETION_PENDING' ORDER BY "updatedAt" ASC LIMIT ${limit}`
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!key)return{deleted:0,pending:rows.length}
  let deleted=0
  for(const row of rows){try{const response=await fetch(`${base}/storage/v1/object/${encodeURIComponent(row.bucket)}/${row.storagePath.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`,apikey:key}});if(response.ok||response.status===404){await db.$executeRaw`UPDATE public."ProtectedObject" SET "status"='DELETED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;deleted++}}catch{}}
  return{deleted,pending:rows.length-deleted}
}
