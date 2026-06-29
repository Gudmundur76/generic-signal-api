/**
 * Sprint 15 tests — Complete Fact-Check Corrections
 *
 * Verifies all 6 corrections applied based on independent fact-check against
 * primary sources (USPTO PatentsView, FDA OOPD, DrugPatentWatch, Burnett 1997):
 *
 *  1. CETP: 9 active patents (not 1) — NewAmsterdam Pharma portfolio, protection to July 2043
 *  2. ANGPTL3: nearestExpiration = 2028-02-11 (FDA Orphan Drug Exclusivity, not ~2033)
 *  3. APOC3: 7 active patents (not 2) — olezarsen 6 US + 1 WO family
 *  4. PCSK9: 4 active patents, RISK status (multiple families per assignee noted)
 *  5. LPA: 3 active patents (not 2) — added Amgen olpasiran method-of-use
 *  6. HMGCR pIC50: 8.12 (not 8.9) — Burnett et al. 1997, IC50 = 7.5 nM
 */

import { describe, it, expect } from "vitest";
import { fetchPatentLandscape, FALLBACK_SMILES } from "./lib/notusClient";

describe("Sprint 15 — Fact-Check Corrections", () => {
  // ─── Correction 1: CETP ────────────────────────────────────────────────────
  it("CETP has 9 active patents (BLOCKED) — NewAmsterdam Pharma portfolio to 2043", async () => {
    const landscape = await fetchPatentLandscape("CETP");
    expect(landscape.ftoStatus).toBe("BLOCKED");
    expect(landscape.totalBlockingPatents).toBe(9);
    // All active patents should be from NewAmsterdam Pharma (expired Pfizer one excluded)
    const activeAssignees = landscape.patents.map((p) => p.assignee);
    expect(activeAssignees.every((a) => a === "NewAmsterdam Pharma")).toBe(true);
    // Most recent patent should protect to 2043
    const latestExpiry = landscape.patents
      .map((p) => new Date(p.expirationDate).getFullYear())
      .sort((a, b) => b - a)[0];
    expect(latestExpiry).toBe(2043);
  });

  it("CETP nearestExpiration is 2031 (earliest active patent)", async () => {
    const landscape = await fetchPatentLandscape("CETP");
    expect(landscape.nearestExpiration).toBeDefined();
    expect(new Date(landscape.nearestExpiration!).getFullYear()).toBe(2031);
  });

  // ─── Correction 2: ANGPTL3 ─────────────────────────────────────────────────
  it("ANGPTL3 nearestExpiration is 2028-02-11 (FDA Orphan Drug Exclusivity, not ~2033)", async () => {
    const landscape = await fetchPatentLandscape("ANGPTL3");
    expect(landscape.nearestExpiration).toBe("2028-02-11");
    // Should still be RISK (2 active patents)
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(2);
  });

  it("ANGPTL3 evinacumab patent has expirationDate 2028-02-11", async () => {
    const landscape = await fetchPatentLandscape("ANGPTL3");
    const evinacumab = landscape.patents.find((p) => p.patentNumber === "US10,428,158");
    expect(evinacumab).toBeDefined();
    expect(evinacumab?.expirationDate).toBe("2028-02-11");
    expect(evinacumab?.assignee).toBe("Regeneron Pharmaceuticals");
  });

  // ─── Correction 3: APOC3 ───────────────────────────────────────────────────
  it("APOC3 has 7 active patents (BLOCKED) — olezarsen 6 US + 1 WO family", async () => {
    const landscape = await fetchPatentLandscape("APOC3");
    expect(landscape.ftoStatus).toBe("BLOCKED");
    expect(landscape.totalBlockingPatents).toBe(7);
    // Should include the original Ionis ASO patent
    const original = landscape.patents.find((p) => p.patentNumber === "US9,163,239");
    expect(original).toBeDefined();
    // Should include the WO family with generic entry date May 1, 2034
    const wo = landscape.patents.find((p) => p.patentNumber === "WO2022/271818");
    expect(wo).toBeDefined();
    expect(wo?.expirationDate).toBe("2034-05-01");
  });

  it("APOC3 has patents from Ionis and Ionis/AstraZeneca", async () => {
    const landscape = await fetchPatentLandscape("APOC3");
    const assignees = landscape.patents.map((p) => p.assignee);
    expect(assignees.some((a) => a.includes("Ionis"))).toBe(true);
    expect(assignees.some((a) => a.includes("AstraZeneca"))).toBe(true);
  });

  // ─── Correction 4: PCSK9 ───────────────────────────────────────────────────
  it("PCSK9 has 4 active patents (RISK) — multiple families per assignee noted", async () => {
    const landscape = await fetchPatentLandscape("PCSK9");
    // 4 active patents = RISK (threshold is 5+ for BLOCKED)
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(4);
    // Verify multi-assignee coverage
    const assignees = landscape.patents.map((p) => p.assignee);
    expect(assignees).toContain("Amgen Inc.");
    expect(assignees).toContain("Regeneron Pharmaceuticals");
    expect(assignees).toContain("Sanofi");
    expect(assignees).toContain("Alnylam Pharmaceuticals");
  });

  // ─── Correction 5: LPA ─────────────────────────────────────────────────────
  it("LPA has 3 active patents (RISK) — added Amgen olpasiran method-of-use", async () => {
    const landscape = await fetchPatentLandscape("LPA");
    expect(landscape.ftoStatus).toBe("RISK");
    expect(landscape.totalBlockingPatents).toBe(3);
    // Should include the new Amgen olpasiran patent
    const amgen = landscape.patents.find((p) => p.patentNumber === "US11,898,142");
    expect(amgen).toBeDefined();
    expect(amgen?.assignee).toBe("Amgen Inc.");
    expect(amgen?.expirationDate).toBe("2041-04-15");
  });

  // ─── Correction 6: HMGCR pIC50 ─────────────────────────────────────────────
  it("HMGCR fallback pIC50 is 8.12 (Burnett 1997, IC50 = 7.5 nM)", () => {
    const fb = FALLBACK_SMILES["HMGCR"];
    expect(fb).toBeDefined();
    // pIC50 = -log10(7.5e-9) = 8.12 (Burnett et al. 1997)
    expect(fb.pIC50).toBe(8.12);
    expect(fb.name).toContain("Atorvastatin");
    expect(fb.name).toContain("7.5 nM");
    // Atorvastatin SMILES should contain the fluorophenyl group
    expect(fb.smiles).toContain("ccc(F)cc");
  });

  it("HMGCR pIC50 8.12 is lower than CETP obicetrapib 9.1 (correct ordering)", () => {
    const hmgcr = FALLBACK_SMILES["HMGCR"];
    const cetp = FALLBACK_SMILES["CETP"];
    expect(hmgcr.pIC50).toBeLessThan(cetp.pIC50);
    // CETP obicetrapib is the most potent in the cohort
    expect(cetp.pIC50).toBe(9.1);
  });

  // ─── Cross-target FTO summary ───────────────────────────────────────────────
  it("FTO summary matches corrected dataset: CLEAR=[HMGCR,APOE], RISK=[PCSK9,LPA,ANGPTL3,TTR], BLOCKED=[CETP,APOC3]", async () => {
    const targets = ["PCSK9", "LPA", "APOE", "ANGPTL3", "CETP", "HMGCR", "APOC3", "TTR"] as const;
    const results = await Promise.all(
      targets.map(async (t) => ({ target: t, ...(await fetchPatentLandscape(t)) }))
    );

    const byStatus = {
      CLEAR: results.filter((r) => r.ftoStatus === "CLEAR").map((r) => r.target),
      RISK: results.filter((r) => r.ftoStatus === "RISK").map((r) => r.target),
      BLOCKED: results.filter((r) => r.ftoStatus === "BLOCKED").map((r) => r.target),
    };

    expect(byStatus.CLEAR.sort()).toEqual(["APOE", "HMGCR"]);
    expect(byStatus.RISK.sort()).toEqual(["ANGPTL3", "LPA", "PCSK9", "TTR"]);
    expect(byStatus.BLOCKED.sort()).toEqual(["APOC3", "CETP"]);
  });
});
