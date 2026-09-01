import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { decideActionProposal } from '@/lib/ai/actions'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const limit = await rateLimit(`ai-action:${user.id}:${requestAddress(request)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await request.json() as { proposalId?: unknown; approved?: unknown }
    if (typeof body.proposalId !== 'string' || typeof body.approved !== 'boolean') return NextResponse.json({ error: 'بيانات التأكيد غير صحيحة' }, { status: 400 })
    return NextResponse.json(await decideActionProposal({ proposalId: body.proposalId, user, approved: body.approved }))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const errors: Record<string, [string, number]> = { UNAUTHORIZED: ['غير مصرح', 401], ACTION_FORBIDDEN: ['هذا الإجراء غير متاح لصلاحية حسابك', 403], PROPOSAL_NOT_FOUND: ['الاقتراح غير موجود', 404], PROPOSAL_ALREADY_DECIDED: ['تم اتخاذ قرار بشأن هذا الاقتراح بالفعل', 409], PROPOSAL_EXPIRED: ['انتهت صلاحية الاقتراح. اطلب اقتراحاً جديداً.', 410], INVALID_ACTION_INPUT: ['تغيرت البيانات أو لم تعد صالحة. اطلب اقتراحاً جديداً.', 409], ACTION_STALE: ['تغيرت حالة السجل منذ إنشاء الاقتراح. اطلب اقتراحاً جديداً.', 409], ORDER_CHANGED: ['تم تحديث الطلب من مستخدم آخر. أعد المحاولة.', 409], COUPON_EXISTS: ['كود الكوبون مستخدم بالفعل. اطلب كوداً آخر.', 409], LAST_ADMIN: ['يجب أن يبقى مدير واحد على الأقل', 409], STORE_ROLE_CONFLICT: ['لا يمكن تغيير دور صاحب متجر قائم', 409] }
    const mapped = errors[message] || ['تعذر تنفيذ الإجراء بأمان. لم يتم حفظ أي تغيير.', 500]
    console.error('AI action failed:', error)
    return NextResponse.json({ error: mapped[0] }, { status: mapped[1] })
  }
}
