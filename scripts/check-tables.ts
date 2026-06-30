import { getDb } from '../server/db';
import { approvalRequests, partners, patentAlerts } from '../drizzle/schema';

async function main() {
  const db = await getDb();
  if (!db) { console.error('no db'); process.exit(1); }

  const checks = [
    { name: 'approvalRequests', table: approvalRequests },
    { name: 'partners', table: partners },
    { name: 'patentAlerts', table: patentAlerts },
  ];

  for (const { name, table } of checks) {
    try {
      const rows = await db.select().from(table as any).limit(1);
      console.log(`${name}: EXISTS (${rows.length} rows sampled)`);
    } catch (e) {
      console.log(`${name}: MISSING — ${(e as Error).message.slice(0, 80)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
