import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Prisma 7's generated client requires an explicit driver adapter rather
// than an implicit connection-string lookup. Neon's pooled connection
// string works fine over the standard `pg` driver for a normal Node.js
// runtime (no need for Neon's WebSocket serverless adapter unless this
// ends up deployed to an edge runtime).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Standard Next.js dev-mode singleton: without this, hot reload would
// create a fresh PrismaClient (and connection pool) on every file save.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
