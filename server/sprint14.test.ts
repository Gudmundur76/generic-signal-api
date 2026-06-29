/**
 * Sprint 14 tests — Infrastructure fixes: Notus embedded patent data + SMILES fallback
 *
 * Verifies:
 *  1. fetchPatentLandscape returns CLEAR/RISK/BLOCKED (never UNKNOWN) for all 8 targets
 *  2. PCSK9 returns RISK (4 active patents; threshold is now 5+ for BLOCKED)
 *  3. HMGCR returns CLEAR (all statin patents expired)
 *  4. APOE returns CLEAR (only expired diagnostic patent)
 *  5. CETP returns BLOCKED (9 active patents — Sprint 15 correction)
 *  6. FALLBACK_SMILES provides canonical SMILES + pIC50 for all 8 targets
 *  7. TTR fallback SMILES is tafamidis with pIC50 = 8.52
 *  8. HMGCR fallback SMILES is atorvastatin with pIC50 = 8.12 (Sprint 15: Burnett 1997)
 *  9. fetchMolecularData for small_molecule falls back to curated SMILES when ChEMBL unavailable
 * 10. Fallback MolecularData has canonicalSmiles and bioactivity.pIC50 set
 */

import { describe, it, expect } from "vitest";
import {
  fetchPatentLandscape,
  FALLBACK_SMILES,
} from "./lib/notusClient";

const ALL_TARGETS = ["PCSK9", "LPA", "APOE", "ANGPTL3", "CETP", "HMGCR", "APOC3", "TTR"] as const;

describe("Sprint 14 — notusClient embedded patent dataset", () => {
  it("returns a non-UNKNOWN ftoStatus for every target", async () => {
    for (const target of ALL_TARGETS) {
      const landscape = await fetchPatentLandscape(target);
      expect(
        landscape.ftoStatus,
        `${target} ftoStatus should not be UNKNOWN`
      ).not.toBe("UNKNOWN");
      expect(["CLEAR", "RISK", "BLOCKED"]).toContain(landscape.ftoStatus);
    }
  });

  it("PCSK9 — RISK (4 active patents; 5+ needed for BLOCKED: Amgen, Regeneron, Sanofi, Alnylam)", async () => {
    const landscape = await fetchPatentLandscape("PCSK9");
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(4);
    const assignees = landscape.patents.map((p) => p.assignee);
    expect(assignees).toContain("Amgen Inc.");
    expect(assignees).toContain("Regeneron Pharmaceuticals");
  });

  it("HMGCR — CLEAR (all statin patents expired)", async () => {
    const landscape = await fetchPatentLandscape("HMGCR");
    expect(landscape.ftoStatus).toBe("CLEAR");
    expect(landscape.totalBlockingPatents).toBe(0);
    // All records should be expired
    for (const p of landscape.patents) {
      expect(p.status).toBe("expired");
    }
  });

  it("APOE — CLEAR (only expired diagnostic patent)", async () => {
    const landscape = await fetchPatentLandscape("APOE");
    expect(landscape.ftoStatus).toBe("CLEAR");
    expect(landscape.totalBlockingPatents).toBe(0);
  });

  it("CETP — BLOCKED (9 active patents: NewAmsterdam Pharma portfolio, protection to 2043)", async () => {
    const landscape = await fetchPatentLandscape("CETP");
    expect(landscape.ftoStatus).toBe("BLOCKED");
    expect(landscape.totalBlockingPatents).toBe(9);
    const assignees = landscape.patents.map((p) => p.assignee);
    expect(assignees.every((a) => a === "NewAmsterdam Pharma" || a === "Pfizer Inc.")).toBe(true);
  });

  it("LPA — RISK (3 active patents: Novartis/olpasiran, Ionis/pelacarsen, Amgen method-of-use)", async () => {
    const landscape = await fetchPatentLandscape("LPA");
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(3);
  });

  it("TTR — RISK (4 active patents: Alnylam x2, Pfizer/tafamidis, Ionis; 5+ needed for BLOCKED)", async () => {
    const landscape = await fetchPatentLandscape("TTR");
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(4);
    // Tafamidis cliff should be 2031 (Pfizer settlement)
    const tafamidis = landscape.patents.find((p) => p.patentNumber === "US8,729,058");
    expect(tafamidis).toBeDefined();
    expect(tafamidis?.expirationDate).toBe("2031-06-01");
  });

  it("nearestExpiration is set for targets with active patents", async () => {
    const landscape = await fetchPatentLandscape("PCSK9");
    expect(landscape.nearestExpiration).toBeDefined();
    expect(typeof landscape.nearestExpiration).toBe("string");
    // Should be a valid date string
    expect(new Date(landscape.nearestExpiration!).getFullYear()).toBeGreaterThan(2026);
  });
});

