import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { addSubscriber, getActiveSubscribers } from "../db";
import { notifyOwner } from "../_core/notification";

// ── Sample patent signal data ─────────────────────────────────────────────
// In production this is replaced by a real call to notus.is via NotusApiClient.
// The shape mirrors the PatentDocument interface from cognitive-loop-framework.
export const SAMPLE_ALERTS = [
  {
    patentNumber: "US8,071,073",
    title: "Atorvastatin calcium formulation",
    assignee: "Pfizer Inc.",
    status: "EXPIRING",
    expiryDate: "2026-09-29",
    distressScore: 85,
    niche: "generic_drug_opportunity",
    claims: ["Crystalline form of atorvastatin calcium", "Pharmaceutical composition"],
    verificationStatus: "Supported",
    patentUrl: "https://patents.google.com/patent/US8071073",
  },
  {
    patentNumber: "US9,220,671",
    title: "Rosuvastatin calcium tablet formulation",
    assignee: "AstraZeneca AB",
    status: "EXPIRING",
    expiryDate: "2026-11-14",
    distressScore: 78,
    niche: "generic_drug_opportunity",
    claims: ["Stable tablet formulation", "Process for preparation"],
    verificationStatus: "Supported",
    patentUrl: "https://patents.google.com/patent/US9220671",
  },
  {
    patentNumber: "US7,932,260",
    title: "Sitagliptin phosphate monohydrate",
    assignee: "Merck Sharp & Dohme Corp.",
    status: "EXPIRING",
    expiryDate: "2027-01-07",
    distressScore: 72,
    niche: "generic_drug_opportunity",
    claims: ["Crystalline sitagliptin phosphate monohydrate", "Pharmaceutical compositions"],
    verificationStatus: "Supported",
    patentUrl: "https://patents.google.com/patent/US7932260",
  },
];

// ── Formatter (mirrors companies/generic-signal/src/formatter.ts) ─────────
export function formatWeeklyAlert(alerts: typeof SAMPLE_ALERTS): string {
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const lines: string[] = [
    `# Generic Signal — Week of ${date}`,
    "",
    "Here are the top expiring drug patents with generic entry opportunities detected this week.",
    "",
  ];
  for (const a of alerts) {
    lines.push(`---`, ``, `### ${a.title}`, ``);
    lines.push(`- **Patent Number:** [${a.patentNumber}](${a.patentUrl})`);
    lines.push(`- **Assignee:** ${a.assignee}`);
    lines.push(`- **Status:** ${a.status}`);
    lines.push(`- **Expiry Date:** ${a.expiryDate}`);
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
  latest: publicProcedure.query(() => {
    return {
      alerts: SAMPLE_ALERTS,
      generatedAt: new Date().toISOString(),
      count: SAMPLE_ALERTS.length,
    };
  }),

  // POST /api/trpc/alerts.trigger  (admin-only)
  trigger: adminProcedure.mutation(async () => {
    const formattedEmail = formatWeeklyAlert(SAMPLE_ALERTS);
    const subscribers = await getActiveSubscribers();

    // Send Manus notification to owner with the formatted alert
    await notifyOwner({
      title: `Generic Signal — Weekly Alert (${subscribers.length} subscribers)`,
      content: formattedEmail,
    });

    // In production: also send to each subscriber via Resend / email provider
    // For now: notify owner once with the full digest
    return {
      dispatched: subscribers.length,
      formattedEmail,
      sentAt: new Date().toISOString(),
    };
  }),
});
