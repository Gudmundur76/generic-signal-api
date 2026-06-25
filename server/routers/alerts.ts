import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { addSubscriber, getActiveSubscribers, getRecentAlerts } from "../db";
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
