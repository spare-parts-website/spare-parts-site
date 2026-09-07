import 'server-only'
import { createHash } from 'crypto'

export async function isBreachedPassword(password:string){
  const digest=createHash('sha1').update(password,'utf8').digest('hex').toUpperCase();const prefix=digest.slice(0,5);const suffix=digest.slice(5)
  try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),3000);const response=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`,{signal:controller.signal,headers:{'Add-Padding':'true','User-Agent':'GhyarMarket-Security'}});clearTimeout(timeout);if(!response.ok)return false;const text=await response.text();return text.split('\n').some(line=>line.split(':')[0]?.trim()===suffix)}catch{return false}
}
