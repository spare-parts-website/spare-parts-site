# إعداد أمان الإنتاج

يجب إنشاء المتغيرات التالية في Vercel لبيئة **Production**. لا تحفظ أي قيمة سرية داخل Git، ولا تستخدم بادئة `NEXT_PUBLIC_` معها.

| المتغير | الاستخدام |
| --- | --- |
| `AUTH_SECRET` | توقيع جلسات المستخدمين. تغييره يسجل خروج الجميع. |
| `INTERNAL_NOTIFY_SECRET` | حماية `POST /api/notify`. |
| `HEALTHCHECK_SECRET` | حماية `GET /api/health`. |
| `DATABASE_URL` | اتصال التطبيق بقاعدة Supabase/PostgreSQL. |
| `DIRECT_URL` | الاتصال المباشر الذي تستخدمه Prisma. |
| `SUPABASE_URL` | عنوان مشروع Supabase، للخادم فقط في هذا التطبيق. |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح رفع الملفات من الخادم فقط. |
| `RESEND_API_KEY` | إرسال الرسائل البريدية من الخادم. |
| `NOTIFICATION_FROM_EMAIL` | مرسل موثق لإشعارات السوق على نطاق `ghyarmarket-eg.com`. |
| `AUTH_FROM_EMAIL` | مرسل رموز تسجيل الدخول؛ يمكنه الرجوع إلى متغير الإشعارات. |
| `APP_URL` | الرابط العام الثابت للموقع، ويستخدم لإنشاء روابط استعادة كلمة المرور، مثل `https://ghyarmarket-eg.com`. |

## نقاط التحقق قبل النشر

1. أنشئ قيماً عشوائية طويلة للمتغيرات السرية الثلاثة الأولى.
2. تأكد أن كل متغير موجود في Production قبل إعادة النشر.
3. راقب الصحة باستخدام `Authorization: Bearer <HEALTHCHECK_SECRET>`؛ أي طلب آخر يحصل على `404`.
4. أبقِ RLS مفعلاً على كل جداول `public` بدون سياسات عامة، لأن التطبيق يستخدم Prisma وجلساته الخاصة وليس Supabase Auth.
5. لا تضف Paymob أو أي أسرار دفع ضمن إصدار إعادة التصميم.
