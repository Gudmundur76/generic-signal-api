/**
 * targets.test.ts — Sprint 6 tests
 *
 * Test 1: TARGETS.length === 8
 * Test 2: TARGET_EVIDENCE has entries for all 8 targets with non-empty PMIDs, PDBs, NCTs
 * Test 3: patentAlerts table has 5 rows after seed
 * Test 4: getRecentAlerts() returns 5 alerts
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Test 1 & 2 — TARGETS array and TARGET_EVIDENCE catalogue
// ---------------------------------------------------------------------------

// Import the router to access the exported TARGETS array via getTargets
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ALL_TARGETS = ["PCSK9", "LPA", "APOE", "ANGPTL3", "CETP", "HMGCR", "APOC3", "TTR"] as const;

describe("TARGETS catalogue", () => {
  it("TARGETS.length === 8", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    expect(targets).toHaveLength(8);
  });

  it("all 8 expected gene names are present", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    const names = targets.map((t) => t.name);
    for (const gene of ALL_TARGETS) {
      expect(names).toContain(gene);
    }
  });

  it("each target has required fields: name, gene, protein, disease, pValue, layers", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    for (const t of targets) {
      expect(t.name).toBeTruthy();
      expect(t.gene).toBeTruthy();
      expect(t.protein).toBeTruthy();
      expect(t.disease).toBeTruthy();
      expect(t.pValue).toBeGreaterThan(0);
      expect(Array.isArray(t.layers)).toBe(true);
      expect(t.layers.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2 — TARGET_EVIDENCE has real identifiers for all 8 targets
// ---------------------------------------------------------------------------

// Import TARGET_EVIDENCE directly from design.ts via a re-export shim
// We test this by calling design.evolve for each new target and inspecting
// the legacy verification claims which embed real pubmed:/pdb:/clinicaltrials: sources.

import { TARGETS_FOR_TEST, TARGET_EVIDENCE_FOR_TEST } from "./routers/design";

describe("TARGET_EVIDENCE — real identifiers for all 8 targets", () => {
  it("TARGET_EVIDENCE has entries for all 8 targets", () => {
    for (const gene of ALL_TARGETS) {
      const entry = TARGET_EVIDENCE_FOR_TEST[gene];
      expect(entry, `Missing TARGET_EVIDENCE entry for ${gene}`).toBeTruthy();
      expect(entry!.pqtlPMIDs.length).toBeGreaterThan(0);
      expect(entry!.gwasPMID).toBeTruthy();
      expect(entry!.pdbId).toBeTruthy();
      expect(entry!.clinicalTrialId).toBeTruthy();
    }
  });

  it("all 8 TARGETS are in the exported array", () => {
    expect(TARGETS_FOR_TEST).toHaveLength(8);
    const names = TARGETS_FOR_TEST.map((t) => t.name);
    for (const gene of ALL_TARGETS) {
      expect(names).toContain(gene);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests 3 & 4 — patentAlerts DB rows
// ---------------------------------------------------------------------------

import { getDb } from "./db";
import { patentAlerts } from "../drizzle/schema";
import { getRecentAlerts } from "./db";

describe("patentAlerts seed", () => {
  it("patentAlerts table has exactly 5 rows", async () => {
    const db = await getDb();
    if (!db) {
      // Skip gracefully in environments without a DB connection
      console.warn("[test] No DB connection — skipping patentAlerts count test");
      return;
    }
    const rows = await db.select().from(patentAlerts);
    expect(rows).toHaveLength(5);
  });

  it("getRecentAlerts() returns 5 alerts", async () => {
    const alerts = await getRecentAlerts();
    // The seed sets createdAt = NOW, so all 5 should be within the 7-day window
    expect(alerts).toHaveLength(5);
  });

  it("all seeded alerts have required fields", async () => {
    const alerts = await getRecentAlerts();
    for (const a of alerts) {
      expect(a.patentNumber).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.assignee).toBeTruthy();
      expect(a.status).toBe("EXPIRING");
      expect(a.distressScore).toBeGreaterThan(0);
      expect(a.distressScore).toBeLessThanOrEqual(100);
    }
  });

  it("seeded patent numbers match the expected set", async () => {
    const alerts = await getRecentAlerts();
    const numbers = alerts.map((a) => a.patentNumber);
    expect(numbers).toContain("US8148374");
    expect(numbers).toContain("US9012468");
    expect(numbers).toContain("US9644004");
    expect(numbers).toContain("US10232008");
    expect(numbers).toContain("US9776940");
  });
});
