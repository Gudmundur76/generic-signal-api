/**
 * Sprint 16 Tests
 * Verifies:
 *   1. getProgress returns currentStep (1-7), totalSteps=7, stepLabel, and status ("running"|"complete")
 *   2. getPatentArbitrage returns topJurisdiction (non-null string) on every opportunity
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({ user: null } as never);

// ─── Helper: start a run and return its runId ────────────────────────────────
async function startRun(target: string, layers: string[]) {
  const result = await caller.design.evolve({ target: target as never, layers: layers as never });
  return result.runId;
}

// ─── getProgress — currentStep and status ────────────────────────────────────
describe("getProgress — Sprint 16", () => {
  it("returns currentStep as a number between 1 and 7", async () => {
    const runId = await startRun("PCSK9", ["small_molecule"]);
    const progress = await caller.design.getProgress({ runId });
    expect(typeof progress.currentStep).toBe("number");
    expect(progress.currentStep).toBeGreaterThanOrEqual(1);
    expect(progress.currentStep).toBeLessThanOrEqual(7);
  }, 30_000);

  it("returns totalSteps === 7", async () => {
    const runId = await startRun("HMGCR", ["small_molecule"]);
    const progress = await caller.design.getProgress({ runId });
    expect(progress.totalSteps).toBe(7);
  }, 30_000);

  it("returns a non-empty stepLabel string", async () => {
    const runId = await startRun("TTR", ["small_molecule"]);
    const progress = await caller.design.getProgress({ runId });
    expect(typeof progress.stepLabel).toBe("string");
    expect(progress.stepLabel.length).toBeGreaterThan(0);
  }, 30_000);

  it("returns status as 'running' or 'complete'", async () => {
    const runId = await startRun("LPA", ["dna"]);
    const progress = await caller.design.getProgress({ runId });
    expect(["running", "complete"]).toContain(progress.status);
  }, 30_000);

  it("returns status 'complete' when run has converged", async () => {
    const runId = await startRun("APOE", ["protein"]);
    // Advance until converged
    let progress = await caller.design.getProgress({ runId });
    let iterations = 0;
    while (!progress.converged && iterations < 20) {
      progress = await caller.design.getProgress({ runId });
      iterations++;
    }
    expect(progress.status).toBe("complete");
    expect(progress.currentStep).toBe(7);
  }, 60_000);

  it("progress.currentStep increases monotonically with generation", async () => {
    const runId = await startRun("ANGPTL3", ["protein"]);
    const p1 = await caller.design.getProgress({ runId });
    const p2 = await caller.design.getProgress({ runId });
    // Step should be >= previous step (never go backward)
    expect(p2.currentStep).toBeGreaterThanOrEqual(p1.currentStep);
  }, 30_000);

  it("stepLabel matches known pipeline step names", async () => {
    const KNOWN_LABELS = [
      "Initialising",
      "Fetching molecular data",
      "Scoring candidates",
      "Running novelty check",
      "Patent FTO analysis",
      "Quality gate",
      "Converging",
    ];
    const runId = await startRun("CETP", ["small_molecule"]);
    const progress = await caller.design.getProgress({ runId });
    expect(KNOWN_LABELS).toContain(progress.stepLabel);
  }, 30_000);
});

// ─── getPatentArbitrage — topJurisdiction ────────────────────────────────────
describe("getPatentArbitrage — Sprint 16 topJurisdiction", () => {
  const VALID_JURISDICTIONS = ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"];

  it("every opportunity has a non-null topJurisdiction string", async () => {
    const runId = await startRun("PCSK9", ["small_molecule", "protein"]);
    const opps = await caller.design.getPatentArbitrage({ runId });
    expect(opps.length).toBeGreaterThan(0);
    for (const opp of opps) {
      expect(typeof (opp as never as { topJurisdiction: string }).topJurisdiction).toBe("string");
      expect((opp as never as { topJurisdiction: string }).topJurisdiction.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("topJurisdiction is a valid jurisdiction code", async () => {
    const runId = await startRun("HMGCR", ["small_molecule"]);
    const opps = await caller.design.getPatentArbitrage({ runId });
    for (const opp of opps) {
      expect(VALID_JURISDICTIONS).toContain((opp as never as { topJurisdiction: string }).topJurisdiction);
    }
  }, 30_000);

  it("HMGCR (CLEAR FTO) top opportunity topJurisdiction is a high-opportunity jurisdiction", async () => {
    const runId = await startRun("HMGCR", ["small_molecule"]);
    const opps = await caller.design.getPatentArbitrage({ runId });
    const top = opps[0] as never as { topJurisdiction: string; recommendation: string };
    // HMGCR is CLEAR → FILE_NOW → topJurisdiction should be a primary market
    expect(["US", "EP", "JP", "CN"]).toContain(top.topJurisdiction);
  }, 30_000);

  it("CETP (BLOCKED FTO, 9 patents) top opportunity is AVOID or DEFENSIVE_PUBLICATION", async () => {
    const runId = await startRun("CETP", ["small_molecule"]);
    const opps = await caller.design.getPatentArbitrage({ runId });
    const top = opps[0] as never as { recommendation: string };
    expect(["AVOID", "DEFENSIVE_PUBLICATION"]).toContain(top.recommendation);
  }, 30_000);

  it("arbitrage opportunities are sorted descending by overallIpGapScore", async () => {
    const runId = await startRun("TTR", ["small_molecule", "protein", "rna"]);
    const opps = await caller.design.getPatentArbitrage({ runId });
    for (let i = 1; i < opps.length; i++) {
      expect(opps[i - 1].overallIpGapScore).toBeGreaterThanOrEqual(opps[i].overallIpGapScore);
    }
  }, 30_000);
});
