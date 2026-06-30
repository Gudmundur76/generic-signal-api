/**
 * create-tables-raw.ts
 * Uses the raw mysql2 pool directly to create missing tables and verify.
 */
import mysql from 'mysql2/promise';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  // Parse mysql:// or mysql2:// URL
  const url = new URL(connectionString!.replace(/^mysql2?:\/\//, 'mysql://'));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connected to MySQL');

  const sqls = [
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
        \`agreementAcceptedAt\` timestamp NULL,
        \`candidatesDelivered\` int NOT NULL DEFAULT 0,
        \`positiveValidations\` int NOT NULL DEFAULT 0,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`partners_email_unique\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'approvalRequests',
      sql: `CREATE TABLE IF NOT EXISTS \`approvalRequests\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`gene\` varchar(32) NOT NULL,
        \`patentNumber\` varchar(32) NULL,
        \`reason\` varchar(128) NOT NULL,
        \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`confidence\` int NOT NULL DEFAULT 0,
        \`resolvedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
  ];

  for (const { name, sql } of sqls) {
    try {
      await conn.execute(sql);
      console.log(`✓ ${name}: created (or already exists)`);
    } catch (e) {
      console.error(`✗ ${name}: ${(e as Error).message}`);
    }
  }

  // Insert test partner
  try {
    const [rows] = await conn.execute('SELECT id FROM `partners` LIMIT 1');
    if ((rows as any[]).length > 0) {
      console.log(`~ partners: test partner already exists (id=${(rows as any[])[0].id})`);
    } else {
      await conn.execute(
        `INSERT INTO \`partners\` (name, email, institution, therapeuticAreas, tier, agreementAccepted, agreementAcceptedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        ['Sandbox Test Partner', 'partner@sandbox.test', 'Sandbox Research Institute',
         'cardiovascular, neurological, metabolic', 'developer', 1]
      );
      console.log('✓ partners: test partner inserted');
    }
  } catch (e) {
    console.error(`✗ partner insert: ${(e as Error).message}`);
  }

  // Verify patentAlerts count
  try {
    const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM `patentAlerts`');
    console.log(`✓ patentAlerts: ${(rows as any[])[0].cnt} rows`);
  } catch (e) {
    console.error(`✗ patentAlerts: ${(e as Error).message}`);
  }

  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
