import { db } from '../src/lib/db'
import { readdir } from 'fs/promises'
import path from 'path'

async function check() {
  console.log('=== Parts in DB ===')
  const parts = await db.part.findMany({ select: { id: true, name: true, image: true } })
  console.log(JSON.stringify(parts, null, 2))

  console.log('\n=== Files in public/uploads ===')
  try {
    const files = await readdir(path.join(process.cwd(), 'public', 'uploads'))
    console.log(files)
  } catch (e) {
    console.log('Error reading uploads:', e)
  }

  console.log('\n=== Stores ===')
  const stores = await db.store.findMany({ select: { id: true, name: true, image: true } })
  console.log(JSON.stringify(stores, null, 2))
}

check().finally(() => db.$disconnect())
