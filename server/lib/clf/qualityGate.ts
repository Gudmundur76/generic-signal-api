/**
 * server/lib/clf/qualityGate.ts
 *
 * Inlined copy of cognitive-loop-framework/src/distribution/qualityGate.ts
 * 6-check quality gate applied to every candidate before delivery.
 */
import type {
  CandidatePackage,
  QualityCheck,
  QualityCheckName,
  QualityResult,
} from "./types";

export const QUALITY_THRESHOLDS = {
  novelty: 80,
  specificity: 75,
  fto: "CLEAR" as const,
  decodePValue: 1e-10,
  citationConfidence: 0.80,
  compositeScore: 70,
} as const;

export class QualityGate {
  private readonly thresholds: typeof QUALITY_THRESHOLDS;

  constructor(overrides: Partial<typeof QUALITY_THRESHOLDS> = {}) {
    this.thresholds = { ...QUALITY_THRESHOLDS, ...overrides };
  }

  evaluate(candidate: CandidatePackage): QualityResult {
    const checks: QualityCheck[] = [
      this.checkNovelty(candidate),
      this.checkSpecificity(candidate),
      this.checkFTO(candidate),
      this.checkDecodeSignificance(candidate),
      this.checkCitationConfidence(candidate),
      this.checkCompositeScore(candidate),
    ];
    const passed = checks.every((c) => c.passed);
    const qualityScore = this.calcQualityScore(checks);
    return {
      candidateId: candidate.id,
      passed,
      checks,
      qualityScore,
      summary: this.buildSummary(passed, checks, qualityScore),
    };
  }

  filter(candidates: CandidatePackage[]): CandidatePackage[] {
    return candidates.filter((c) => this.evaluate(c).passed);
  }

  private checkNovelty(c: CandidatePackage): QualityCheck {
    const passed = c.noveltyScore >= this.thresholds.novelty;
    return {
      name: "novelty", passed, value: c.noveltyScore, threshold: this.thresholds.novelty,
      reason: passed
        ? `Novelty ${c.noveltyScore.toFixed(1)} ≥ ${this.thresholds.novelty}`
        : `Novelty ${c.noveltyScore.toFixed(1)} below threshold ${this.thresholds.novelty}`,
    };
  }

  private checkSpecificity(c: CandidatePackage): QualityCheck {
    const passed = c.specificityScore >= this.thresholds.specificity;
    return {
      name: "specificity", passed, value: c.specificityScore, threshold: this.thresholds.specificity,
      reason: passed
        ? `Specificity ${c.specificityScore.toFixed(1)} ≥ ${this.thresholds.specificity}`
        : `Specificity ${c.specificityScore.toFixed(1)} below threshold ${this.thresholds.specificity}`,
    };
  }

  private checkFTO(c: CandidatePackage): QualityCheck {
    const passed = c.fto !== "BLOCKED";
    return {
      name: "fto", passed, value: c.fto, threshold: "not BLOCKED",
      reason: passed ? `FTO status: ${c.fto}` : `FTO BLOCKED — candidate cannot be filed`,
    };
  }

  private checkDecodeSignificance(c: CandidatePackage): QualityCheck {
    const pv = c.deCODEEvidence.pValue;
    const passed = pv <= this.thresholds.decodePValue;
    return {
      name: "decode_significance", passed, value: pv, threshold: this.thresholds.decodePValue,
      reason: passed
        ? `deCODE p-value ${pv.toExponential(2)} meets significance threshold`
        : `deCODE p-value ${pv.toExponential(2)} above threshold ${this.thresholds.decodePValue.toExponential(0)}`,
    };
  }

  private checkCitationConfidence(c: CandidatePackage): QualityCheck {
    const conf = c.citationEvidence.confidence;
    const passed = conf >= this.thresholds.citationConfidence;
    return {
      name: "citation_confidence", passed, value: conf, threshold: this.thresholds.citationConfidence,
      reason: passed
        ? `Citation confidence ${(conf * 100).toFixed(0)}% ≥ ${(this.thresholds.citationConfidence * 100).toFixed(0)}%`
        : `Citation confidence ${(conf * 100).toFixed(0)}% below threshold`,
    };
  }

  private checkCompositeScore(c: CandidatePackage): QualityCheck {
    const passed = c.compositeScore >= this.thresholds.compositeScore;
    return {
      name: "composite_score", passed, value: c.compositeScore, threshold: this.thresholds.compositeScore,
      reason: passed
        ? `Composite score ${c.compositeScore.toFixed(1)} ≥ ${this.thresholds.compositeScore}`
        : `Composite score ${c.compositeScore.toFixed(1)} below threshold ${this.thresholds.compositeScore}`,
    };
  }

  private calcQualityScore(checks: QualityCheck[]): number {
    const weights: Record<QualityCheckName, number> = {
      novelty: 0.25, specificity: 0.20, fto: 0.20,
      decode_significance: 0.15, citation_confidence: 0.10, composite_score: 0.10,
    };
    let score = 0;
    for (const check of checks) {
      const w = weights[check.name] ?? 0;
      score += this.normaliseCheck(check) * w;
    }
    return Math.round(score * 100);
  }

  private normaliseCheck(check: QualityCheck): number {
    if (check.name === "fto") return check.passed ? 1 : 0;
    if (check.name === "decode_significance") {
      const pv = check.value as number;
      return Math.min(1, -Math.log10(pv) / 60);
    }
    if (typeof check.value === "number") return Math.min(1, check.value / 100);
    return check.passed ? 1 : 0;
  }

  private buildSummary(passed: boolean, checks: QualityCheck[], score: number): string {
    const failed = checks.filter((c) => !c.passed).map((c) => c.name);
    if (passed) return `PASS — quality score ${score}/100. All 6 checks passed.`;
    return `FAIL — quality score ${score}/100. Failed: ${failed.join(", ")}.`;
  }
}

export const defaultGate = new QualityGate();
