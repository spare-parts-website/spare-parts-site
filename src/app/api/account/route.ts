import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, hashPassword, verifyPassword, createSession } from '@/lib/auth'

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : session.name
    const phone = typeof body.phone === 'string' ? body.phone.trim() || null : session.phone || null
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const emailNotifications = typeof body.emailNotifications === 'boolean' ? body.emailNotifications : undefined

    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) return NextResponse.json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    if (newPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.password))) return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: session.id },
      data: { name, phone, ...(emailNotifications !== undefined ? { emailNotifications } : {}), ...(newPassword ? { password: await hashPassword(newPassword) } : {}) },
    })
    await createSession({ id: updated.id, name: updated.name, email: updated.email, role: updated.role as any, phone: updated.phone, emailNotifications: updated.emailNotifications })
    return NextResponse.json({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated.phone, emailNotifications: updated.emailNotifications } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'تعذر تحديث الحساب' }, { status: 500 })
  }
}
