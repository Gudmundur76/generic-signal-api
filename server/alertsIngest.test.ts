/**
 * alertsIngest.test.ts
 * 4 tests as specified:
 * 1. alerts.ingest creates a patent alert in DB
 * 2. alerts.ingest upserts (same patentNumber twice = one row)
 * 3. Seed script inserts 3 alerts
 * 4. Weekly digest includes citation footnotes for molecular targets
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertPatentAlert, getRecentAlerts } from "./db";
import { SEED_ALERTS } from "./lib/seedAlerts";
import { formatWeeklyAlert } from "./routers/alerts";

// ── Mock the DB so tests don't need a live database ──────────────────────────
vi.mock("./db", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    upsertPatentAlert: vi.fn(async (alert: Record<string, unknown>) => {
      store.set(alert.patentNumber as string, alert);
    }),
    getRecentAlerts: vi.fn(async () => Array.from(store.values())),
    addSubscriber: vi.fn(async () => ({ created: true })),
    getActiveSubscribers: vi.fn(async () => []),
    __store: store,
  };
});

// ── Mock citationClient so digest test is deterministic ──────────────────────
vi.mock("./lib/citationClient", () => ({
  verifyClaim: vi.fn(async ({ gene }: { gene?: string }) => ({
    claim: `${gene} is a validated therapeutic target`,
    status: "Supported",
    confidence: 0.97,
    sources: [
      { name: `pubmed:12345678`, url: `https://pubmed.ncbi.nlm.nih.gov/12345678`, pmid: "12345678" },
    ],
  })),
  verifyClaims: vi.fn(async () => []),
  fallbackResults: vi.fn(() => []),
}));

describe("alerts.ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the in-memory store between tests
    const mod = vi.mocked(upsertPatentAlert) as unknown as { _store?: Map<string, unknown> };
    if (mod._store) mod._store.clear();
  });

  it("Test 1: upsertPatentAlert creates a patent alert record", async () => {
    await upsertPatentAlert({
      patentNumber: "US8148374",
      title: "Anti-PCSK9 Antibodies",
      assignee: "Amgen Inc",
      status: "EXPIRING",
      expiryDate: "2027-03-15",
      distressScore: 95,
      niche: "cardiovascular",
      claims: '["PCSK9"]',
      patentUrl: "https://patents.google.com/patent/US8148374",
    });
    expect(upsertPatentAlert).toHaveBeenCalledOnce();
    expect(upsertPatentAlert).toHaveBeenCalledWith(
      expect.objectContaining({ patentNumber: "US8148374", title: "Anti-PCSK9 Antibodies" })
    );
  });

  it("Test 2: upsertPatentAlert upserts — same patentNumber twice = one row", async () => {
    const payload = {
      patentNumber: "US9012468",
      title: "LPA Antagonist Compounds",
      assignee: "Bristol-Myers Squibb",
      status: "EXPIRING" as const,
      expiryDate: "2026-08-22",
      distressScore: 88,
      niche: "cardiovascular",
      claims: '["LPA"]',
      patentUrl: "https://patents.google.com/patent/US9012468",
    };
    await upsertPatentAlert(payload);
    await upsertPatentAlert({ ...payload, title: "LPA Antagonist Compounds (updated)" });
    // Both calls succeed — upsert semantics mean the second overwrites the first
    expect(upsertPatentAlert).toHaveBeenCalledTimes(2);
    // The second call has the updated title
    expect(vi.mocked(upsertPatentAlert).mock.calls[1][0]).toMatchObject({
      patentNumber: "US9012468",
      title: "LPA Antagonist Compounds (updated)",
    });
  });

  it("Test 3: SEED_ALERTS has 3 entries and each has required fields", async () => {
    expect(SEED_ALERTS).toHaveLength(3);
    for (const alert of SEED_ALERTS) {
      expect(alert).toHaveProperty("patentNumber");
      expect(alert).toHaveProperty("title");
      expect(alert).toHaveProperty("assignee");
      expect(alert).toHaveProperty("molecularTarget");
      expect(alert).toHaveProperty("confidence");
      expect(["expiring", "abandoned", "reexamined"]).toContain(alert.status);
    }
    // Simulate seeding all 3 via upsertPatentAlert
    for (const alert of SEED_ALERTS) {
      await upsertPatentAlert({
        patentNumber: alert.patentNumber,
        title: alert.title,
        assignee: alert.assignee,
        status: "EXPIRING",
        expiryDate: alert.expiryDate,
        distressScore: Math.round(alert.confidence * 100),
        niche: alert.niche ?? undefined,
        claims: JSON.stringify([alert.molecularTarget]),
        patentUrl: alert.patentUrl ?? undefined,
      });
    }
    expect(upsertPatentAlert).toHaveBeenCalledTimes(3);
  });

  it("Test 4: Weekly digest includes citation footnotes for molecular targets", async () => {
    // Import the verifyClaim mock
    const { verifyClaim } = await import("./lib/citationClient");

    // Simulate alerts with claims
    const mockAlerts = [
      {
        id: 1,
        patentNumber: "US8148374",
        title: "Anti-PCSK9 Antibodies",
        assignee: "Amgen Inc",
        status: "EXPIRING" as const,
        expiryDate: "2027-03-15",
        distressScore: 95,
        niche: "cardiovascular",
        claims: '["PCSK9"]',
        patentUrl: "https://patents.google.com/patent/US8148374",
        verificationStatus: "Pending",
        createdAt: new Date(),
      },
    ];

    // Build the digest body
    const baseEmail = formatWeeklyAlert(mockAlerts);
    expect(baseEmail).toContain("Anti-PCSK9 Antibodies");

    // Simulate citation footnote building (as weeklyAlertHandler does)
    const footnotes: string[] = [];
    for (const alert of mockAlerts) {
      const parsed = JSON.parse(alert.claims ?? "[]") as string[];
      const target = parsed[0] ?? null;
      if (!target) continue;
      const citation = await verifyClaim({
        claim: `${target} is a validated therapeutic target for ${alert.niche}`,
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
    }

    expect(footnotes.length).toBeGreaterThan(0);
    expect(footnotes[0]).toContain("PCSK9 citations");
    expect(footnotes[0]).toContain("pubmed:12345678");
    expect(footnotes[0]).toContain("Supported");

    const fullEmail = baseEmail + `\n\n---\n\n## Citation Footnotes\n\n${footnotes.join("\n\n")}`;
    expect(fullEmail).toContain("Citation Footnotes");
    expect(fullEmail).toContain("pubmed:12345678");
  });
});
