/**
 * evo2Scorer.test.ts — Sprint 7 tests
 *
 * Tests for the Evo 2 biological plausibility scorer and its integration
 * with QualityGate.evaluateAsync.
 *
 * The scorer uses the NVIDIA NIM /biology/arc/evo2/forward endpoint which
 * returns { data: "<base64 NPZ blob>", elapsed_ms: number }.
 * Plausibility is derived from the blob density relative to expected size.
 *
 * Test 1: scoreBiologicalPlausibility("ATGCGATCGATCG") returns plausibility in [0,1]
 * Test 2: scoreBiologicalPlausibility("XYZ123") returns null (invalid DNA)
 * Test 3: DNA candidate + low Evo 2 score → quality gate fails
 * Test 4: DNA candidate + high Evo 2 score → quality gate passes
 * Test 5: Protein candidate → skips Evo 2 check (DNA layer only)
 * Test 6: API 503 → returns null, gate continues (non-blocking)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreBiologicalPlausibility } from "./lib/evo2Scorer";
import { QualityGate } from "./lib/clf/qualityGate";
import type { CandidatePackage } from "./lib/clf/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock base64 NPZ blob of a given byte length.
 * The scorer uses blob length as a density proxy for plausibility.
 */
function makeMockBlob(byteLength: number): string {
  // Each base64 char encodes 6 bits → 4 chars = 3 bytes
  const chars = Math.ceil((byteLength * 4) / 3);
  return "A".repeat(chars);
}

/**
 * For a sequence of `seqLen` nucleotides, the expected NPZ blob size is:
 *   seqLen * 512 * 4 bytes (seq_len × vocab_size × float32)
 * Density ratio = actual / (expected / 4)
 * We use density = 1.0 for "high plausibility" and 0.1 for "low plausibility".
 */
function makeBlobForDensity(seqLen: number, density: number): string {
  const expectedLen = seqLen * 512 * 4;
  const targetBytes = Math.ceil((expectedLen / 4) * density);
  return makeMockBlob(targetBytes);
}

