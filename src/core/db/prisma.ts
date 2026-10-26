import 'dotenv/config'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/src/prisma/client/client.js'

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
    pgPool?: pg.Pool;
}
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in environment variables');
}

export const pool = globalForPrisma.pgPool ?? new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000   
})

const adapter  = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}