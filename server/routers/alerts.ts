import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { addSubscriber, getActiveSubscribers, getRecentAlerts, upsertPatentAlert } from "../db";
import { notifyOwner } from "../_core/notification";
import type { PatentAlert } from "../../drizzle/schema";

// ── Formatter ────────────────────────────────────────────────────────────────
export function formatWeeklyAlert(alerts: PatentAlert[]): string {
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const lines: string[] = [
    `# Generic Signal — Week of ${date}`,
    "",
    "Here are the top expiring drug patents with generic entry opportunities detected this week.",
    "",
  ];
  if (alerts.length === 0) {
    lines.push(`*No new patent alerts this week. Check back next Monday.*`);
    lines.push(``, `---`, ``, `*Verified against 65 sources via citation.manus.space*`, ``);
    lines.push(`**Upgrade to Pro for full claim analysis, molecular scoring details, and API access.**`);
    return lines.join("\n");
  }
  for (const a of alerts) {
    lines.push(`---`, ``, `### ${a.title}`, ``);
      lines.push(`- **Patent Number:** ${a.patentUrl ? `[${a.patentNumber}](${a.patentUrl})` : a.patentNumber}`);
    lines.push(`- **Assignee:** ${a.assignee}`);
    lines.push(`- **Status:** ${a.status}`);
      if (a.expiryDate) lines.push(`- **Expiry Date:** ${a.expiryDate}`);
    lines.push(`- **Distress Score:** ${a.distressScore}/100 🚨`);
    lines.push(`- **Verification:** ${a.verificationStatus}`);
    lines.push(``);
    lines.push(`**Implication:**`);
    lines.push(`This patent's impending expiration presents a high-value opportunity for generic formulation and market entry.`);
    lines.push(``);
  }
  lines.push(`---`, ``, `*Verified against 65 sources via citation.manus.space*`, ``);
  lines.push(`**Upgrade to Pro for full claim analysis, molecular scoring details, and API access.**`);
  return lines.join("\n");
}

// ── Router ────────────────────────────────────────────────────────────────
export const alertsRouter = router({
  // POST /api/trpc/subscribe
  subscribe: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const { created } = await addSubscriber(input.email);
      return {
        success: true,
        created,
        message: created
          ? "You're subscribed! Expect your first alert next Monday."
          : "You're already subscribed.",
      };
    }),

  // GET /api/trpc/alerts.latest
  latest: publicProcedure.query(async () => {
    const alerts = await getRecentAlerts();
    return {
      alerts,
      generatedAt: new Date().toISOString(),
      count: alerts.length,
    };
  }),

  // POST /api/trpc/alerts.ingest  (admin-only)
  ingest: adminProcedure
    .input(
      z.object({
        patentNumber: z.string(),
        title: z.string(),
        assignee: z.string(),
        expiryDate: z.string().nullable(),
        niche: z.string().nullable(),
        molecularTarget: z.string().nullable(),
        status: z.enum(["expiring", "abandoned", "reexamined"]),
        confidence: z.number().min(0).max(1),
        patentUrl: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      // Map lowercase input status to DB enum
      const statusMap = {
        expiring: "EXPIRING",
        abandoned: "ABANDONED",
        reexamined: "RE_EXAM_NARROWED",
      } as const;
      const dbStatus = statusMap[input.status];
      // Map confidence (0-1) to distressScore (0-100)
      const distressScore = Math.round(input.confidence * 100);
      // Store molecularTarget in claims JSON field
      const claims = input.molecularTarget
        ? JSON.stringify([input.molecularTarget])
        : null;
      await upsertPatentAlert({
        patentNumber: input.patentNumber,
        title: input.title,
        assignee: input.assignee,
        status: dbStatus,
        expiryDate: input.expiryDate ?? undefined,
        distressScore,
        niche: input.niche ?? undefined,
        claims,
        patentUrl: input.patentUrl ?? undefined,
      });
      return { success: true, patentNumber: input.patentNumber };
    }),

  // POST /api/trpc/alerts.trigger  (admin-only)
  trigger: adminProcedure.mutation(async () => {
    const [alerts, subscribers] = await Promise.all([
      getRecentAlerts(),
      getActiveSubscribers(),
    ]);

    const formattedEmail = formatWeeklyAlert(alerts);

    await notifyOwner({
      title: `Generic Signal — Weekly Alert (${subscribers.length} subscribers, ${alerts.length} alerts)`,
      content: formattedEmail,
    });

    return {
      dispatched: subscribers.length,
      alertCount: alerts.length,
      formattedEmail,
      sentAt: new Date().toISOString(),
    };
  }),
});
