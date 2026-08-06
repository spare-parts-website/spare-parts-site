// Simple email notification system
// In production, integrate with a service like SendGrid, Resend, or AWS SES
// For now, this logs emails to console and stores them in DB as a backup

interface EmailParams {
  to: string
  subject: string
  html: string
  text: string
}

// In-memory queue for emails (would be a real queue in production)
const emailQueue: EmailParams[] = []

export async function sendEmail({ to, subject, html, text }: EmailParams): Promise<boolean> {
  try {
    // Log the email (in production, send via SMTP/API)
    console.log(`
========== EMAIL ==========
To: ${to}
Subject: ${subject}
Body: ${text}
===========================
`)

    // Add to queue (would be processed by a background worker)
    emailQueue.push({ to, subject, html, text })

    // In production, you would do something like:
    // await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{ to: [{ email: to }] }],
    //     from: { email: 'noreply@spareparts.com' },
    //     subject,
    //     content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
    //   }),
    // })

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
