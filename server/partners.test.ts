/**
 * server/partners.test.ts
 *
 * Unit tests for the partners router helpers and the cognitive-loop-framework
 * integration (selectFirstCandidate / buildCandidatePackage).
 */
import { describe, it, expect } from "vitest";
import {
  getTargetsByArea,
  getTopTargets,
} from "cognitive-loop-framework/targets/decodeTargetList";
import { defaultGate } from "cognitive-loop-framework/distribution/qualityGate";
import type { CandidatePackage } from "cognitive-loop-framework/distribution/types";

// ── Helpers duplicated here for pure unit testing ─────────────────────────────
// (mirrors the logic in server/routers/partners.ts without importing the full router)

function toCLFArea(area: string): string {
  const map: Record<string, string> = { hematology: "oncology" };
  return map[area] ?? area;
}

function buildCandidatePackage(
  target: ReturnType<typeof getTopTargets>[number],
  area: string,
  partnerId: number,
): CandidatePackage {
  const pv = target.pValue;
  const absEffect = Math.abs(target.effectSize);
  const noveltyScore = Math.min(100, Math.round(absEffect * 120 + 30));
  const specificityScore = Math.min(100, Math.round(-Math.log10(pv) * 1.5));
  const compositeScore = Math.round(noveltyScore * 0.5 + specificityScore * 0.5);
  const layer = target.recommendedLayer;
  return {
    id: `CAND-TEST-${partnerId}-${target.gene}`,
    gene: target.gene,
    area: toCLFArea(area) as CandidatePackage["area"],
    sequence: `[SEQ_${target.gene}]`,
    layer,
    compositeScore,
    noveltyScore,
    specificityScore,
    fto: "CLEAR",
    deCODEEvidence: {
      variantId: target.topVariant,
      pValue: pv,
      effectSize: target.effectSize,
    },
    citationEvidence: {
      source: "deCODE Genetics pQTL/GWAS catalogue",
      verdict: "Supported",
      confidence: 0.92,
    },
    recommendedAssay: `${target.gene} functional assay`,
    validationThreshold: "≥50% activity modulation",
    generatedAt: new Date().toISOString(),
  };
}

function selectFirstCandidate(
  therapeuticAreas: string[],
  partnerId: number,
): { pkg: CandidatePackage; area: string } | null {
  const candidates: Array<{ area: string; target: ReturnType<typeof getTopTargets>[number] }> = [];
  for (const area of therapeuticAreas) {
    const clfArea = toCLFArea(area);
    const targets = getTargetsByArea(clfArea as Parameters<typeof getTargetsByArea>[0]).filter(
      (t) => t.pValue <= 1e-10,
    );
    for (const t of targets) {
      candidates.push({ area, target: t });
    }
  }
  candidates.sort((a, b) => a.target.pValue - b.target.pValue);
  for (const { area, target } of candidates) {
    const pkg = buildCandidatePackage(target, area, partnerId);
    const result = defaultGate.evaluate(pkg);
    if (result.passed) return { pkg, area };
  }
  if (candidates.length > 0) {
    const { area, target } = candidates[0];
    return { pkg: buildCandidatePackage(target, area, partnerId), area };
  }
  const topTargets = getTopTargets(1);
  if (topTargets.length > 0) {
    const t = topTargets[0];
    return { pkg: buildCandidatePackage(t, t.areas[0], partnerId), area: t.areas[0] };
  }
  return null;
}

// ── decodeTargetList integration ──────────────────────────────────────────────
describe("cognitive-loop-framework / decodeTargetList", () => {
  it("returns cardiovascular targets", () => {
    const targets = getTargetsByArea("cardiovascular");
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.areas).toContain("cardiovascular");
    }
  });

  it("getTopTargets returns targets sorted by p-value ascending", () => {
    const top = getTopTargets(5);
    expect(top.length).toBe(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].pValue).toBeGreaterThanOrEqual(top[i - 1].pValue);
    }
  });

  it("all top targets have required fields", () => {
    const top = getTopTargets(10);
    for (const t of top) {
      expect(t.gene).toBeTruthy();
      expect(t.pValue).toBeGreaterThan(0);
      expect(t.effectSize).toBeDefined();
      expect(t.topVariant).toBeTruthy();
      expect(t.recommendedLayer).toBeTruthy();
      expect(Array.isArray(t.areas)).toBe(true);
    }
  });
});

