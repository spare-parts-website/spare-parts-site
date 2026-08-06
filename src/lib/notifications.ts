import { db } from '@/lib/db'

export async function createNotification(input: {
  userId: string
  title: string
  message: string
  type?: string
  link?: string
}) {
  return db.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type || 'SYSTEM',
      link: input.link || null,
    },
  })
}
