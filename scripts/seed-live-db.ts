/**
 * seed-live-db.ts
 * Seeds the live DB with a test partner using the actual column types.
 * Live partners schema: id, name, email, organisation, therapeuticAreas (JSON), status, createdAt, updatedAt
 */
import mysql from 'mysql2/promise';

async function main() {
  const dsn = process.env.DATABASE_URL!;
  const url = new URL(dsn.replace(/^mysql2?:\/\//, 'mysql://'));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
  console.log('Connected to MySQL');

  // Check if test partner already exists
  const [existing] = await conn.execute(
    "SELECT id FROM `partners` WHERE email = ? LIMIT 1",
    ['partner@sandbox.test']
  ) as any;

  if ((existing as any[]).length > 0) {
    console.log(`~ Test partner already exists (id=${(existing as any[])[0].id})`);
  } else {
    // therapeuticAreas is a JSON column — must pass a JSON array string
    const therapeuticAreas = JSON.stringify(['cardiovascular', 'neurological', 'metabolic']);
    await conn.execute(
      "INSERT INTO `partners` (name, email, organisation, therapeuticAreas, status) VALUES (?,?,?,?,?)",
      ['Sandbox Test Partner', 'partner@sandbox.test', 'Sandbox Research Institute',
       therapeuticAreas, 'active']
    );
    const [newRow] = await conn.execute(
      "SELECT id FROM `partners` WHERE email = ? LIMIT 1",
      ['partner@sandbox.test']
    ) as any;
    console.log(`✓ Test partner inserted (id=${(newRow as any[])[0]?.id})`);
  }

  // Verify patentAlerts
  const [alertRows] = await conn.execute('SELECT COUNT(*) as cnt FROM `patentAlerts`') as any;
  console.log(`✓ patentAlerts: ${(alertRows as any[])[0].cnt} rows`);

  // Verify approvalRequests table
  const [arRows] = await conn.execute('SELECT COUNT(*) as cnt FROM `approvalRequests`') as any;
  console.log(`✓ approvalRequests: ${(arRows as any[])[0].cnt} rows`);

  // Show all partners
  const [allPartners] = await conn.execute('SELECT id, name, therapeuticAreas, status FROM `partners`') as any;
  console.log('\nAll partners:');
  for (const p of allPartners as any[]) {
    console.log(`  id=${p.id} name="${p.name}" areas=${JSON.stringify(p.therapeuticAreas)} status=${p.status}`);
  }

  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
