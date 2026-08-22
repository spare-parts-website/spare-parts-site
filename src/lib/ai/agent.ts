import { ToolLoopAgent, isStepCount } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { AI_MODEL } from '@/lib/ai/runtime'
import { createAITools } from '@/lib/ai/tools'
import type { AIClientContext, AIRole } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

const ROLE_GUIDANCE: Record<AIRole, string> = {
  GUEST: 'ساعد الزائر في البحث العام عن القطع والمتاجر وفهم طريقة استخدام المنصة. لا تدّعِ معرفة بيانات حساب أو طلبات.',
  BUYER: 'ساعد المشتري في العثور على القطع المناسبة لسياراته وفهم الطلبات والمفضلة والسلة. استخدم البيانات المصرح بها فقط.',
  SHOP_OWNER: 'ساعد صاحب المتجر في المخزون والتسعير والعروض والطلبات والرسائل والتحليلات. لا تصل إلى أي متجر آخر.',
  ADMIN: 'ساعد المدير في الإحصاءات والتشغيل والمراجعة. اعرض بيانات شخصية مخفية فقط ولا تعرض الأدلة أو المستندات الخاصة داخل المحادثة.',
}

export function createGhyarAgent(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext }) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('AI_UNAVAILABLE')
  const openrouter = createOpenRouter({ apiKey })
  return new ToolLoopAgent({
    model: openrouter(AI_MODEL),
    instructions: `أنت مساعد غيار ماركت الذكي داخل سوق قطع غيار مصري بواجهة عربية RTL.
${ROLE_GUIDANCE[input.role]}
القواعد الإلزامية:
- أجب بالعربية المصرية الواضحة، واختصر ما لم يطلب المستخدم تفاصيل.
- استخدم الأدوات للحصول على بيانات حقيقية ولا تخترع أسعاراً أو مخزوناً أو إحصاءات.
- لا تكشف الأسرار أو كلمات المرور أو مفاتيح API أو بيانات الدفع أو الأدلة الخاصة.
- لا تطلب تنفيذ SQL أو تعديل كود أو GitHub أو Vercel أو Supabase أو Resend.
- التنقل والبحث وتجهيز المسودات فقط يمكن أن يحدث تلقائياً.
- أي تغيير في البيانات يجب أن يمر عبر prepareAction ثم يراجعه المستخدم ويؤكده منفصلاً.
- لا تدّعِ أن إجراءً تم تنفيذه لمجرد إنشاء اقتراح.
- لا تطلب حذفاً دائماً؛ الحذف الدائم غير متاح للمساعد.
- وضّح أن اقتراحات الأسعار والوصف والتحليل تحتاج مراجعة بشرية.
- إذا رفض المستخدم إجراءً فلا تحاول تكراره دون طلب جديد.`,
    tools: createAITools(input),
    stopWhen: isStepCount(5),
    maxOutputTokens: 1200,
    temperature: 0.2,
  })
}
