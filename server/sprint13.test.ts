/**
 * Sprint 13 — Truth-Check Verification Tests
 *
 * These tests assert that the TARGETS catalogue and TARGET_EVIDENCE map
 * reflect the corrections identified in the June 2026 truth-check report:
 *
 *   1. APOE  — riskMarker=true, approvalStatus="preclinical", approvedDrugs=[]
 *   2. CETP  — approvalStatus="phase3_pre_approval", approvedDrugs=[]
 *   3. APOC3 — approvedDrugs includes olezarsen (FDA 2024)
 *   4. TTR   — patentCliffYear=2028 (Amvuttra earliest), tafamidisPatentCliffYear=2031
 *
 * Sources:
 *   APOE  — UniProt P02649; NCT03634007 is Alzheimer's gene therapy, not CVD
 *   CETP  — NCT05425745 BROOKLYN trial met endpoint July 2024; no approval yet
 *   APOC3 — Olezarsen (Tryngolza) FDA approval December 19, 2024
 *   TTR   — Pfizer settlement April 2026 extends tafamidis to June 1, 2031;
 *           Amvuttra patent ~Aug 2028; Onpattro ~April 2029
 *
 * Two test layers:
 *   - Direct TARGETS_FOR_TEST inspection (fast, no network)
 *   - tRPC getTargets caller (end-to-end, verifies the procedure returns the data)
 */

import { describe, it, expect } from "vitest";
import { TARGETS_FOR_TEST, TARGET_EVIDENCE_FOR_TEST } from "./routers/design";
import { appRouter } from "./routers";

// ---------------------------------------------------------------------------
// tRPC caller helper (mirrors design.test.ts pattern)
// ---------------------------------------------------------------------------

function makePublicCtx() {
  return { user: null, req: {} as any, res: {} as any };
}

async function getTargetsViaRPC() {
  const caller = appRouter.createCaller(makePublicCtx() as any);
  return caller.design.getTargets();
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getTarget(name: string) {
  const t = TARGETS_FOR_TEST.find((x) => x.name === name);
  if (!t) throw new Error(`Target ${name} not found in TARGETS catalogue`);
  return t as typeof t & {
    riskMarker: boolean;
    approvalStatus: string;
    patentCliffYear: number | undefined;
  };
}

// ---------------------------------------------------------------------------
// 1. APOE — genetic risk marker, not an active CVD drug target
// ---------------------------------------------------------------------------

describe("APOE truth-check corrections", () => {
  it("riskMarker is true — APOE is a CVD risk marker, not an active drug target", () => {
    const apoe = getTarget("APOE");
    expect(apoe.riskMarker).toBe(true);
  });

  it("approvalStatus is preclinical — no active CVD drug programme", () => {
    const apoe = getTarget("APOE");
    expect(apoe.approvalStatus).toBe("preclinical");
  });

  it("approvedDrugs is empty — no approved CVD drug targets APOE", () => {
    const apoe = getTarget("APOE");
    expect(apoe.approvedDrugs).toHaveLength(0);
  });

  it("patentCliffYear is undefined — no approved drug, no cliff", () => {
    const apoe = getTarget("APOE");
    expect(apoe.patentCliffYear).toBeUndefined();
  });

  it("description notes that NCT03634007 is an Alzheimer's trial, not CVD", () => {
    const apoe = getTarget("APOE");
    // The description must clarify the Alzheimer's context
    expect(apoe.description.toLowerCase()).toMatch(/alzheimer/);
    expect(apoe.description).toMatch(/NCT03634007/);
  });

  it("TARGET_EVIDENCE clinicalConfidence is reduced to reflect no CVD programme", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["APOE"];
    expect(evidence).toBeDefined();
    // Must be below 0.70 — the old value was 0.72; corrected to 0.55
    expect(evidence!.clinicalConfidence).toBeLessThan(0.70);
  });

  it("TARGET_EVIDENCE clinicalTrialId points to NCT03634007 (Alzheimer's gene therapy)", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["APOE"];
    expect(evidence!.clinicalTrialId).toBe("NCT03634007");
  });
});

// ---------------------------------------------------------------------------
// 2. CETP — Phase 3 pre-approval (obicetrapib BROOKLYN trial met endpoint July 2024)
// ---------------------------------------------------------------------------

