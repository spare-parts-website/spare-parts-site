import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

// Keep exactly one Prisma client per warm function isolate. This is especially
// important with Fluid Compute, where several concurrent requests can share a
// process and therefore the same application-side connection pool.
globalForPrisma.prisma = db
