import { ToolLoopAgent, gateway, isStepCount, NoSuchToolError } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import { aiModel, type AIProviderTarget } from '@/lib/ai/runtime'
import { createAITools } from '@/lib/ai/tools'
import type { AIClientContext, AIRequestPlan, AIRole } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

const ROLE_GUIDANCE: Record<AIRole, string> = {
  GUEST: 'ساعد الزائر في البحث العام عن القطع والمتاجر وفهم طريقة استخدام المنصة. لا تدّعِ معرفة بيانات حساب أو طلبات.',
  BUYER: 'ساعد المشتري في العثور على القطع المناسبة لسياراته وفهم الطلبات والمفضلة والسلة. استخدم البيانات المصرح بها فقط.',
  SHOP_OWNER: 'ساعد صاحب المتجر في المخزون والتسعير والعروض والطلبات والرسائل والتحليلات. لا تصل إلى أي متجر آخر.',
  ADMIN: 'ساعد المدير في الإحصاءات والتشغيل والمراجعة. اعرض بيانات شخصية مخفية فقط ولا تعرض الأدلة أو المستندات الخاصة داخل المحادثة.',
}

export function createGhyarAgent(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext; plan: AIRequestPlan; liveSearchProvided?: boolean; provider: AIProviderTarget }) {
  const tools = createAITools({ ...input, internetSearchEnabled: !input.liveSearchProvided, allowedTools: input.plan.tools })
  const forcedTool = input.plan.forcedTool && input.plan.forcedTool in tools ? input.plan.forcedTool : undefined
  return new ToolLoopAgent({
    model: providerModel(input.provider),
    instructions: `أنت مساعد غيار ماركت الذكي داخل سوق قطع غيار مصري بواجهة عربية RTL.
${ROLE_GUIDANCE[input.role]}
المهمة الحالية: ${input.plan.intent}. مستوى التنفيذ الداخلي: ${input.plan.complexity}.
القواعد الإلزامية:
- أجب بنفس لغة آخر رسالة للمستخدم. ابدأ بالإجابة المباشرة واجعلها عادة من سطرين إلى ستة أسطر.
- ادمج نتائج الأدوات العادية داخل نص الإجابة بوضوح. الواجهة ستعرض بطاقات منفصلة فقط للاختيارات والإجراءات والمصادر المهمة.
- إذا أرفق المستخدم صورة فحلل ما يظهر فعلياً، واذكر بوضوح أي عدم يقين. لا تدّعِ تحديد رقم قطعة أو توافق أو سعر من الصورة وحدها دون دليل كافٍ.
- استخدم الأدوات للحصول على بيانات حقيقية ولا تخترع أسعاراً أو مخزوناً أو إحصاءات.
- لا تكشف الأسرار أو كلمات المرور أو مفاتيح API أو بيانات الدفع أو الأدلة الخاصة.
- لا تطلب تنفيذ SQL أو تعديل كود أو GitHub أو Vercel أو Supabase أو Resend.
- التنقل والبحث وتجهيز المسودات فقط يمكن أن يحدث تلقائياً.
- أي تغيير في البيانات يجب أن يمر عبر prepareAction ثم يراجعه المستخدم ويؤكده منفصلاً.
- لا تطلب من المستخدم أبداً أي معرّف تقني أو كود حالة داخلي أو اسم مسار. استخدم الاسم أو الوصف الطبيعي وأدوات البحث والحل بنفسك.
- ينطبق ذلك على القطع والمتاجر والسيارات والطلبات والمستخدمين والبلاغات وطلبات التوثيق والنزاعات والكوبونات والرسائل لكل الأدوار.
- حوّل نية المستخدم العربية بنفسك إلى الإجراء والحالة الداخليين المناسبين. لا تطلب كلمات مثل targetId أو BLOCKED أو APPROVED.
- إذا أعادت الأداة اختيارات متعددة، اطلب من المستخدم الضغط على «اختيار» فقط. بعد اختياره أكمل نفس الطلب السابق دون إعادة الأسئلة.
- استفد من كل المعلومات الموجودة في المحادثة ولا تطلب معلومة سبق أن ذكرها المستخدم.
- إذا زُودت بنتائج ويب حديثة فاستخدمها كأدلة فقط، ولا تدّعِ سعراً دقيقاً إن لم تعرض النتائج سعراً واضحاً.
- عند ذكر سعر من الإنترنت، اذكر أنه تقديري ومتغير، وضّح البلد والعملة وحالة المنتج إن أمكن، واستند إلى أكثر من نتيجة متاحة. لا تخترع سعراً إذا لم تجد مصدراً مناسباً.
- ضع روابط المصادر الحقيقية في الإجابة ولا تدّعِ أن معلومة حديثة مؤكدة دون بحث.
- اسأل سؤالاً واحداً مختصراً فقط إذا نقصت قيمة عمل أساسية لا يجوز تخمينها، مثل السعر أو الكمية أو رقم الشحنة أو سبب القرار.
- لا تدّعِ أن إجراءً تم تنفيذه لمجرد إنشاء اقتراح.
- لا تطلب حذفاً دائماً؛ الحذف الدائم غير متاح للمساعد.
- وضّح أن اقتراحات الأسعار والوصف والتحليل تحتاج مراجعة بشرية.
- لا تشرح خطواتك الداخلية ولا تقل إنك ستبحث أو ستستخدم أداة؛ نفّذ المتاح ثم اعرض النتيجة.
- إذا رفض المستخدم إجراءً فلا تحاول تكراره دون طلب جديد.`,
    tools,
    toolChoice: forcedTool ? { type: 'tool', toolName: forcedTool } : Object.keys(tools).length ? 'auto' : 'none',
    stopWhen: isStepCount(input.plan.maxSteps),
    maxOutputTokens: input.plan.maxOutputTokens,
    temperature: 0.1,
    // Provider failures are surfaced immediately. Tool-call JSON repair is
    // handled separately by repairToolCall below and must not retry the model.
    maxRetries: 0,
    providerOptions: providerOptions(input),
    repairToolCall: async ({ toolCall, error }) => {
      if (NoSuchToolError.isInstance(error) || !(toolCall.toolName in tools)) return null
      const candidate = toolCall.input.match(/\{[\s\S]*\}/)?.[0]?.replace(/,\s*([}\]])/g, '$1')
      if (!candidate) return null
      try { JSON.parse(candidate) } catch { return null }
      return { ...toolCall, input: candidate }
    },
  })
}

