export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function shell(title: string, body: string, preview: string) {
  const safeTitle = escapeEmailHtml(title)
  const safePreview = escapeEmailHtml(preview)
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${safeTitle}</title></head><body style="margin:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><span style="display:none;max-height:0;overflow:hidden;color:#f1f5f9;font-size:1px;line-height:1px">${safePreview}</span><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center" style="padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:18px;overflow:hidden"><tr><td bgcolor="#07111f" style="background-color:#07111f;padding-top:22px;padding-right:28px;padding-bottom:22px;padding-left:28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;font-weight:800">غيار ماركت<br><span style="color:#00c768;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:700">قطعك أقرب مما تتخيل</span></td></tr><tr><td style="padding-top:30px;padding-right:28px;padding-bottom:30px;padding-left:28px">${body}</td></tr><tr><td bgcolor="#f8fafc" style="background-color:#f8fafc;padding-top:16px;padding-right:28px;padding-bottom:16px;padding-left:28px;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px">هذه رسالة خدمية من غيار ماركت. لا ترسل كلمة المرور أو رمز الدخول لأي شخص.</td></tr></table></td></tr></table></body></html>`
}

export function notificationEmailHtml(input: { title: string; message: string }) {
  const title = escapeEmailHtml(input.title)
  const message = escapeEmailHtml(input.message)
  return shell(input.title, `<h1 style="margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:32px;font-weight:800">${title}</h1><p style="margin:0;color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:30px">${message}</p><p style="margin-top:24px;margin-right:0;margin-bottom:0;margin-left:0;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px">يمكنك إدارة رسائل البريد من ملفك الشخصي في غيار ماركت.</p>`, input.message)
}

export function loginCodeEmailHtml(input: { name: string; code: string }) {
  const name = escapeEmailHtml(input.name)
  const code = escapeEmailHtml(input.code)
  return shell('رمز التحقق لتسجيل الدخول', `<h1 style="margin-top:0;margin-right:0;margin-bottom:12px;margin-left:0;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:32px;font-weight:800">مرحباً ${name}</h1><p style="margin:0;color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:28px">استخدم الرمز التالي لإكمال تسجيل الدخول إلى حسابك:</p><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:24px;margin-bottom:24px"><tr><td dir="ltr" align="center" bgcolor="#eefbf6" style="background-color:#eefbf6;border-color:#9ee8cb;border-style:solid;border-width:1px;border-radius:14px;padding-top:18px;padding-right:10px;padding-bottom:18px;padding-left:10px;color:#07111f;font-family:Arial,Helvetica,sans-serif;font-size:38px;line-height:48px;font-weight:900;letter-spacing:12px">${code}</td></tr></table><p style="margin:0;color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:26px">ينتهي الرمز خلال 10 دقائق ويمكن استخدامه مرة واحدة فقط. إذا لم تحاول تسجيل الدخول، تجاهل الرسالة.</p>`, `رمز تسجيل الدخول الخاص بك هو ${input.code}`)
}
