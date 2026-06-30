/**
 * create-missing-tables.ts
 * Creates approvalRequests and partners tables that are missing from the DB.
 * Uses raw SQL to avoid Drizzle migration conflicts.
 */
import { getDb } from '../server/db';

async function main() {
  const db = await getDb();
  if (!db) { console.error('no db'); process.exit(1); }

  // Access the underlying mysql2 connection via Drizzle's internal client
  // We need to run raw SQL — use the db.$client property
  const client = (db as any).$client;

  const tables = [
    {
      name: 'partners',
      sql: `CREATE TABLE IF NOT EXISTS \`partners\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`email\` varchar(320) NOT NULL,
        \`institution\` varchar(255) NOT NULL DEFAULT '',
        \`therapeuticAreas\` text NOT NULL,
        \`tier\` enum('explorer','developer','accelerator') NOT NULL DEFAULT 'explorer',
        \`agreementAccepted\` int NOT NULL DEFAULT 0,
        \`agreementAcceptedAt\` timestamp,
        \`candidatesDelivered\` int NOT NULL DEFAULT 0,
        \`positiveValidations\` int NOT NULL DEFAULT 0,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`partners_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`partners_email_unique\` UNIQUE(\`email\`)
      )`,
    },
    {
      name: 'approvalRequests',
      sql: `CREATE TABLE IF NOT EXISTS \`approvalRequests\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`gene\` varchar(32) NOT NULL,
        \`patentNumber\` varchar(32),
        \`reason\` varchar(128) NOT NULL,
        \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`confidence\` int NOT NULL DEFAULT 0,
        \`resolvedAt\` timestamp,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`approvalRequests_id\` PRIMARY KEY(\`id\`)
      )`,
    },
  ];

  for (const { name, sql } of tables) {
    try {
      await client.execute(sql);
      console.log(`✓ Table created (or already exists): ${name}`);
    } catch (e) {
      console.error(`✗ Failed to create ${name}:`, (e as Error).message);
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