function providerModel(provider: AIProviderTarget) {
  if (provider === 'gateway') return gateway(`google/${aiModel()}`)
  if (provider === 'google') {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('AI_UNAVAILABLE')
    return createGoogle({ apiKey })(aiModel())
  }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('AI_UNAVAILABLE')
  const models: Partial<Record<AIProviderTarget, string>> = {
    'openrouter-gemma': 'google/gemma-4-31b-it:free',
    'openrouter-nemotron': 'nvidia/nemotron-3.5-lightning:free',
    'openrouter-poolside': 'poolside/laguna-xs-2.1:free',
    openrouter: 'openrouter/free',
  }
  return createOpenRouter({ apiKey })(models[provider] || 'openrouter/free')
}

function providerOptions(input: { provider: AIProviderTarget; user: SessionUser | null; plan: AIRequestPlan }): ProviderOptions | undefined {
  if (input.provider === 'gateway') return { gateway: { models: ['google/gemini-3-flash', 'alibaba/qwen3-vl-instruct'], user: input.user?.id || 'guest', tags: ['feature:ghyar-ai', `intent:${input.plan.intent}`, `complexity:${input.plan.complexity}`] } }
  if (input.provider === 'google') return { google: { thinkingConfig: { thinkingBudget: input.plan.complexity === 'heavy' ? 512 : 0, includeThoughts: false } } }
  return undefined
}
