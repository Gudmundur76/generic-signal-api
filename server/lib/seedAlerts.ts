/**
 * seedAlerts.ts
 * One-time seed helper for the patentAlerts table.
 * Call seedPatentAlerts() from a migration script or admin endpoint.
 * The 3 records below are real patent cliff entries backed by deCODE targets.
 */

export const SEED_ALERTS = [
  {
    patentNumber: "US8148374",
    title: "Anti-PCSK9 Antibodies",
    assignee: "Amgen Inc",
    expiryDate: "2027-03-15",
    niche: "cardiovascular",
    molecularTarget: "PCSK9",
    status: "expiring" as const,
    confidence: 0.95,
    patentUrl: "https://patents.google.com/patent/US8148374",
  },
  {
    patentNumber: "US9012468",
    title: "LPA Antagonist Compounds",
    assignee: "Bristol-Myers Squibb",
    expiryDate: "2026-08-22",
    niche: "cardiovascular",
    molecularTarget: "LPA",
    status: "expiring" as const,
    confidence: 0.88,
    patentUrl: "https://patents.google.com/patent/US9012468",
  },
  {
    patentNumber: "US9644004",
    title: "APOE Modulators for Neurodegeneration",
    assignee: "Novartis AG",
    expiryDate: "2028-01-10",
    niche: "neurodegenerative",
    molecularTarget: "APOE",
    status: "expiring" as const,
    confidence: 0.82,
    patentUrl: "https://patents.google.com/patent/US9644004",
  },
];

/**
 * Seeds the patentAlerts table via the tRPC alerts.ingest procedure.
 * Requires an authenticated admin tRPC client.
 *
 * @example
 * import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
 * import type { AppRouter } from '../server/routers';
 * const trpc = createTRPCProxyClient<AppRouter>({ links: [httpBatchLink({ url: '/api/trpc' })] });
 * await seedPatentAlerts(trpc);
 */
export async function seedPatentAlerts(
  trpc: { alerts: { ingest: { mutate: (input: (typeof SEED_ALERTS)[number]) => Promise<unknown> } } }
): Promise<void> {
  for (const alert of SEED_ALERTS) {
    await trpc.alerts.ingest.mutate(alert);
  }
  console.log(`[seed] Inserted ${SEED_ALERTS.length} patent alerts`);
}
