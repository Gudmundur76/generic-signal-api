/**
 * server/patentClearance.test.ts
 *
 * Sprint 10 — Patent Clear Path Assessment tests
 *
 * Tests:
 *   1. fetchChEMBLBioactivity returns canonicalSmiles for PCSK9 (network, skipped in CI)
 *   2. fetchChEMBLSimilarity returns array or empty array on no match
 *   3. getPatentClearance returns a verdict for each layer in a run
 *   4. CLEAR ftoStatus + no broad-claim risk → recommendation is "proceed"
 *   5. BLOCKED ftoStatus → recommendation is "do-not-file"
 *   6. Broad-claim family match → recommendation is "fto-analysis-required"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkBroadClaimRisk,
  derivePatentRecommendation,
  BROAD_CLAIM_FAMILIES,
} from "./lib/broadClaimFamilies";
import { appRouter } from "./routers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx() {
  return { user: null };
}

const caller = appRouter.createCaller(makeCtx() as any);

// ---------------------------------------------------------------------------
// Test 1: fetchChEMBLBioactivity shape includes canonicalSmiles field
// ---------------------------------------------------------------------------

describe("fetchChEMBLBioactivity", () => {
  it("returns a non-null object with a defined canonicalSmiles string for PCSK9", async () => {
    // fetchChEMBLBioactivity makes 4 sequential fetch calls:
    //   1. UniProt /uniprotkb/search  → resolves primaryAccession
    //   2. ChEMBL /target.json        → resolves target_chembl_id
    //   3. ChEMBL /activity.json      → resolves best molecule_chembl_id
    //   4. ChEMBL /molecule/<id>.json → resolves canonical_smiles
    const SMILES = "CC(C)(C)c1ccc(-c2ccc(C(=O)Nc3ccc(N4CCN(C)CC4)cc3)cc2)cc1";

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      // Call 1: UniProt accession lookup
      if (u.includes("uniprot.org")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ primaryAccession: "P04114" }] }),
        });
      }
      // Call 2: ChEMBL target lookup by UniProt accession
      if (u.includes("target.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ targets: [{ target_chembl_id: "CHEMBL2842", pref_name: "PCSK9" }] }),
        });
      }
      // Call 3: ChEMBL activity lookup
      if (u.includes("activity.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ activities: [{ standard_value: "5.2", molecule_chembl_id: "CHEMBL1201822" }] }),
        });
      }
      // Call 4: ChEMBL molecule SMILES lookup
      if (u.includes("molecule/CHEMBL1201822")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ molecule_structures: { canonical_smiles: SMILES } }),
        });
      }
      // Fallback — return ok with empty body so the function doesn't crash
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchChEMBLBioactivity } = await import("./lib/molecularData");
    const result = await fetchChEMBLBioactivity("PCSK9");
    vi.unstubAllGlobals();
    vi.resetModules();

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("canonicalSmiles");
    expect(result!.canonicalSmiles).toBe(SMILES);
  });
});

// ---------------------------------------------------------------------------
// Test 2: fetchChEMBLSimilarity returns array (empty on network failure)
// ---------------------------------------------------------------------------

describe("fetchChEMBLSimilarity", () => {
  it("returns an empty array when ChEMBL similarity endpoint is unavailable", async () => {
    const { fetchChEMBLSimilarity } = await import("./lib/molecularData");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await fetchChEMBLSimilarity("CC(=O)Oc1ccccc1C(=O)O", 70);
    vi.unstubAllGlobals();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns SimilarCompound objects when ChEMBL responds", async () => {
    const { fetchChEMBLSimilarity } = await import("./lib/molecularData");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            molecules: [
              {
                molecule_chembl_id: "CHEMBL25",
                similarity: 85,
                molecule_structures: { canonical_smiles: "CC(=O)Oc1ccccc1C(=O)O" },
                pref_name: "ASPIRIN",
                max_phase: 4,
              },
            ],
          }),
      })
    );
    const result = await fetchChEMBLSimilarity("CC(=O)Oc1ccccc1C(=O)O", 70);
    vi.unstubAllGlobals();

    expect(result.length).toBe(1);
    expect(result[0].chemblId).toBe("CHEMBL25");
    expect(result[0].similarity).toBe(85);
    expect(result[0].pref_name).toBe("ASPIRIN");
    expect(result[0].maxPhase).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Test 3: getPatentClearance returns a verdict for each layer in a run
// ---------------------------------------------------------------------------

describe("design.getPatentClearance", () => {
  it("returns one layerVerdict per requested layer in a multi-layer run", async () => {
    // Run with two layers to verify verdict coverage is per-layer, not per-run.
    const requestedLayers = ["dna", "small_molecule"] as const;
    const evolveRes = await caller.design.evolve({
      target: "PCSK9",
      layers: [...requestedLayers],
    });
    expect(evolveRes.runId).toBeTruthy();

    const clearance = await caller.design.getPatentClearance({
      runId: evolveRes.runId,
    });

    expect(clearance.runId).toBe(evolveRes.runId);
    expect(clearance.target).toBe("PCSK9");
    expect(Array.isArray(clearance.layerVerdicts)).toBe(true);
    // Must have exactly one verdict per requested layer
    expect(clearance.layerVerdicts.length).toBe(requestedLayers.length);

    const returnedLayers = clearance.layerVerdicts.map((v) => v.layer);
    for (const layer of requestedLayers) {
      expect(returnedLayers).toContain(layer);
    }

    for (const v of clearance.layerVerdicts) {
      expect(v).toHaveProperty("layer");
      expect(v).toHaveProperty("ftoStatus");
      expect(v).toHaveProperty("patentClearScore");
      expect(v).toHaveProperty("recommendation");
      expect(v).toHaveProperty("broadClaimFamilies");
      expect(v).toHaveProperty("similarKnownCompounds");
      expect(v.patentClearScore).toBeGreaterThanOrEqual(0);
      expect(v.patentClearScore).toBeLessThanOrEqual(100);
    }
  }, 30000);

  it("throws when runId does not exist", async () => {
    await expect(
      caller.design.getPatentClearance({ runId: "nonexistent-run-xyz" })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 4: CLEAR ftoStatus + no broad-claim risk → "proceed"
// ---------------------------------------------------------------------------

describe("derivePatentRecommendation", () => {
  it('returns "proceed" for CLEAR ftoStatus with no broad-claim families', () => {
    const result = derivePatentRecommendation("CLEAR", []);
    expect(result).toBe("proceed");
  });

  // ---------------------------------------------------------------------------
  // Test 5: BLOCKED ftoStatus → "do-not-file"
  // ---------------------------------------------------------------------------

  it('returns "do-not-file" for BLOCKED ftoStatus regardless of broad-claim families', () => {
    const result = derivePatentRecommendation("BLOCKED", []);
    expect(result).toBe("do-not-file");
  });

  it('returns "do-not-file" for BLOCKED ftoStatus even with high-risk families', () => {
    const highRiskFamily = BROAD_CLAIM_FAMILIES.find((f) => f.riskLevel === "high")!;
    const result = derivePatentRecommendation("BLOCKED", [highRiskFamily]);
    expect(result).toBe("do-not-file");
  });

  // ---------------------------------------------------------------------------
  // Test 6: Broad-claim family match → "fto-analysis-required"
  // ---------------------------------------------------------------------------

  it('returns "fto-analysis-required" for CLEAR ftoStatus with high-risk broad-claim family', () => {
    const highRiskFamily = BROAD_CLAIM_FAMILIES.find((f) => f.riskLevel === "high")!;
    const result = derivePatentRecommendation("CLEAR", [highRiskFamily]);
    expect(result).toBe("fto-analysis-required");
  });

  it('returns "proceed-with-caution" for CLEAR ftoStatus with only medium-risk families', () => {
    const mediumRiskFamily = BROAD_CLAIM_FAMILIES.find((f) => f.riskLevel === "medium")!;
    const result = derivePatentRecommendation("CLEAR", [mediumRiskFamily]);
    expect(result).toBe("proceed-with-caution");
  });
});

// ---------------------------------------------------------------------------
// checkBroadClaimRisk: PCSK9 + protein → Amgen family matched
// ---------------------------------------------------------------------------

describe("checkBroadClaimRisk", () => {
  it("matches Amgen anti-PCSK9 antibody family for PCSK9 protein layer", () => {
    const matches = checkBroadClaimRisk("PCSK9", "protein", "cardiovascular");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].assignee).toContain("Amgen");
    expect(matches[0].riskLevel).toBe("high");
  });

  it("matches CRISPR Broad Institute family for PCSK9 dna layer", () => {
    const matches = checkBroadClaimRisk("PCSK9", "dna", "cardiovascular");
    const broadInstitute = matches.find((f) => f.assignee.includes("Broad"));
    expect(broadInstitute).toBeDefined();
  });

  it("returns empty array for a gene not in any broad-claim family", () => {
    const matches = checkBroadClaimRisk("UNKNOWNGENE99", "protein", "cardiovascular");
    expect(matches.length).toBe(0);
  });
});
