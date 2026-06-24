import { describe, it, expect, vi, beforeEach } from "vitest";
import { SAMPLE_ALERTS, formatWeeklyAlert } from "./routers/alerts";

// ── formatWeeklyAlert ─────────────────────────────────────────────────────────
describe("formatWeeklyAlert", () => {
  it("includes the patent number for each alert", () => {
    const result = formatWeeklyAlert(SAMPLE_ALERTS);
    for (const alert of SAMPLE_ALERTS) {
      expect(result).toContain(alert.patentNumber);
    }
  });

  it("includes each assignee name", () => {
    const result = formatWeeklyAlert(SAMPLE_ALERTS);
    expect(result).toContain("Pfizer Inc.");
    expect(result).toContain("AstraZeneca AB");
  });

  it("includes the distress score", () => {
    const result = formatWeeklyAlert(SAMPLE_ALERTS);
    expect(result).toContain("85/100");
    expect(result).toContain("78/100");
  });

  it("includes the citation footer", () => {
    const result = formatWeeklyAlert(SAMPLE_ALERTS);
    expect(result).toContain("citation.manus.space");
  });

  it("includes the Pro upgrade CTA", () => {
    const result = formatWeeklyAlert(SAMPLE_ALERTS);
    expect(result).toContain("Upgrade to Pro");
  });

  it("returns a non-empty string", () => {
    expect(formatWeeklyAlert(SAMPLE_ALERTS).length).toBeGreaterThan(100);
  });
});

// ── SAMPLE_ALERTS shape ───────────────────────────────────────────────────────
describe("SAMPLE_ALERTS", () => {
  it("has 3 alerts", () => {
    expect(SAMPLE_ALERTS).toHaveLength(3);
  });

  it("each alert has required fields", () => {
    for (const alert of SAMPLE_ALERTS) {
      expect(alert.patentNumber).toBeTruthy();
      expect(alert.title).toBeTruthy();
      expect(alert.assignee).toBeTruthy();
      expect(alert.distressScore).toBeGreaterThan(0);
      expect(alert.distressScore).toBeLessThanOrEqual(100);
      expect(alert.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(alert.niche).toBeTruthy();
      expect(alert.patentUrl).toContain("patents.google.com");
    }
  });

  it("all alerts are generic_drug_opportunity niche", () => {
    for (const alert of SAMPLE_ALERTS) {
      expect(alert.niche).toBe("generic_drug_opportunity");
    }
  });

  it("first alert is Atorvastatin with distress score 85", () => {
    expect(SAMPLE_ALERTS[0].title).toContain("Atorvastatin");
    expect(SAMPLE_ALERTS[0].distressScore).toBe(85);
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
  it("returns 3 alerts without auth", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.alerts.latest();
    expect(result.alerts).toHaveLength(3);
    expect(result.count).toBe(3);
    expect(result.generatedAt).toBeTruthy();
  });

  it("first alert has patentNumber US8,071,073", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.alerts.latest();
    expect(result.alerts[0].patentNumber).toBe("US8,071,073");
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
