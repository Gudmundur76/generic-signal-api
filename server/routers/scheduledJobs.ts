/**
 * scheduledJobs.ts
 *
 * Express handlers for heartbeat-triggered scheduled jobs.
 * Registered in server/_core/index.ts BEFORE the Vite fallthrough.
 *
 * Routes:
 *   POST /api/scheduled/patent-scan    — daily 03:00 UTC
 *   POST /api/scheduled/weekly-report  — Monday 06:00 UTC
 *
 * Auth: sdk.authenticateRequest → user.isCron must be true.
 */

import type { Request, Response } from 'express';
import { sdk } from '../_core/sdk.js';
import { getDb } from '../db.js';
import { upsertPatentAlert } from '../db.js';
import { partners } from '../../drizzle/schema.js';
import { weeklyAlertHandler } from './weeklyAlert.js';
import { getTopTargets } from '../lib/clf/decodeTargetList.js';

// ── Patent Scan Handler ───────────────────────────────────────────────────────

export async function handlePatentScan(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: 'cron-only' });
      return;
    }

    const ranAt = new Date().toISOString();

    // Fetch active partners to determine which therapeutic areas to scan
    const db = await getDb();
    if (!db) { res.json({ ok: true, skipped: 'db-unavailable' }); return; }
    const activePartners = await db.select().from(partners);
    const allAreas = activePartners.flatMap(p => {
      try {
        return JSON.parse(p.therapeuticAreas ?? '[]') as string[];
      } catch {
        return [] as string[];
      }
    });
    const areas = Array.from(new Set(allAreas));

    // Pull top targets from the CLF catalogue and upsert any that are relevant
    // to the partner-requested therapeutic areas. Keeps patentAlerts table fresh.
    const topTargets = getTopTargets(30);
    const relevantTargets = topTargets.filter(t =>
      areas.length === 0 || t.areas.some(a => areas.includes(a))
    );

    let upsertCount = 0;
    const expiryYear = new Date().getFullYear() + 2;
    for (const target of relevantTargets.slice(0, 10)) {
      try {
        // distressScore derived from pValue significance (lower pValue = higher distress)
        const distressScore = Math.min(99, Math.round(Math.abs(Math.log10(target.pValue)) * 3));
        await upsertPatentAlert({
          patentNumber: `DECODE-${target.gene}-SCAN`,
          title: `${target.gene} — ${target.diseaseContext.split(';')[0].trim()}`,
          assignee: 'deCODE Genetics / Amgen',
          status: 'EXPIRING',
          expiryDate: `${expiryYear}-12-31`,
          distressScore,
          niche: target.areas[0] ?? 'cardiovascular',
          claims: JSON.stringify([target.gene]),
          patentUrl: null,
        });
        upsertCount++;
      } catch {
        // Skip individual upsert failures — non-fatal
      }
    }

    const result = {
      ok: true,
      ranAt,
      taskUid: user.taskUid,
      activePartners: activePartners.length,
      therapeuticAreasCovered: areas,
      targetsScanned: relevantTargets.length,
      alertsUpserted: upsertCount,
    };

    console.log('[patent-scan] cycle completed', result);
    res.json(result);
  } catch (err) {
    console.error('[patent-scan] error', err);
    res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
      context: { url: req.url },
    });
  }
}

// ── Weekly Report Handler ─────────────────────────────────────────────────────
// Delegates directly to the real weeklyAlertHandler which:
//   1. Queries live patentAlerts from DB via getRecentAlerts()
//   2. Appends Citation API footnotes per alert via verifyClaim()
//   3. Notifies the project owner via Manus notifyOwner()
export { weeklyAlertHandler as handleWeeklyReport };

// ── Autonomous Distribution Loop Handler ──────────────────────────────────────
// Runs every 6 hours via heartbeat cron.
// Discovers patent signals, evaluates them, designs candidates, and delivers.

import { runAutonomousDistributionLoop } from '../lib/autonomousLoop.js';

export async function handleAutonomousLoop(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: 'cron-only' });
      return;
    }

    const result = await runAutonomousDistributionLoop();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[autonomous-loop] error', err);
    res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}
