import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getActiveSubscribers, getRecentAlerts } from "../db";
import { notifyOwner } from "../_core/notification";
import { formatWeeklyAlert } from "./alerts";
import { verifyClaim } from "../lib/citationClient";

/**
 * Heartbeat callback handler for the weekly patent alert cron.
 * Mounted at POST /api/scheduled/weeklyAlert in server/_core/index.ts.
 *
 * Triggered every Monday at 06:00 UTC by the Manus heartbeat platform.
 * Formats the weekly alert and notifies the project owner via Manus notifications.
 * Appends real PubMed citation footnotes for each alert with a molecular target.
 */
export async function weeklyAlertHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }

    const [subscribers, alerts] = await Promise.all([
      getActiveSubscribers(),
      getRecentAlerts(),
    ]);

    // Build citation footnotes for each alert that has a molecular target stored in claims
    const footnotes: string[] = [];
    for (const alert of alerts) {
      let target: string | null = null;
      try {
        const parsed = JSON.parse(alert.claims ?? "[]") as string[];
        target = parsed[0] ?? null;
      } catch {
        // malformed claims JSON — skip
      }
      if (!target) continue;
      try {
        const citation = await verifyClaim({
          claim: `${target} is a validated therapeutic target for ${alert.niche ?? "disease"}`,
          gene: target,
        });
        if (citation.sources.length > 0) {
          const refs = citation.sources
            .map((s) => `[${s.name}]${s.url ? ` ${s.url}` : ""}`)
            .join("\n");
          footnotes.push(
            `**${target} citations (${citation.status}, confidence ${Math.round(citation.confidence * 100)}%):**\n${refs}`
          );
        }
      } catch {
        // Citation API unavailable — skip footnotes for this alert silently
      }
    }

    const citationSection =
      footnotes.length > 0
        ? `\n\n---\n\n## Citation Footnotes\n\n${footnotes.join("\n\n")}`
        : "";

    const formattedEmail = formatWeeklyAlert(alerts) + citationSection;

    // Notify project owner with the full weekly digest
    await notifyOwner({
      title: `Generic Signal Weekly Alert — ${subscribers.length} subscriber(s), ${alerts.length} alert(s)`,
      content: formattedEmail,
    });

    res.json({
      ok: true,
      subscriberCount: subscribers.length,
      alertCount: alerts.length,
      citationFootnotes: footnotes.length,
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