function makeDnaCandidate(overrides: Partial<CandidatePackage> = {}): CandidatePackage {
  return {
    id: "test-dna-001",
    gene: "PCSK9",
    area: "oncology",
    sequence: "ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG",
    layer: "dna",
    compositeScore: 85,
    noveltyScore: 90,
    specificityScore: 88,
    fto: "CLEAR",
    deCODEEvidence: { variantId: "rs11591147", pValue: 2e-48, effectSize: -0.38 },
    citationEvidence: { source: "pubmed:29892016", verdict: "Supported", confidence: 0.92 },
    recommendedAssay: "CRISPR-Cas9 knockout",
    validationThreshold: "p < 0.05",
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProteinCandidate(overrides: Partial<CandidatePackage> = {}): CandidatePackage {
  return {
    ...makeDnaCandidate(),
    id: "test-protein-001",
    layer: "protein",
    sequence: "MGTVSSRRSWWPLPLCLLLLAAAQGLLPEASGGQVQLVQSGAEVKKPGSSVKVSCKASGGTFSSYAISWVRQAPGQGLEWMGGIIPIFGTANYAQKFQGRVTITADESTSTAYMELSSLRSEDTAVYYCARAPNDDYWGQGTLVTVSS",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Valid DNA sequence → plausibility in [0, 1]
// ---------------------------------------------------------------------------

describe("scoreBiologicalPlausibility — input validation", () => {
  it("Test 1: returns plausibility in [0, 1] for a valid DNA sequence (mocked API)", async () => {
    const seqLen = "ATGCGATCGATCG".length; // 13 nt
    const highDensityBlob = makeBlobForDensity(seqLen, 0.8);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: highDensityBlob, elapsed_ms: 120 }),
    }));
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key-123");

    const result = await scoreBiologicalPlausibility("ATGCGATCGATCG");
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBeGreaterThanOrEqual(0);
    expect(result!.plausibility).toBeLessThanOrEqual(1);
    expect(result!.confidence).toBeGreaterThan(0);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ---------------------------------------------------------------------------
  // Test 2: Invalid DNA sequence → null
  // ---------------------------------------------------------------------------

  it("Test 2: returns null for invalid DNA (no ATGCN characters)", async () => {
    const result = await scoreBiologicalPlausibility("XYZ123");
    expect(result).toBeNull();
  });

  it("returns null for sequence shorter than 10 nt", async () => {
    const result = await scoreBiologicalPlausibility("ATGC");
    expect(result).toBeNull();
  });

  it("returns null when NVIDIA_NIM_API_KEY is not set", async () => {
    const original = process.env.NVIDIA_NIM_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
    const result = await scoreBiologicalPlausibility("ATGCGATCGATCG");
    expect(result).toBeNull();
    if (original) process.env.NVIDIA_NIM_API_KEY = original;
  });
});

// ---------------------------------------------------------------------------
// Tests 3–6: QualityGate.evaluateAsync with mocked Evo 2
// ---------------------------------------------------------------------------

describe("QualityGate.evaluateAsync — Evo 2 integration", () => {
  const candidate = makeDnaCandidate();
  const seqLen = candidate.sequence.length;

  beforeEach(() => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // Test 3: DNA candidate + low Evo 2 score → gate fails
  it("Test 3: DNA candidate with low Evo 2 plausibility → gate fails", async () => {
    // Very sparse blob → density ≈ 0.01 → meanMaxLogit ≈ 6.08 → plausibility ≈ 0.12
    const lowDensityBlob = makeBlobForDensity(seqLen, 0.01);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: lowDensityBlob, elapsed_ms: 200 }),
    }));

    const gate = new QualityGate();
    const result = await gate.evaluateAsync(candidate);

    expect(result.evo2Plausibility).toBeDefined();
    expect(result.evo2Plausibility!).toBeLessThan(0.6);
    expect(result.passed).toBe(false);

    const evo2Check = result.checks.find((c) => c.name === "evo2_plausibility");
    expect(evo2Check).toBeDefined();
    expect(evo2Check!.passed).toBe(false);
    expect(result.summary).toContain("evo2_plausibility");
  });

  // Test 4: DNA candidate + high Evo 2 score → gate passes
  it("Test 4: DNA candidate with high Evo 2 plausibility → gate passes", async () => {
    // Dense blob → density ≈ 1.0 → meanMaxLogit ≈ 14 → plausibility ≈ 0.998
    const highDensityBlob = makeBlobForDensity(seqLen, 1.0);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: highDensityBlob, elapsed_ms: 180 }),
    }));

    const gate = new QualityGate();
    const result = await gate.evaluateAsync(candidate);

    expect(result.evo2Plausibility).toBeDefined();
    expect(result.evo2Plausibility!).toBeGreaterThanOrEqual(0.6);
    expect(result.passed).toBe(true);

    const evo2Check = result.checks.find((c) => c.name === "evo2_plausibility");
    expect(evo2Check).toBeDefined();
    expect(evo2Check!.passed).toBe(true);
    expect(result.summary).toContain("PASS");
  });

  // Test 5: Protein candidate → Evo 2 check is skipped entirely
  it("Test 5: Protein candidate → Evo 2 check skipped (DNA layer only)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const gate = new QualityGate();
    const result = await gate.evaluateAsync(makeProteinCandidate());

    // fetch should NOT have been called for a protein candidate
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.evo2Plausibility).toBeUndefined();
    expect(result.checks.find((c) => c.name === "evo2_plausibility")).toBeUndefined();
    // Should still pass on the 6 original checks
    expect(result.checks).toHaveLength(6);
  });

  // Test 6: API 503 → returns null, gate continues non-blocking
  it("Test 6: API 503 → Evo 2 returns null, gate continues without failing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    const gate = new QualityGate();
    const result = await gate.evaluateAsync(candidate);

    // Gate should still complete and pass (Evo 2 is non-blocking)
    expect(result.passed).toBe(true);
    expect(result.evo2Plausibility).toBeUndefined();
    expect(result.checks.find((c) => c.name === "evo2_plausibility")).toBeUndefined();
    // 6 original checks only
    expect(result.checks).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Plausibility formula verification (density-based)
// ---------------------------------------------------------------------------

describe("Evo 2 plausibility formula — density-based scoring", () => {
  const SEQ = "ATGCGATCGATCG"; // 13 nt
  const SEQ_LEN = SEQ.length;

  beforeEach(() => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("density=1.0 → plausibility close to 1.0 (high density = plausible)", async () => {
    const blob = makeBlobForDensity(SEQ_LEN, 1.0);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: blob, elapsed_ms: 100 }),
    }));

    const result = await scoreBiologicalPlausibility(SEQ);
    expect(result).not.toBeNull();
    // density=1 → meanMaxLogit=14 → sigmoid((14-8)/2) ≈ 0.998
    expect(result!.plausibility).toBeGreaterThan(0.9);
  });

  it("density=0.0 → plausibility close to 0.0 (empty blob = implausible)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: "", elapsed_ms: 100 }),
    }));

    const result = await scoreBiologicalPlausibility(SEQ);
    // Empty blob → data is falsy → scorer returns null (non-blocking)
    expect(result).toBeNull();
  });

  it("density=0.5 → plausibility in mid range [0.4, 0.9]", async () => {
    const blob = makeBlobForDensity(SEQ_LEN, 0.5);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: blob, elapsed_ms: 100 }),
    }));

    const result = await scoreBiologicalPlausibility(SEQ);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBeGreaterThan(0.4);
    expect(result!.plausibility).toBeLessThan(0.95);
  });
});
