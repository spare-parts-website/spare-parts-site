import { db } from '../src/lib/db'

async function check() {
  const parts = await db.part.findMany({ select: { name: true, price: true } })
  console.log(JSON.stringify(parts, null, 2))
}

check().finally(() => db.$disconnect())
