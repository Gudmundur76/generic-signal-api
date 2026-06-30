/**
 * server/autonomousLoop.test.ts
 *
 * Tests for the Autonomous Distribution Loop.
 * All external API calls and DB operations are mocked.
 *
 * Test coverage:
 *   1. evaluateSignal PCSK9 confidence 0.90 → auto-approved
 *   2. evaluateSignal UNKNOWN99 confidence 0.90 → requires approval (novel target)
 *   3. evaluateSignal PCSK9 confidence 0.50 → should not act (below threshold)
 *   4. generateSeedForGene returns 20nt DNA string
 *   5. getLayerForGene PCSK9 → dna; ANGPTL3 → protein
 *   6. getTherapeuticArea PCSK9 → cardiovascular
 *   7. runAutonomousDistributionLoop with mock signals → correct LoopResult counts
 *   8. createApprovalRequest + getPendingApprovals + approveRequest full flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB helpers before importing the module under test ────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  insertDistributionEvent: vi.fn().mockResolvedValue(undefined),
  insertApprovalRequest: vi.fn().mockResolvedValue(undefined),
  getPendingApprovals: vi.fn().mockResolvedValue([
    {
      id: 1,
      gene: "UNKNOWN99",
      patentNumber: null,
      reason: "novel_target",
      status: "pending",
      confidence: 90,
      resolvedAt: null,
      createdAt: new Date(),
    },
  ]),
  resolveApprovalRequest: vi.fn().mockResolvedValue(undefined),
  getApprovalRequestById: vi.fn().mockResolvedValue({
    id: 1,
    gene: "UNKNOWN99",
    patentNumber: null,
    reason: "novel_target",
    status: "pending",
    confidence: 90,
    resolvedAt: null,
    createdAt: new Date(),
  }),
}));

// Mock owner notification — fire-and-forget, never throws
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally — default to returning a failed response so the loop
// falls back to the local DB path (which returns [] because getDb returns null)
const mockFetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 503,
  json: async () => ({}),
});
vi.stubGlobal("fetch", mockFetch);

import {
  evaluateSignal,
  generateSeedForGene,
  getLayerForGene,
  getTherapeuticArea,
  runAutonomousDistributionLoop,
  createApprovalRequest,
  getPendingApprovals,
  approveRequest,
  designCandidate,
  type PatentSignal,
  type DnaEvolveResult,
} from "./lib/autonomousLoop";

// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateSignal", () => {
  it("Test 1: PCSK9 with confidence 0.90 → auto-approved (shouldAct=true, requiresApproval=false)", () => {
    const signal: PatentSignal = { gene: "PCSK9", confidence: 0.90, source: "patent_cliff" };
    const decision = evaluateSignal(signal);
    expect(decision.shouldAct).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.reason).toBe("auto_approved");
  });

  it("Test 2: UNKNOWN99 with confidence 0.90 → requires approval (novel target)", () => {
    const signal: PatentSignal = { gene: "UNKNOWN99", confidence: 0.90, source: "patent_cliff" };
    const decision = evaluateSignal(signal);
    expect(decision.shouldAct).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toBe("novel_target");
  });

  it("Test 3: PCSK9 with confidence 0.50 → should not act (below minSignalConfidence 0.75)", () => {
    const signal: PatentSignal = { gene: "PCSK9", confidence: 0.50, source: "patent_cliff" };
    const decision = evaluateSignal(signal);
    expect(decision.shouldAct).toBe(false);
    expect(decision.reason).toBe("low_confidence");
  });
});

describe("generateSeedForGene", () => {
  it("Test 4: returns a 20-nucleotide DNA string", () => {
    const seed = generateSeedForGene("PCSK9");
    expect(seed).toHaveLength(20);
    expect(/^[ATGC]+$/.test(seed)).toBe(true);
  });

  it("produces different seeds for different genes", () => {
    const s1 = generateSeedForGene("PCSK9");
    const s2 = generateSeedForGene("LPA");
    expect(s1).not.toBe(s2);
  });
});

describe("getLayerForGene", () => {
  it("Test 5a: PCSK9 → dna", () => {
    expect(getLayerForGene("PCSK9")).toBe("dna");
  });

  it("Test 5b: ANGPTL3 → protein", () => {
    expect(getLayerForGene("ANGPTL3")).toBe("protein");
  });

  it("unknown gene defaults to dna", () => {
    expect(getLayerForGene("XYZGENE")).toBe("dna");
  });
});

describe("getTherapeuticArea", () => {
  it("Test 6: PCSK9 → cardiovascular", () => {
    expect(getTherapeuticArea("PCSK9")).toBe("cardiovascular");
  });

  it("APOE → neurodegenerative", () => {
    expect(getTherapeuticArea("APOE")).toBe("neurodegenerative");
  });

  it("unknown gene defaults to general", () => {
    expect(getTherapeuticArea("XYZGENE")).toBe("general");
  });
});

describe("runAutonomousDistributionLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch to fail — loop falls back to empty local DB
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
  });

  it("Test 7: returns a valid LoopResult with correct shape and counts when no signals found", async () => {
    const result = await runAutonomousDistributionLoop();

    expect(result).toHaveProperty("startedAt");
    expect(result).toHaveProperty("completedAt");
    expect(typeof result.signalsFound).toBe("number");
    expect(typeof result.candidatesDesigned).toBe("number");
    expect(typeof result.candidatesDelivered).toBe("number");
    expect(typeof result.approvalsRequired).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);

    // With no DB and no Notus, signals = 0, nothing delivered
    expect(result.signalsFound).toBe(0);
    expect(result.candidatesDelivered).toBe(0);
  });
});

describe("DnaEvolveResult enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 9a: designCandidate returns null when bus is unavailable and HTTP fails", async () => {
    // Bus unavailable (PENDING_DIR does not exist in test env)
    // HTTP fetch returns 503
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const signal: PatentSignal = { gene: "PCSK9", confidence: 0.90, source: "patent_cliff" };
    const result = await designCandidate(signal);
    expect(result).toBeNull();
  });

  it("Test 9b: designCandidate injects layer and notusEnriched into HTTP result", async () => {
    // Simulate HTTP returning a result without layer/notusEnriched
    const rawResult: Omit<DnaEvolveResult, "layer" | "notusEnriched"> = {
      version: "2.0.0",
      task: { targetGene: "PCSK9" },
      timing: { evolutionMs: 100, totalMs: 200 },
      topCandidates: [{ rank: 1, sequence: "GAGTCCGAGCAGAAGAAGAA", fitness: 75, generation: 10 }],
      qualityGate: { novelty: 70, specificity: 80, composite: 0.82, pass: true },
      verification: { confidence: 0.85, verdict: "Supported", pmids: ["12345678"] },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawResult,
    });
    const signal: PatentSignal = { gene: "PCSK9", confidence: 0.90, source: "patent_cliff" };
    const result = await designCandidate(signal);
    // enrichResult should inject layer from getLayerForGene("PCSK9") = "dna"
    expect(result).not.toBeNull();
    expect(result!.layer).toBe("dna");
    expect(result!.notusEnriched).toBe(false);
    // Verification should pass through unchanged
    expect(result!.verification?.confidence).toBe(0.85);
    expect(result!.verification?.verdict).toBe("Supported");
    expect(result!.verification?.pmids).toContain("12345678");
  });

  it("Test 9c: designCandidate preserves layer if already set by runner", async () => {
    const rawResult: DnaEvolveResult = {
      version: "2.0.0",
      task: { targetGene: "HMGCR" },
      timing: { evolutionMs: 100, totalMs: 200 },
      topCandidates: [{ rank: 1, sequence: "[SMILES_HMGCR]", fitness: 65, generation: 5 }],
      qualityGate: { novelty: 60, specificity: 70, composite: 0.75, pass: true },
      layer: "small_molecule", // runner already set this
      notusEnriched: true,
      verification: null,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawResult,
    });
    const signal: PatentSignal = { gene: "HMGCR", confidence: 0.90, source: "patent_cliff" };
    const result = await designCandidate(signal);
    expect(result).not.toBeNull();
    // Runner-provided layer should be preserved (not overwritten by getLayerForGene)
    expect(result!.layer).toBe("small_molecule");
    expect(result!.notusEnriched).toBe(true);
  });
});

describe("Approval flow", () => {
  it("Test 8: createApprovalRequest → getPendingApprovals → approveRequest full flow", async () => {
    const { insertApprovalRequest, resolveApprovalRequest } = await import("./db");

    const signal: PatentSignal = {
      gene: "UNKNOWN99",
      confidence: 0.90,
      source: "patent_cliff",
      patentNumber: "US9999999",
    };

    // Step 1: create approval request
    await createApprovalRequest(signal, "novel_target");
    expect(insertApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        gene: "UNKNOWN99",
        reason: "novel_target",
        status: "pending",
        confidence: 90,
      }),
    );

    // Step 2: get pending approvals
    const pending = await getPendingApprovals();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].gene).toBe("UNKNOWN99");
    expect(pending[0].status).toBe("pending");

    // Step 3: approve the request
    await approveRequest(1);
    expect(resolveApprovalRequest).toHaveBeenCalledWith(1, "approved");
  });
});
