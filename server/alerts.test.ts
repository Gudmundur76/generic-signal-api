import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatWeeklyAlert } from "./routers/alerts";
import type { PatentAlert } from "../drizzle/schema";

// ── Inline fixtures (match PatentAlert DB type exactly) ───────────────────────
const mockPatentAlerts: PatentAlert[] = [
  {
    id: 1,
    patentNumber: "US8,071,073",
    title: "Atorvastatin calcium formulation",
    assignee: "Pfizer Inc.",
    status: "EXPIRING",
    expiryDate: "2026-09-29",
    distressScore: 85,
    niche: "generic_drug_opportunity",
    claims: JSON.stringify(["Crystalline form of atorvastatin calcium"]),
    verificationStatus: "Supported",
    patentUrl: "https://patents.google.com/patent/US8071073",
    createdAt: new Date("2026-06-25"),
  },
  {
    id: 2,
    patentNumber: "US9,220,671",
    title: "Rosuvastatin calcium tablet formulation",
    assignee: "AstraZeneca AB",
    status: "EXPIRING",
    expiryDate: "2026-11-14",
    distressScore: 78,
    niche: "generic_drug_opportunity",
    claims: JSON.stringify(["Stable tablet formulation"]),
    verificationStatus: "Supported",
    patentUrl: "https://patents.google.com/patent/US9220671",
    createdAt: new Date("2026-06-25"),
  },
  {
    id: 3,
    patentNumber: "US7,932,260",
    title: "Sitagliptin phosphate monohydrate",
    assignee: "Merck Sharp & Dohme Corp.",
    status: "EXPIRING",
    expiryDate: null,
    distressScore: 72,
    niche: null,
    claims: null,
    verificationStatus: "Pending",
    patentUrl: null,
    createdAt: new Date("2026-06-25"),
  },
];

// ── formatWeeklyAlert ─────────────────────────────────────────────────────────
describe("formatWeeklyAlert", () => {
  it("includes the patent number for each alert", () => {
    const result = formatWeeklyAlert(mockPatentAlerts);
    for (const alert of mockPatentAlerts) {
      expect(result).toContain(alert.patentNumber);
    }
  });

  it("includes each assignee name", () => {
    const result = formatWeeklyAlert(mockPatentAlerts);
    expect(result).toContain("Pfizer Inc.");
    expect(result).toContain("AstraZeneca AB");
  });

  it("includes the distress score", () => {
    const result = formatWeeklyAlert(mockPatentAlerts);
    expect(result).toContain("85/100");
    expect(result).toContain("78/100");
  });

  it("includes the citation footer", () => {
    const result = formatWeeklyAlert(mockPatentAlerts);
    expect(result).toContain("citation.manus.space");
  });

  it("includes the Pro upgrade CTA", () => {
    const result = formatWeeklyAlert(mockPatentAlerts);
    expect(result).toContain("Upgrade to Pro");
  });

  it("returns a non-empty string", () => {
    expect(formatWeeklyAlert(mockPatentAlerts).length).toBeGreaterThan(100);
  });

  it("handles empty array with 'No new alerts' message and no fallback", () => {
    const result = formatWeeklyAlert([]);
    expect(result).toContain("No new patent alerts");
    expect(result).not.toContain("undefined");
    // Must NOT fall back to any hardcoded patent data
    expect(result).not.toContain("Atorvastatin");
    expect(result).not.toContain("Pfizer");
  });

  it("omits expiryDate line when null", () => {
    const nullExpiry: PatentAlert[] = [{ ...mockPatentAlerts[0]!, expiryDate: null }];
    const result = formatWeeklyAlert(nullExpiry);
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("Expiry Date: null");
  });

  it("renders patentUrl as plain text when null", () => {
    const nullUrl: PatentAlert[] = [{ ...mockPatentAlerts[0]!, patentUrl: null }];
    const result = formatWeeklyAlert(nullUrl);
    expect(result).toContain(mockPatentAlerts[0]!.patentNumber);
    expect(result).not.toContain("href=\"null\"");
  });
});

// ── Fixture shape ─────────────────────────────────────────────────────────────
describe("mockPatentAlerts shape", () => {
  it("has 3 alerts", () => {
    expect(mockPatentAlerts).toHaveLength(3);
  });

  it("each alert has required non-null fields", () => {
    for (const alert of mockPatentAlerts) {
      expect(alert.patentNumber).toBeTruthy();
      expect(alert.title).toBeTruthy();
      expect(alert.assignee).toBeTruthy();
      expect(alert.distressScore).toBeGreaterThan(0);
      expect(alert.distressScore).toBeLessThanOrEqual(100);
    }
  });

  it("first alert is Atorvastatin with distress score 85", () => {
    expect(mockPatentAlerts[0]!.title).toContain("Atorvastatin");
    expect(mockPatentAlerts[0]!.distressScore).toBe(85);
  });

  it("third alert has nullable fields (expiryDate, niche, patentUrl)", () => {
    const third = mockPatentAlerts[2]!;
    expect(third.expiryDate).toBeNull();
    expect(third.niche).toBeNull();
    expect(third.patentUrl).toBeNull();
  });
});

// ── tRPC router procedures (caller-based) ─────────────────────────────────────
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(role: "user" | "admin" | null = null): TrpcContext {
  return {
    user: role
      ? {
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("alerts.latest (public)", () => {
  it("returns an array of alerts without auth", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.alerts.latest();
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(typeof result.count).toBe("number");
    expect(result.generatedAt).toBeTruthy();
  });
});

describe("alerts.subscribe (public)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects invalid email", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.alerts.subscribe({ email: "not-an-email" })
    ).rejects.toThrow();
  });
});

describe("alerts.trigger (admin-only)", () => {
  it("throws FORBIDDEN for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.alerts.trigger()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for regular user", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.alerts.trigger()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