describe("Sprint 14 — FALLBACK_SMILES curated dataset", () => {
  it("provides SMILES for all 8 targets", () => {
    for (const target of ALL_TARGETS) {
      const fb = FALLBACK_SMILES[target];
      expect(fb, `${target} should have fallback SMILES`).toBeDefined();
      expect(fb.smiles.length).toBeGreaterThan(10);
      expect(fb.pIC50).toBeGreaterThan(0);
      expect(fb.name.length).toBeGreaterThan(0);
    }
  });

  it("TTR fallback is tafamidis with pIC50 = 8.52", () => {
    const fb = FALLBACK_SMILES["TTR"];
    expect(fb.pIC50).toBe(8.52);
    expect(fb.name).toContain("Tafamidis");
    // Tafamidis SMILES should contain the benzoxazole core (oc(c(=O)[nH]) pattern)
    expect(fb.smiles).toContain("oc(");
  });

  it("HMGCR fallback is atorvastatin with pIC50 = 8.12 (Burnett 1997, IC50 7.5 nM)", () => {
    const fb = FALLBACK_SMILES["HMGCR"];
    expect(fb.pIC50).toBe(8.12);
    expect(fb.name).toContain("Atorvastatin");
  });

  it("CETP fallback is obicetrapib with pIC50 = 9.1 (highest in cohort)", () => {
    const fb = FALLBACK_SMILES["CETP"];
    expect(fb.pIC50).toBe(9.1);
    expect(fb.name).toContain("Obicetrapib");
  });

  it("all pIC50 values are in a realistic drug-like range (5.0–10.0)", () => {
    for (const target of ALL_TARGETS) {
      const fb = FALLBACK_SMILES[target];
      expect(fb.pIC50).toBeGreaterThanOrEqual(5.0);
      expect(fb.pIC50).toBeLessThanOrEqual(10.0);
    }
  });
});

describe("Sprint 14 — fetchMolecularData fallback integration", () => {
  it("returns curated MolecularData with canonicalSmiles for TTR small_molecule", async () => {
    // This test uses the real fetchMolecularData which will fall back to curated data
    // when ChEMBL is unavailable (as in sandbox environment)
    const { fetchMolecularData } = await import("./lib/molecularData");
    const data = await fetchMolecularData("TTR", "small_molecule");
    // Should always return something (either ChEMBL or fallback)
    expect(data).not.toBeNull();
    if (data) {
      // canonicalSmiles must be set (either from ChEMBL or fallback)
      expect(data.canonicalSmiles).toBeDefined();
      expect(data.canonicalSmiles!.length).toBeGreaterThan(5);
      // pIC50 must be set
      expect(data.bioactivity?.pIC50).toBeDefined();
      expect(data.bioactivity!.pIC50!).toBeGreaterThan(0);
    }
  }, 30000); // allow 30s for ChEMBL attempt + fallback

  it("returns curated MolecularData with canonicalSmiles for HMGCR small_molecule", async () => {
    const { fetchMolecularData } = await import("./lib/molecularData");
    const data = await fetchMolecularData("HMGCR", "small_molecule");
    expect(data).not.toBeNull();
    if (data) {
      expect(data.canonicalSmiles).toBeDefined();
      expect(data.bioactivity?.pIC50).toBeDefined();
    }
  }, 30000);
});
