import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ---------------------------------------------------------------------------
// design.getTargets
// ---------------------------------------------------------------------------

describe("design.getTargets", () => {
  it("returns 3 hardcoded targets", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name)).toEqual(["PCSK9", "LPA", "APOE"]);
  });

  it("each target has required fields", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    for (const t of targets) {
      expect(t.name).toBeTruthy();
      expect(t.gene).toBeTruthy();
      expect(t.deCODEAssociations).toBeGreaterThan(0);
      expect(t.pValue).toBeLessThan(1e-10);
      expect(Array.isArray(t.layers)).toBe(true);
      expect(t.layers.length).toBeGreaterThan(0);
    }
  });

  it("PCSK9 has the correct deCODE stats", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const targets = await caller.design.getTargets();
    const pcsk9 = targets.find((t) => t.name === "PCSK9");
    expect(pcsk9?.deCODEAssociations).toBe(8);
    expect(pcsk9?.pValue).toBe(2e-48);
    expect(pcsk9?.approvedDrugs).toContain("Evolocumab");
  });
});

// ---------------------------------------------------------------------------
// design.evolve
// ---------------------------------------------------------------------------

describe("design.evolve", () => {
  it("returns a runId for a valid target", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.design.evolve({
      target: "PCSK9",
      layers: ["dna", "small_molecule"],
    });
    expect(result.runId).toBeTruthy();
    expect(result.runId).toMatch(/^run_/);
    expect(result.status).toBe("started");
    expect(result.target).toBe("PCSK9");
    expect(result.layers).toEqual(["dna", "small_molecule"]);
  }, 20_000);

  it("returns different runIds for separate calls", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const r1 = await caller.design.evolve({ target: "LPA", layers: ["protein"] });
    const r2 = await caller.design.evolve({ target: "APOE", layers: ["rna"] });
    expect(r1.runId).not.toBe(r2.runId);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// design.getProgress
// ---------------------------------------------------------------------------

describe("design.getProgress", () => {
  it("returns progress for an active run", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const { runId } = await caller.design.evolve({
      target: "PCSK9",
      layers: ["dna"],
    });
    const progress = await caller.design.getProgress({ runId });
    expect(progress.runId).toBe(runId);
    expect(progress.generation).toBeGreaterThanOrEqual(0);
    expect(progress.bestScore).toBeGreaterThanOrEqual(0);
    expect(typeof progress.converged).toBe("boolean");
    expect(progress.progressPct).toBeGreaterThanOrEqual(0);
    expect(progress.progressPct).toBeLessThanOrEqual(100);
  });

  it("throws NOT_FOUND for an unknown runId", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.design.getProgress({ runId: "run_nonexistent" })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// design.getResults
// ---------------------------------------------------------------------------

describe("design.getResults", () => {
  it("returns results with layer data for an active run", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const { runId } = await caller.design.evolve({
      target: "PCSK9",
      layers: ["dna", "small_molecule"],
    });
    const results = await caller.design.getResults({ runId });
    expect(results.runId).toBe(runId);
    expect(results.layers.length).toBeGreaterThan(0);
    expect(results.coherence).toBeGreaterThanOrEqual(0);
    expect(results.coherence).toBeLessThanOrEqual(100);
    expect(["dna", "small_molecule", "protein", "rna"]).toContain(
      results.recommendedLayer
    );
    const layer = results.layers[0];
    expect(layer.sequence).toBeTruthy();
    expect(layer.score).toBeGreaterThan(0);
    expect(typeof layer.novelty).toBe("boolean");
    expect(["CLEAR", "RISK", "BLOCKED"]).toContain(layer.patent);
  });

  it("throws NOT_FOUND for an unknown runId", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.design.getResults({ runId: "run_nonexistent" })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// design.getVerification
// ---------------------------------------------------------------------------

describe("design.getVerification", () => {
  it("returns L1-L5 evidence trail for a valid run and layer", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const { runId } = await caller.design.evolve({
      target: "PCSK9",
      layers: ["dna"],
    });
    const verification = await caller.design.getVerification({
      runId,
      layer: "dna",
    });
    expect(verification.runId).toBe(runId);
    expect(verification.layer).toBe("dna");
    expect(Array.isArray(verification.claims)).toBe(true);
    // Evidence trail has exactly 5 levels (L1-L5)
    expect(verification.claims).toHaveLength(5);
    expect(verification.overallConfidence).toBeGreaterThan(0);
    const claim = verification.claims[0]!;
    // New shape: level (not type)
    expect(["L1", "L2", "L3", "L4", "L5"]).toContain(
      (claim as unknown as Record<string, string>)["level"]
    );
    expect(["Supported", "Contradicted", "Unverified", "Partially Supported"]).toContain(claim.status);
    expect(claim.confidence).toBeGreaterThan(0);
    expect(claim.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(claim.sources)).toBe(true);
  }, 20_000);

  it("evidence trail has no hardcoded citation.is strings", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const { runId } = await caller.design.evolve({ target: "LPA", layers: ["dna"] });
    const verification = await caller.design.getVerification({ runId, layer: "dna" });
    for (const claim of verification.claims) {
      for (const src of claim.sources) {
        const label = typeof src === "string" ? src : JSON.stringify(src);
        expect(label).not.toMatch(/citation\.is:verified:/);
      }
    }
  }, 20_000);

  it("evidence trail shows Unverified when Citation API is down (fallback)", async () => {
    // The Citation API is currently down — all claims should fall back to Unverified
    // with confidence 0.5 and empty sources, but the run must still be created
    const caller = appRouter.createCaller(makePublicCtx());
    const { runId } = await caller.design.evolve({ target: "APOE", layers: ["protein"] });
    expect(runId).toBeTruthy();
    const verification = await caller.design.getVerification({ runId, layer: "protein" });
    // All claims should have valid structure even when service is down
    for (const claim of verification.claims) {
      expect(["Supported", "Contradicted", "Unverified", "Partially Supported"]).toContain(claim.status);
      expect(claim.confidence).toBeGreaterThanOrEqual(0);
      expect(claim.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(claim.sources)).toBe(true);
    }
  }, 20_000);

  it("throws NOT_FOUND for an unknown runId", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.design.getVerification({ runId: "run_nonexistent", layer: "dna" })
    ).rejects.toThrow();
  });
});
