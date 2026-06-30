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

  // Describe partners table
  const [cols] = await conn.execute('DESCRIBE `partners`') as any;
  const fields = (cols as any[]).map((c: any) => c.Field);
  console.log('partners columns:', JSON.stringify(fields));

  // Describe approvalRequests table
  const [arCols] = await conn.execute('DESCRIBE `approvalRequests`') as any;
  const arFields = (arCols as any[]).map((c: any) => c.Field);
  console.log('approvalRequests columns:', JSON.stringify(arFields));

  // Check if partner exists
  const [existing] = await conn.execute('SELECT id FROM `partners` LIMIT 1') as any;
  if ((existing as any[]).length > 0) {
    console.log('partner already exists:', (existing as any[])[0].id);
  } else {
    // Insert using only columns that actually exist in the live DB
    // The live DB has the older schema: organisation, status (not tier/institution/agreementAccepted)
    const insertCols = fields.filter((f: string) => !['id','createdAt','updatedAt'].includes(f));
    console.log('Inserting with columns:', insertCols);
    const values: Record<string, any> = {
      name: 'Sandbox Test Partner',
      email: 'partner@sandbox.test',
      organisation: 'Sandbox Research Institute',
      institution: 'Sandbox Research Institute',
      therapeuticAreas: 'cardiovascular, neurological, metabolic',
      tier: 'developer',
      status: 'active',
      agreementAccepted: 1,
    };
    const usedCols = insertCols.filter((c: string) => c in values);
    const placeholders = usedCols.map(() => '?').join(',');
    const vals = usedCols.map((c: string) => values[c]);
    await conn.execute(
      `INSERT INTO \`partners\` (${usedCols.map((c: string) => `\`${c}\``).join(',')}) VALUES (${placeholders})`,
      vals
    );
    console.log('test partner inserted');
  }

  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
