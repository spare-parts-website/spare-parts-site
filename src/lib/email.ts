// Email notifications use Resend when configured. The development fallback logs
// a warning instead of pretending that an email was delivered.

interface EmailParams {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail({ to, subject, html, text }: EmailParams): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      console.warn('Email not sent: configure RESEND_API_KEY and EMAIL_FROM.')
      return false
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })
    if (!response.ok) {
      console.error('Email provider rejected message:', response.status, await response.text())
      return false
    }
    return true
  } catch (e) {
    console.error('Email send error:', e)
    return false
  }
}

// Email templates
export const emailTemplates = {
  orderApproved: (buyerName: string, partName: string, storeName: string, orderId: string) => ({
    subject: 'تمت الموافقة على طلبك ✅',
    text: `مرحباً ${buyerName}،

وافق ${storeName} على طلبك لـ "${partName}".
يمكنك الآن الدفع لإتمام الطلب.

رقم الطلب: ${orderId}

شكراً لك،
فريق قطع غيار`,
    html: `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0d9488;">تمت الموافقة على طلبك ✅</h2>
  <p>مرحباً ${buyerName}،</p>
  <p>وافق <strong>${storeName}</strong> على طلبك لـ <strong>"${partName}"</strong>.</p>
  <p>يمكنك الآن الدفع لإتمام الطلب.</p>
  <p>رقم الطلب: <code>${orderId}</code></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">فريق قطع غيار</p>
</div>`,
  }),

  orderDelivered: (buyerName: string, partName: string, orderId: string) => ({
    subject: 'تم توصيل طلبك 🚚',
    text: `مرحباً ${buyerName}،

تم توصيل "${partName}" بنجاح.
يمكنك تقييم المنتج أو طلب الاسترجاع خلال 14 يوم.

رقم الطلب: ${orderId}

شكراً لك،
فريق قطع غيار`,
    html: `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0d9488;">تم توصيل طلبك 🚚</h2>
  <p>مرحباً ${buyerName}،</p>
  <p>تم توصيل <strong>"${partName}"</strong> بنجاح.</p>
  <p>يمكنك تقييم المنتج أو طلب الاسترجاع خلال 14 يوم.</p>
  <p>رقم الطلب: <code>${orderId}</code></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">فريق قطع غيار</p>
</div>`,
  }),

  newOrder: (ownerName: string, buyerName: string, partName: string, quantity: number, totalPrice: number, orderId: string) => ({
    subject: 'طلب جديد 🛒',
    text: `مرحباً ${ownerName}،

طلب جديد من ${buyerName}:
- القطعة: ${partName}
- الكمية: ${quantity}
- الإجمالي: ${totalPrice} ج.م

رقم الطلب: ${orderId}

يرجى مراجعة الطلب والموافقة عليه في أقرب وقت.

فريق قطع غيار`,
    html: `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0d9488;">طلب جديد 🛒</h2>
  <p>مرحباً ${ownerName}،</p>
  <p>طلب جديد من <strong>${buyerName}</strong>:</p>
  <ul>
    <li>القطعة: ${partName}</li>
    <li>الكمية: ${quantity}</li>
    <li>الإجمالي: ${totalPrice} ج.م</li>
  </ul>
  <p>رقم الطلب: <code>${orderId}</code></p>
  <p>يرجى مراجعة الطلب والموافقة عليه في أقرب وقت.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">فريق قطع غيار</p>
</div>`,
  }),

  paymentReceived: (ownerName: string, buyerName: string, partName: string, amount: number, orderId: string) => ({
    subject: 'تم استلام دفعة 💰',
    text: `مرحباً ${ownerName}،

تم استلام دفعة من ${buyerName}:
- القطعة: ${partName}
- المبلغ: ${amount} ج.م
- رقم الطلب: ${orderId}

يرجى تجهيز القطعة للتوصيل.

فريق قطع غيار`,
    html: `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0d9488;">تم استلام دفعة 💰</h2>
  <p>مرحباً ${ownerName}،</p>
  <p>تم استلام دفعة من <strong>${buyerName}</strong>:</p>
  <ul>
    <li>القطعة: ${partName}</li>
    <li>المبلغ: ${amount} ج.م</li>
    <li>رقم الطلب: ${orderId}</li>
  </ul>
  <p>يرجى تجهيز القطعة للتوصيل.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">فريق قطع غيار</p>
</div>`,
  }),
}
