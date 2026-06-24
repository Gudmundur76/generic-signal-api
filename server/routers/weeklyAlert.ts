import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getActiveSubscribers } from "../db";
import { notifyOwner } from "../_core/notification";
import { SAMPLE_ALERTS, formatWeeklyAlert } from "./alerts";

/**
 * Heartbeat callback handler for the weekly patent alert cron.
 * Mounted at POST /api/scheduled/weeklyAlert in server/_core/index.ts.
 *
 * Triggered every Monday at 06:00 UTC by the Manus heartbeat platform.
 * Formats the weekly alert and notifies the project owner via Manus notifications.
 */
export async function weeklyAlertHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }

    const subscribers = await getActiveSubscribers();
    const formattedEmail = formatWeeklyAlert(SAMPLE_ALERTS);

    // Notify project owner with the full weekly digest
    await notifyOwner({
      title: `Generic Signal Weekly Alert — ${subscribers.length} subscriber(s)`,
      content: formattedEmail,
    });

    res.json({
      ok: true,
      subscriberCount: subscribers.length,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[weeklyAlert] handler error:", error);
    res.status(500).json({
      error,
      context: { url: req.url, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
