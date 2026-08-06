const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running this script.')
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('ADMIN_EMAIL is invalid.')
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.')

  const passwordHash = await bcrypt.hash(password, 12)
  const existing = await db.user.findUnique({ where: { email } })

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', password: passwordHash },
    })
    console.log(`Admin access updated for ${email}.`)
    return
  }

  await db.user.create({
    data: {
      name: 'مدير المنصة',
      email,
      password: passwordHash,
      role: 'ADMIN',
    },
  })
  console.log(`Admin account created for ${email}.`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
