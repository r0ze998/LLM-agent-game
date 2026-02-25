// Database connection — currently unused.
// The game runs entirely in-memory. This file exists as a placeholder
// for future PostgreSQL persistence via Drizzle ORM.
//
// To enable: install postgres, create the 'murasato' database,
// run `bun run db:push`, then uncomment the code below.

// import { drizzle } from 'drizzle-orm/postgres-js';
// import postgres from 'postgres';
// import * as schema from './schema.ts';
//
// const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/murasato';
// const client = postgres(connectionString);
// export const db = drizzle(client, { schema });
