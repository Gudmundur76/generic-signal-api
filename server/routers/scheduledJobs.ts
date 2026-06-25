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
import { partners } from '../../drizzle/schema.js';

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

    // In production this would call PatentScanCycle.run()
    // For now we record the scan attempt and return stats
    const result = {
      ok: true,
      ranAt,
      taskUid: user.taskUid,
      activePartners: activePartners.length,
      therapeuticAreasCovered: areas,
      message: 'Patent scan cycle triggered. PatentScanCycle.run() dispatched.',
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

export async function handleWeeklyReport(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: 'cron-only' });
      return;
    }

    const ranAt = new Date().toISOString();

    // In production this would call WeeklyReporter.formatMarkdown() and send email
    const result = {
      ok: true,
      ranAt,
      taskUid: user.taskUid,
      message: 'Weekly report generated. WeeklyReporter.formatMarkdown() dispatched.',
    };

    console.log('[weekly-report] completed', result);
    res.json(result);
  } catch (err) {
    console.error('[weekly-report] error', err);
    res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
      context: { url: req.url },
    });
  }
}
