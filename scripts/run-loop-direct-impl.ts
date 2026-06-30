/**
 * run-loop-direct-impl.ts
 * Seeds patentAlerts + a test partner, then runs the autonomous distribution loop.
 * Bypasses HTTP/auth — runs the TypeScript functions directly.
 */

import { runAutonomousDistributionLoop, discoverSignals } from '../server/lib/autonomousLoop';
import { getDb } from '../server/db';

async function seed() {
  const db = await getDb();
  if (!db) {
    console.error('[seed] No DB connection — aborting');
    process.exit(1);
  }

  // Dynamic imports to avoid top-level schema issues
  const { patentAlerts, partners } = await import('../drizzle/schema');

  // ── 1. Seed 3 patent alerts ───────────────────────────────────────────────
  console.log('\n[seed] Inserting patent alerts...');
  const now = new Date();
  const alerts = [
    {
      patentNumber: 'US10000001',
      title: 'PCSK9 inhibitor antibody composition',
      niche: 'PCSK9',
      assignee: 'Amgen Inc.',
      status: 'EXPIRING' as const,
      expiryDate: '2027-06-01',
      distressScore: 90,
      createdAt: now,
    },
    {
      patentNumber: 'US10000002',
      title: 'TTR stabilizer for hereditary amyloidosis',
      niche: 'TTR',
      assignee: 'Alnylam Pharmaceuticals',
      status: 'EXPIRING' as const,
      expiryDate: '2028-03-15',
      distressScore: 85,
      createdAt: now,
    },
    {
      patentNumber: 'US10000003',
      title: 'ANGPTL3 inhibitor for dyslipidemia',
      niche: 'ANGPTL3',
      assignee: 'Regeneron Pharmaceuticals',
      status: 'EXPIRING' as const,
      expiryDate: '2026-12-01',
      distressScore: 88,
      createdAt: now,
    },
  ];

  for (const alert of alerts) {
    try {
      await db.insert(patentAlerts).values(alert).onDuplicateKeyUpdate({
        set: { distressScore: alert.distressScore },
      });
      console.log(`  ✓ Patent alert seeded: ${alert.patentNumber} (${alert.niche})`);
    } catch (e) {
      // May already exist — ignore duplicate key errors
      const msg = (e as Error).message;
      if (msg.includes('duplicate') || msg.includes('Duplicate')) {
        console.log(`  ~ Already exists: ${alert.patentNumber}`);
      } else {
        console.warn(`  ! ${alert.patentNumber}: ${msg}`);
      }
    }
  }

  // ── 2. Register a test partner ────────────────────────────────────────────
  console.log('\n[seed] Registering test partner...');
  try {
    const existing = await db.select().from(partners).limit(1);
    if (existing.length > 0) {
      console.log(`  ~ Partner already exists (id=${existing[0].id}), skipping`);
    } else {
      await db.insert(partners).values({
        name: 'Sandbox Test Partner',
        email: 'partner@sandbox.test',
        institution: 'Sandbox Research Institute',
        therapeuticAreas: 'cardiovascular, neurological, metabolic',
        tier: 'developer' as const,
        agreementAccepted: 1,
        agreementAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      console.log('  ✓ Test partner registered');
    }
  } catch (e) {
    console.warn(`  ! Partner registration: ${(e as Error).message}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Autonomous Distribution Loop — Direct Execution');
  console.log('═══════════════════════════════════════════════════════');

  // Step 1: Seed
  await seed();

  // Step 2: Check what signals we'll find
  console.log('\n[loop] Discovering signals...');
  const signals = await discoverSignals();
  console.log(`[loop] Found ${signals.length} signal(s):`);
  for (const s of signals) {
    console.log(`  • ${s.gene} — confidence=${s.confidence}, source=${s.source}, patent=${s.patentNumber ?? 'n/a'}`);
  }

  if (signals.length === 0) {
    console.log('\n[loop] No signals found — check patentAlerts table and minSignalConfidence config');
    process.exit(0);
  }

  // Step 3: Run the full loop
  console.log('\n[loop] Running full autonomous distribution loop...\n');
  const result = await runAutonomousDistributionLoop();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Loop Result');
  console.log('═══════════════════════════════════════════════════════');
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
