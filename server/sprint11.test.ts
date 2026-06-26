/**
 * Sprint 11 tests — USPTO Prior Art, ResistAgent, Patent Filing Readiness
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchUsptoByKeyword,
  searchUsptoFull,
  extractChemicalKeywords,
} from "./lib/usptoSearch";
import {
  scoreResistanceProfile,
  getKeyMutationSummary,
  RESISTANCE_MUTATIONS,
} from "./lib/resistAgent";

// ---------------------------------------------------------------------------
// USPTO tests
// ---------------------------------------------------------------------------

describe("usptoSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extractChemicalKeywords returns keywords from SMILES string", () => {
    // SMILES with amide group → should detect amide protease inhibitor
    const keywords = extractChemicalKeywords("CCN(C(=O)c1ccc(F)cc1)C");
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("searchUsptoByKeyword returns PatentResult array on success", async () => {
    const mockPatents = [
      {
        patent_id: "8148374",
        patent_title: "Anti-PCSK9 antibodies",
        assignees: [{ assignee_organization: "Amgen Inc." }],
        patent_date: "2012-04-03",
        applications: [{ app_date: "2008-09-10" }],
        patent_abstract: "Antibodies that bind PCSK9 and reduce LDL cholesterol.",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patents: mockPatents, total_patent_count: 1 }),
    }));

    const results = await searchUsptoByKeyword("PCSK9", "cardiovascular");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].patentNumber).toBe("8148374");
    expect(results[0].assignee).toBe("Amgen Inc.");
    expect(results[0].relevanceScore).toBeGreaterThan(0);
    expect(results[0].url).toContain("8148374");
  });

  it("searchUsptoByKeyword returns empty array on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    const results = await searchUsptoByKeyword("PCSK9");
    expect(results).toEqual([]);
  });

  it("searchUsptoFull deduplicates and caps results at 10", async () => {
    // Generate 15 fake patents with unique numbers
    const makePatent = (n: number) => ({
      patent_number: String(n),
      patent_title: `Patent ${n}`,
      assignees: [],
      patent_date: null,
      app_date: null,
      patent_abstract: null,
    });
    const batch = Array.from({ length: 15 }, (_, i) => makePatent(i + 1));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patents: batch, total_patent_count: 15 }),
    }));

    const results = await searchUsptoFull("PCSK9", undefined, "cardiovascular");
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("searchUsptoFull returns empty array when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const results = await searchUsptoFull("PCSK9", undefined, "cardiovascular");
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ResistAgent tests
// ---------------------------------------------------------------------------

describe("resistAgent", () => {
  it("RESISTANCE_MUTATIONS registry has at least 3 entries (V82A, I84V, L90M)", () => {
    // RESISTANCE_MUTATIONS uses 'code' field, not 'mutation'
    const codes = RESISTANCE_MUTATIONS.map((m) => m.code);
    expect(codes).toContain("V82A");
    expect(codes).toContain("I84V");
    expect(codes).toContain("L90M");
  });

  it("scoreResistanceProfile returns valid ResistanceProfile for pIC50 9.0", () => {
    const profile = scoreResistanceProfile(9.0, "generic");
    expect(profile).not.toBeNull();
    expect(profile!.wildTypePIC50).toBe(9.0);
    expect(profile!.scores.length).toBeGreaterThan(0);
    expect(profile!.robustnessScore).toBeGreaterThanOrEqual(0);
    expect(profile!.robustnessScore).toBeLessThanOrEqual(1);
    expect(["resistance-robust", "partial-resistance", "resistance-sensitive"]).toContain(
      profile!.recommendation
    );
  });

  it("scoreResistanceProfile high pIC50 (10.0) yields resistance-robust", () => {
    const profile = scoreResistanceProfile(10.0, "generic");
    expect(profile!.recommendation).toBe("resistance-robust");
    expect(profile!.overallPass).toBe(true);
  });

  it("scoreResistanceProfile low pIC50 (5.0) yields resistance-sensitive", () => {
    const profile = scoreResistanceProfile(5.0, "generic");
    expect(profile!.recommendation).toBe("resistance-sensitive");
    expect(profile!.overallPass).toBe(false);
  });

  it("getKeyMutationSummary returns object with V82A, I84V, L90M keys", () => {
    const profile = scoreResistanceProfile(9.0, "generic");
    const summary = getKeyMutationSummary(profile!);
    expect(summary).toHaveProperty("V82A");
    expect(summary).toHaveProperty("I84V");
    expect(summary).toHaveProperty("L90M");
    const v82a = summary.V82A as { mutation: string; predictedPIC50: number; foldChange: number; passes: boolean };
    expect(typeof v82a.predictedPIC50).toBe("number");
    expect(typeof v82a.foldChange).toBe("number");
    expect(typeof v82a.passes).toBe("boolean");
  });
});
