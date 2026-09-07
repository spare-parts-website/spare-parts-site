import 'server-only'
import { queueEmailOutbox } from '@/lib/email-outbox'
import { getTransactionalSender } from '@/lib/email-sender'
import { accountSecurityEmailHtml } from '@/lib/email-templates'
import { normalizeRecipientEmail } from '@/lib/email-deliverability'

export async function queueAccountSecurityNotice(input:{userId:string;email:string;name:string;event:string;message:string}){const from=getTransactionalSender(process.env.AUTH_FROM_EMAIL,process.env.NOTIFICATION_FROM_EMAIL);if(!from)return false;return queueEmailOutbox({deliveryKey:`security/${input.event}/${input.userId}/${Date.now()}`,category:'AUTHENTICATION',recipientUserId:input.userId,recipientEmail:normalizeRecipientEmail(input.email),fromEmail:from,subject:`غيار ماركت: ${input.event}`,text:`${input.message}\n\nإذا لم تنفذ هذا الإجراء، غيّر كلمة المرور وتواصل مع الدعم فوراً.`,html:accountSecurityEmailHtml({name:input.name,title:input.event,message:input.message})})}