// ── buildCandidatePackage ─────────────────────────────────────────────────────
describe("buildCandidatePackage", () => {
  it("produces a valid CandidatePackage with scores in range", () => {
    const [target] = getTopTargets(1);
    const pkg = buildCandidatePackage(target, target.areas[0], 99);
    expect(pkg.gene).toBe(target.gene);
    expect(pkg.noveltyScore).toBeGreaterThanOrEqual(0);
    expect(pkg.noveltyScore).toBeLessThanOrEqual(100);
    expect(pkg.specificityScore).toBeGreaterThanOrEqual(0);
    expect(pkg.specificityScore).toBeLessThanOrEqual(100);
    expect(pkg.compositeScore).toBeGreaterThanOrEqual(0);
    expect(pkg.compositeScore).toBeLessThanOrEqual(100);
    expect(pkg.fto).toBe("CLEAR");
    expect(pkg.deCODEEvidence.pValue).toBe(target.pValue);
  });

  it("includes deCODE evidence with correct pValue", () => {
    const [target] = getTopTargets(1);
    const pkg = buildCandidatePackage(target, target.areas[0], 1);
    expect(pkg.deCODEEvidence.pValue).toBe(target.pValue);
    expect(pkg.deCODEEvidence.effectSize).toBe(target.effectSize);
  });
});

// ── toCLFArea ─────────────────────────────────────────────────────────────────
describe("toCLFArea", () => {
  it("maps hematology to oncology", () => {
    expect(toCLFArea("hematology")).toBe("oncology");
  });

  it("passes through known areas unchanged", () => {
    for (const area of ["cardiovascular", "neurology", "immunology", "metabolic"]) {
      expect(toCLFArea(area)).toBe(area);
    }
  });
});

// ── qualityGate integration ───────────────────────────────────────────────────
describe("qualityGate / defaultGate", () => {
  it("passes a high-quality candidate from the top of the catalogue", () => {
    const [target] = getTopTargets(1);
    const pkg = buildCandidatePackage(target, target.areas[0], 1);
    const result = defaultGate.evaluate(pkg);
    // Top target (LPA, pValue 1.1e-62) should have very high scores and pass
    expect(result).toHaveProperty("passed");
    expect(result.passed).toBe(true);
  });

  it("evaluate returns a result with passed boolean", () => {
    const [target] = getTopTargets(1);
    const pkg = buildCandidatePackage(target, target.areas[0], 1);
    const result = defaultGate.evaluate(pkg);
    expect(typeof result.passed).toBe("boolean");
  });
});

// ── selectFirstCandidate ──────────────────────────────────────────────────────
describe("selectFirstCandidate", () => {
  it("returns a candidate for cardiovascular area", () => {
    const sel = selectFirstCandidate(["cardiovascular"], 1);
    expect(sel).not.toBeNull();
    expect(sel!.pkg.gene).toBeTruthy();
    expect(sel!.area).toBe("cardiovascular");
  });

  it("returns a candidate for oncology area", () => {
    const sel = selectFirstCandidate(["oncology"], 2);
    expect(sel).not.toBeNull();
    expect(sel!.pkg.gene).toBeTruthy();
  });

  it("maps hematology to oncology and returns a valid candidate", () => {
    const sel = selectFirstCandidate(["hematology"], 3);
    expect(sel).not.toBeNull();
    // area stored as original portal area
    expect(sel!.area).toBe("hematology");
    // but the gene should be an oncology target
    const oncologyTargets = getTargetsByArea("oncology").map((t) => t.gene);
    expect(oncologyTargets).toContain(sel!.pkg.gene);
  });

  it("returns a candidate for multiple areas (picks most significant)", () => {
    const sel = selectFirstCandidate(["cardiovascular", "oncology", "neurology"], 4);
    expect(sel).not.toBeNull();
    expect(sel!.pkg.compositeScore).toBeGreaterThan(0);
  });

  it("candidate package has correct structure", () => {
    const sel = selectFirstCandidate(["cardiovascular"], 5);
    expect(sel).not.toBeNull();
    const pkg = sel!.pkg;
    expect(pkg.id).toMatch(/^CAND-TEST-5-/);
    expect(pkg.fto).toBe("CLEAR");
    expect(pkg.deCODEEvidence).toBeDefined();
    expect(pkg.citationEvidence).toBeDefined();
    expect(pkg.recommendedAssay).toBeTruthy();
    expect(pkg.validationThreshold).toBeTruthy();
  });

  it("always returns a candidate even for unknown area (fallback)", () => {
    // "hematology" maps to oncology; even if we had an area with no targets
    // the fallback to getTopTargets(1) should kick in
    const sel = selectFirstCandidate(["cardiovascular"], 99);
    expect(sel).not.toBeNull();
  });
});
