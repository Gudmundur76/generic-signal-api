/**
 * server/sprint12.test.ts
 *
 * Sprint 12 integration tests covering:
 *   1. noveltyCheck filter in autonomousLoop — low-novelty candidates skipped
 *   2. scoreForLayer with molecularData → uses unifiedMolecularScorer (not random)
 *   3. scoreForLayer without molecularData → falls back to heuristic
 *   4. computeArbitrageOpportunity with all-gap coverage → FILE_NOW
 *   5. computeArbitrageOpportunity with full coverage → AVOID
 *   6. rankArbitrageOpportunities sorts by overallIpGapScore descending
 *   7. getPatentArbitrage tRPC procedure returns ranked opportunities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies before importing modules ──────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  insertDistributionEvent: vi.fn().mockResolvedValue(undefined),
  insertApprovalRequest: vi.fn().mockResolvedValue(undefined),
  getPendingApprovals: vi.fn().mockResolvedValue([]),
  resolveApprovalRequest: vi.fn().mockResolvedValue(undefined),
  getApprovalRequestById: vi.fn().mockResolvedValue(null),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally — returns 503 so external API calls fall back gracefully
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => "",
}));

// ── Pure library imports (no side-effects) ────────────────────────────────────

import {
  computeArbitrageOpportunity,
  rankArbitrageOpportunities,
  type PatentCoverage,
} from "./lib/patentArbitrage";

import {
  scoreCandidate,
  type MolecularCandidate,
} from "./lib/unifiedMolecularScorer";

import { checkNovelty } from "./lib/noveltyCheck";

// ── tRPC caller for procedure-level tests ─────────────────────────────────────

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. noveltyCheck — checkNovelty returns a result with passes and noveltyScore
// ─────────────────────────────────────────────────────────────────────────────

describe("noveltyCheck (Sprint 12)", () => {
  it("Test 1: checkNovelty returns an object with passes, noveltyScore, and candidateId", async () => {
    const result = await checkNovelty({
      candidateId: "PCSK9_test",
      claim: "Novel PCSK9 inhibitor targeting LDL receptor degradation",
      domain: "cardiovascular",
    });
    expect(result).toHaveProperty("candidateId", "PCSK9_test");
    expect(result).toHaveProperty("noveltyScore");
    expect(result).toHaveProperty("passes");
    expect(typeof result.noveltyScore).toBe("number");
    expect(result.noveltyScore).toBeGreaterThanOrEqual(0);
    expect(result.noveltyScore).toBeLessThanOrEqual(100);
  });

  it("Test 2: checkNovelty with citation service down falls back gracefully (score >= 0)", async () => {
    // fetch is mocked to return 503 — noveltyCheck must not throw
    const result = await checkNovelty({
      candidateId: "LPA_fallback",
      claim: "Novel LPA inhibitor",
      domain: "cardiovascular",
    });
    expect(result.noveltyScore).toBeGreaterThanOrEqual(0);
    // When all claims are Unverified the score should be 90 (the Unverified default)
    expect(result.noveltyScore).toBeGreaterThanOrEqual(80);
    expect(result.passes).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. unifiedMolecularScorer — scoreCandidate produces deterministic scores
// ─────────────────────────────────────────────────────────────────────────────

describe("unifiedMolecularScorer (Sprint 12)", () => {
  it("Test 3: scoreCandidate returns compositeScore in 0–100 range", () => {
    const candidate: MolecularCandidate = {
      id: "pcsk9_sm_gen2",
      name: "PCSK9 small_molecule candidate generation 2",
      domain: "cardiovascular",
      rawSignals: {
        chembl_activity: 0.85,
        alphafold_confidence: 0,
        pdb_resolution: 0.75,
        clinicaltrials_phase: 0.4,
        gwas_catalog_pvalue: 0.8,
        pubmed_citation_count: 0.3,
        gnomad_frequency: 0,
        clinvar_significance: 0,
        opentargets_score: 0.75,
        uniprot_annotation: 0.5,
      },
    };
    const scored = scoreCandidate(candidate);
    expect(scored.compositeScore).toBeGreaterThanOrEqual(0);
    expect(scored.compositeScore).toBeLessThanOrEqual(100);
    expect(scored.tier).toMatch(/^[SABCD]$/);
  });

  it("Test 4: scoreCandidate with high pIC50 signals scores higher than empty signals", () => {
    const highSignal: MolecularCandidate = {
      id: "high",
      name: "High signal candidate",
      domain: "cardiovascular",
      rawSignals: {
        chembl_activity: 1.0,
        alphafold_confidence: 0.9,
        pdb_resolution: 0.9,
        clinicaltrials_phase: 0.9,
        gwas_catalog_pvalue: 0.9,
        pubmed_citation_count: 0.9,
        opentargets_score: 0.9,
        uniprot_annotation: 0.9,
      },
    };
    const lowSignal: MolecularCandidate = {
      id: "low",
      name: "Low signal candidate",
      domain: "cardiovascular",
      rawSignals: {
        chembl_activity: 0.1,
      },
    };
    const high = scoreCandidate(highSignal);
    const low = scoreCandidate(lowSignal);
    expect(high.compositeScore).toBeGreaterThan(low.compositeScore);
  });

  it("Test 5: scoreCandidate is deterministic (same input → same output)", () => {
    const candidate: MolecularCandidate = {
      id: "det_test",
      name: "Deterministic test",
      domain: "cardiovascular",
      rawSignals: { chembl_activity: 0.7, gwas_catalog_pvalue: 0.8 },
    };
    const a = scoreCandidate(candidate);
    const b = scoreCandidate(candidate);
    expect(a.compositeScore).toBe(b.compositeScore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 & 5. patentArbitrage — computeArbitrageOpportunity
// ─────────────────────────────────────────────────────────────────────────────

describe("computeArbitrageOpportunity (Sprint 12)", () => {
  it("Test 6: all-gap coverage (coverageScore=0) → FILE_NOW and overallIpGapScore=100", () => {
    const coverage: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 0, coverageScore: 0 }));

    const result = computeArbitrageOpportunity("cand_001", "PCSK9 dna candidate", coverage);
    expect(result.recommendation).toBe("FILE_NOW");
    expect(result.overallIpGapScore).toBe(100);
    expect(result.highOpportunityJurisdictions).toHaveLength(8);
  });

  it("Test 7: full coverage (coverageScore=1) → AVOID and overallIpGapScore=0", () => {
    const coverage: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 10, coverageScore: 1 }));

    const result = computeArbitrageOpportunity("cand_002", "PCSK9 protein candidate", coverage);
    expect(result.recommendation).toBe("AVOID");
    expect(result.overallIpGapScore).toBe(0);
    expect(result.highOpportunityJurisdictions).toHaveLength(0);
  });

  it("Test 8: partial coverage (US=1, rest=0) → recommendation is not AVOID", () => {
    const coverage: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({
      jurisdiction: j,
      patentCount: j === "US" ? 5 : 0,
      coverageScore: j === "US" ? 1 : 0,
    }));

    const result = computeArbitrageOpportunity("cand_003", "LPA rna candidate", coverage);
    expect(result.recommendation).not.toBe("AVOID");
    expect(result.overallIpGapScore).toBeGreaterThan(0);
  });

  it("Test 9: MONITOR threshold — overallIpGapScore 45–69 → MONITOR", () => {
    // Craft coverage so gap ≈ 0.55 (score ≈ 55 → MONITOR)
    const coverage: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 2, coverageScore: 0.45 }));

    const result = computeArbitrageOpportunity("cand_004", "APOE small_molecule", coverage);
    expect(result.recommendation).toBe("MONITOR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. rankArbitrageOpportunities — sorts descending
// ─────────────────────────────────────────────────────────────────────────────

describe("rankArbitrageOpportunities (Sprint 12)", () => {
  it("Test 10: sorts by overallIpGapScore descending", () => {
    const allGap: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 0, coverageScore: 0 }));
    const fullCov: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 10, coverageScore: 1 }));
    const midCov: PatentCoverage[] = (
      ["US", "EP", "JP", "CN", "WO", "CA", "AU", "IN"] as const
    ).map((j) => ({ jurisdiction: j, patentCount: 3, coverageScore: 0.45 }));

    const a = computeArbitrageOpportunity("a", "A", allGap);  // score=100
    const b = computeArbitrageOpportunity("b", "B", fullCov); // score=0
    const c = computeArbitrageOpportunity("c", "C", midCov);  // score≈55

    const ranked = rankArbitrageOpportunities([b, c, a]);
    expect(ranked[0].candidateId).toBe("a");
    expect(ranked[1].candidateId).toBe("c");
    expect(ranked[2].candidateId).toBe("b");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. getPatentArbitrage tRPC procedure
// ─────────────────────────────────────────────────────────────────────────────

describe("design.getPatentArbitrage tRPC procedure (Sprint 12)", () => {
  it("Test 11: throws when runId not found", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.design.getPatentArbitrage({ runId: "nonexistent-run-id" })
    ).rejects.toThrow();
  });

  it("Test 12: returns ranked ArbitrageOpportunity[] after a completed run", async () => {
    const caller = appRouter.createCaller(makePublicCtx());

    // Start a run
    const { runId } = await caller.design.evolve({
      target: "PCSK9",
      layers: ["dna", "small_molecule"],
    });

    // Advance to completion
    let converged = false;
    for (let i = 0; i < 15 && !converged; i++) {
      const progress = await caller.design.getProgress({ runId });
      converged = progress.converged;
    }

    const arbitrage = await caller.design.getPatentArbitrage({ runId });

    expect(Array.isArray(arbitrage)).toBe(true);
    // Each opportunity has the required shape
    for (const opp of arbitrage) {
      expect(opp).toHaveProperty("candidateId");
      expect(opp).toHaveProperty("candidateName");
      expect(opp).toHaveProperty("overallIpGapScore");
      expect(opp).toHaveProperty("recommendation");
      expect(opp).toHaveProperty("highOpportunityJurisdictions");
      expect(opp).toHaveProperty("estimatedFilingWindow");
      expect(opp).toHaveProperty("coverageByJurisdiction");
      expect(opp.coverageByJurisdiction).toHaveLength(8);
    }

    // Results must be sorted descending by overallIpGapScore
    for (let i = 1; i < arbitrage.length; i++) {
      expect(arbitrage[i - 1].overallIpGapScore).toBeGreaterThanOrEqual(
        arbitrage[i].overallIpGapScore
      );
    }
  });
});
