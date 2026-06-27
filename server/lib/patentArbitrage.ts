/**
 * patentArbitrage.ts
 * Identifies patent arbitrage opportunities for high-scoring molecular candidates.
 * Compares patent coverage across jurisdictions and scores the IP gap.
 */

export type Jurisdiction = "US" | "EP" | "JP" | "CN" | "WO" | "CA" | "AU" | "IN";

export interface PatentCoverage {
  jurisdiction: Jurisdiction;
  patentCount: number;
  earliestPriority?: string;
  latestExpiry?: string;
  coverageScore: number; // 0–1, 1 = fully covered
}

export interface ArbitrageOpportunity {
  candidateId: string;
  candidateName: string;
  overallIpGapScore: number; // 0–100, higher = bigger gap = more opportunity
  coverageByJurisdiction: PatentCoverage[];
  highOpportunityJurisdictions: Jurisdiction[];
  estimatedFilingWindow: string;
  recommendation: "FILE_NOW" | "MONITOR" | "AVOID" | "DEFENSIVE_PUBLICATION";
}

const JURISDICTION_WEIGHTS: Record<Jurisdiction, number> = {
  US: 1.0,
  EP: 0.9,
  CN: 0.85,
  JP: 0.8,
  WO: 0.75,
  CA: 0.6,
  AU: 0.55,
  IN: 0.5,
};

export function computeArbitrageOpportunity(
  candidateId: string,
  candidateName: string,
  coverageByJurisdiction: PatentCoverage[],
): ArbitrageOpportunity {
  const coverageMap = new Map(coverageByJurisdiction.map((c) => [c.jurisdiction, c]));

  let weightedGapSum = 0;
  let totalWeight = 0;
  const highOpportunityJurisdictions: Jurisdiction[] = [];

  for (const [jurisdiction, weight] of Object.entries(JURISDICTION_WEIGHTS) as [
    Jurisdiction,
    number,
  ][]) {
    const coverage = coverageMap.get(jurisdiction);
    const coverageScore = coverage?.coverageScore ?? 0;
    const gap = 1 - coverageScore;
    weightedGapSum += gap * weight;
    totalWeight += weight;

    if (gap >= 0.6) {
      highOpportunityJurisdictions.push(jurisdiction);
    }
  }

  const overallIpGapScore =
    totalWeight > 0 ? Math.round((weightedGapSum / totalWeight) * 100) : 0;

  let recommendation: ArbitrageOpportunity["recommendation"];
  if (overallIpGapScore >= 70) {
    recommendation = "FILE_NOW";
  } else if (overallIpGapScore >= 45) {
    recommendation = "MONITOR";
  } else if (overallIpGapScore >= 20) {
    recommendation = "DEFENSIVE_PUBLICATION";
  } else {
    recommendation = "AVOID";
  }

  // Estimate filing window based on gap score
  const monthsToAct = Math.max(1, Math.round((100 - overallIpGapScore) / 10));
  const windowDate = new Date();
  windowDate.setMonth(windowDate.getMonth() + monthsToAct);
  const estimatedFilingWindow = windowDate.toISOString().slice(0, 7); // YYYY-MM

  return {
    candidateId,
    candidateName,
    overallIpGapScore,
    coverageByJurisdiction,
    highOpportunityJurisdictions,
    estimatedFilingWindow,
    recommendation,
  };
}

export function rankArbitrageOpportunities(
  opportunities: ArbitrageOpportunity[],
): ArbitrageOpportunity[] {
  return [...opportunities].sort((a, b) => b.overallIpGapScore - a.overallIpGapScore);
}