describe("CETP truth-check corrections", () => {
  it("approvalStatus is phase3_pre_approval — obicetrapib not yet approved", () => {
    const cetp = getTarget("CETP");
    expect(cetp.approvalStatus).toBe("phase3_pre_approval");
  });

  it("approvedDrugs is empty — no CETP inhibitor is approved as of June 2026", () => {
    const cetp = getTarget("CETP");
    expect(cetp.approvedDrugs).toHaveLength(0);
  });

  it("patentCliffYear is undefined — obicetrapib patent ~2043, no near-term cliff", () => {
    const cetp = getTarget("CETP");
    expect(cetp.patentCliffYear).toBeUndefined();
  });

  it("description mentions obicetrapib and BROOKLYN trial", () => {
    const cetp = getTarget("CETP");
    expect(cetp.description.toLowerCase()).toMatch(/obicetrapib/);
    expect(cetp.description).toMatch(/BROOKLYN/);
  });

  it("TARGET_EVIDENCE clinicalTrialId is NCT05425745 (BROOKLYN, not REVEAL)", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["CETP"];
    expect(evidence).toBeDefined();
    // REVEAL (anacetrapib, NCT02545592) failed; BROOKLYN (obicetrapib, NCT05425745) met endpoint
    expect(evidence!.clinicalTrialId).toBe("NCT05425745");
    expect(evidence!.clinicalTrialId).not.toBe("NCT02545592");
  });
});

// ---------------------------------------------------------------------------
// 3. APOC3 — olezarsen (Tryngolza) FDA approved December 19, 2024
// ---------------------------------------------------------------------------

describe("APOC3 truth-check corrections", () => {
  it("approvedDrugs includes olezarsen with FDA 2024 annotation", () => {
    const apoc3 = getTarget("APOC3");
    const hasOlezarsen = apoc3.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("olezarsen") && d.includes("2024")
    );
    expect(hasOlezarsen).toBe(true);
  });

  it("approvedDrugs includes volanesorsen (EMA 2019)", () => {
    const apoc3 = getTarget("APOC3");
    const hasVolanesorsen = apoc3.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("volanesorsen")
    );
    expect(hasVolanesorsen).toBe(true);
  });

  it("approvedDrugs has at least 2 entries (volanesorsen + olezarsen)", () => {
    const apoc3 = getTarget("APOC3");
    expect(apoc3.approvedDrugs.length).toBeGreaterThanOrEqual(2);
  });

  it("approvalStatus is approved", () => {
    const apoc3 = getTarget("APOC3");
    expect(apoc3.approvalStatus).toBe("approved");
  });

  it("TARGET_EVIDENCE clinicalTrialId updated to olezarsen trial NCT05185843", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["APOC3"];
    expect(evidence).toBeDefined();
    expect(evidence!.clinicalTrialId).toBe("NCT05185843");
  });

  it("TARGET_EVIDENCE clinicalConfidence raised to ≥0.88 after olezarsen FDA approval", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["APOC3"];
    expect(evidence!.clinicalConfidence).toBeGreaterThanOrEqual(0.88);
  });
});

// ---------------------------------------------------------------------------
// 4. TTR — tafamidis patent cliff corrected to 2031 (Pfizer settlement April 2026)
// ---------------------------------------------------------------------------

describe("TTR truth-check corrections", () => {
  it("approvedDrugs has 4 entries (tafamidis, patisiran, vutrisiran, inotersen)", () => {
    const ttr = getTarget("TTR");
    expect(ttr.approvedDrugs.length).toBeGreaterThanOrEqual(4);
  });

  it("approvedDrugs includes tafamidis with 2031 patent cliff annotation", () => {
    const ttr = getTarget("TTR");
    const hasTafamidis = ttr.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("tafamidis") && d.includes("2031")
    );
    expect(hasTafamidis).toBe(true);
  });

  it("approvedDrugs includes patisiran with ~2029 annotation", () => {
    const ttr = getTarget("TTR");
    const hasPatisiran = ttr.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("patisiran") && d.includes("2029")
    );
    expect(hasPatisiran).toBe(true);
  });

  it("approvedDrugs includes vutrisiran with ~2028 annotation", () => {
    const ttr = getTarget("TTR");
    const hasVutrisiran = ttr.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("vutrisiran") && d.includes("2028")
    );
    expect(hasVutrisiran).toBe(true);
  });

  it("patentCliffYear is 2028 (Amvuttra/vutrisiran is the earliest cliff)", () => {
    const ttr = getTarget("TTR");
    expect(ttr.patentCliffYear).toBe(2028);
  });

  it("description mentions tafamidis patent extension to June 2031", () => {
    const ttr = getTarget("TTR");
    expect(ttr.description).toMatch(/2031/);
    expect(ttr.description.toLowerCase()).toMatch(/tafamidis/);
  });

  it("TARGET_EVIDENCE clinicalConfidence raised to ≥0.94 (4 approved drugs)", () => {
    const evidence = TARGET_EVIDENCE_FOR_TEST["TTR"];
    expect(evidence).toBeDefined();
    expect(evidence!.clinicalConfidence).toBeGreaterThanOrEqual(0.94);
  });
});

