import { Pool } from "pg";

const globalDb = globalThis as unknown as { noversePool?: Pool };
export const pool =
  globalDb.noversePool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://noverse:noverse@127.0.0.1:55439/noverse",
    max: 5,
    connectionTimeoutMillis: 5000,
  });
globalDb.noversePool = pool;
export const columns = `id, title, revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