// ---------------------------------------------------------------------------
// 5. Sanity checks — targets that should NOT have been changed
// ---------------------------------------------------------------------------

describe("Unchanged targets sanity checks", () => {
  it("PCSK9 has 3 approved drugs (evolocumab, alirocumab, inclisiran)", () => {
    const pcsk9 = getTarget("PCSK9");
    expect(pcsk9.approvedDrugs.length).toBeGreaterThanOrEqual(3);
    expect(pcsk9.riskMarker).toBe(false);
    expect(pcsk9.approvalStatus).toBe("approved");
    expect(pcsk9.patentCliffYear).toBe(2027);
  });

  it("ANGPTL3 has evinacumab (FDA 2021) and no near-term patent cliff", () => {
    const angptl3 = getTarget("ANGPTL3");
    const hasEvinacumab = angptl3.approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("evinacumab")
    );
    expect(hasEvinacumab).toBe(true);
    expect(angptl3.patentCliffYear).toBeUndefined();
    expect(angptl3.riskMarker).toBe(false);
  });

  it("HMGCR has statins listed as generic (post-cliff) and no upcoming cliff", () => {
    const hmgcr = getTarget("HMGCR");
    expect(hmgcr.approvedDrugs.length).toBeGreaterThanOrEqual(3);
    expect(hmgcr.patentCliffYear).toBeUndefined(); // All statins already generic
    expect(hmgcr.riskMarker).toBe(false);
  });

  it("LPA has no approved drugs and is phase3_pre_approval", () => {
    const lpa = getTarget("LPA");
    expect(lpa.approvedDrugs).toHaveLength(0);
    expect(lpa.approvalStatus).toBe("phase3_pre_approval");
    expect(lpa.patentCliffYear).toBeUndefined();
    expect(lpa.riskMarker).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. tRPC-level tests — design.getTargets() end-to-end
// ---------------------------------------------------------------------------

describe("design.getTargets tRPC-level truth-check", () => {
  it("APOE: riskMarker=true and approvedDrugs=[] via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const apoe = targets.find((t: any) => t.name === "APOE");
    expect(apoe).toBeDefined();
    expect((apoe as any).riskMarker).toBe(true);
    expect((apoe as any).approvedDrugs).toHaveLength(0);
    expect((apoe as any).approvalStatus).toBe("preclinical");
  });

  it("CETP: approvalStatus=phase3_pre_approval and approvedDrugs=[] via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const cetp = targets.find((t: any) => t.name === "CETP");
    expect(cetp).toBeDefined();
    expect((cetp as any).approvalStatus).toBe("phase3_pre_approval");
    expect((cetp as any).approvedDrugs).toHaveLength(0);
    expect((cetp as any).riskMarker).toBe(false);
  });

  it("APOC3: approvedDrugs includes olezarsen (FDA 2024) via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const apoc3 = targets.find((t: any) => t.name === "APOC3");
    expect(apoc3).toBeDefined();
    const hasOlezarsen = (apoc3 as any).approvedDrugs.some((d: string) =>
      d.toLowerCase().includes("olezarsen") && d.includes("2024")
    );
    expect(hasOlezarsen).toBe(true);
    expect((apoc3 as any).approvedDrugs.length).toBeGreaterThanOrEqual(2);
  });

  it("TTR: patentCliffYear=2028 (Amvuttra earliest) via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const ttr = targets.find((t: any) => t.name === "TTR");
    expect(ttr).toBeDefined();
    expect((ttr as any).patentCliffYear).toBe(2028);
  });

  it("TTR: tafamidisPatentCliffYear=2031 (Pfizer settlement April 2026) via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const ttr = targets.find((t: any) => t.name === "TTR");
    expect(ttr).toBeDefined();
    expect((ttr as any).tafamidisPatentCliffYear).toBe(2031);
  });

  it("TTR: approvedDrugs has 4 entries via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const ttr = targets.find((t: any) => t.name === "TTR");
    expect((ttr as any).approvedDrugs.length).toBeGreaterThanOrEqual(4);
  });

  it("PCSK9: riskMarker=false and 3 approved drugs via tRPC", async () => {
    const targets = await getTargetsViaRPC();
    const pcsk9 = targets.find((t: any) => t.name === "PCSK9");
    expect(pcsk9).toBeDefined();
    expect((pcsk9 as any).riskMarker).toBe(false);
    expect((pcsk9 as any).approvalStatus).toBe("approved");
    expect((pcsk9 as any).approvedDrugs.length).toBeGreaterThanOrEqual(3);
  });
});
