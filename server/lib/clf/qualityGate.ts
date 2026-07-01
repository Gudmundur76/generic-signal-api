/**
 * server/lib/clf/qualityGate.ts
 *
 * Inlined copy of cognitive-loop-framework/src/distribution/qualityGate.ts
 * 6-check quality gate applied to every candidate before delivery.
 *
 * Sprint 7: Added Evo 2 biological plausibility check (DNA layer only).
 * The gate now exposes an async `evaluateAsync()` method that calls the
 * NVIDIA NIM Evo 2 API when the candidate layer is "dna".
 * The synchronous `evaluate()` method is preserved for backward compatibility
 * and skips the Evo 2 check.
 */
import type {
  CandidatePackage,
  QualityCheck,
  QualityCheckName,
  QualityResult,
} from "./types";
import { scoreBiologicalPlausibility } from "../evo2Scorer";

export const QUALITY_THRESHOLDS = {
  novelty: 80,
  specificity: 75,
  fto: "CLEAR" as const,
  decodePValue: 1e-10,
  citationConfidence: 0.80,
  compositeScore: 70,
  evo2Plausibility: 0.6,
} as const;

/** Extended result that may include the Evo 2 plausibility score. */
export interface QualityResultWithEvo2 extends QualityResult {
  evo2Plausibility?: number;
}

export class QualityGate {
  private readonly thresholds: typeof QUALITY_THRESHOLDS;

  constructor(overrides: Partial<typeof QUALITY_THRESHOLDS> = {}) {
    this.thresholds = { ...QUALITY_THRESHOLDS, ...overrides };
  }

  /**
   * Synchronous evaluation — runs the 6 original checks only.
   * Preserved for backward compatibility. Does NOT call Evo 2.
   */
  evaluate(candidate: CandidatePackage): QualityResult {
    // Note: evaluate is synchronous. Parallel execution using Promise.all is implemented in evaluateAsync.
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

  /**
   * Async evaluation — runs all 6 checks, then optionally applies the Evo 2
   * biological plausibility check for DNA-layer candidates.
   *
   * Evo 2 behaviour:
   * - Only runs when candidate.layer === "dna" and candidate.sequence is set.
   * - If the API is unavailable or returns null, the check is SKIPPED (non-blocking).
   * - If plausibility < threshold (0.6), the candidate FAILS.
   * - Evo 2 is weighted at 15% of the composite quality score.
   */
  async evaluateAsync(candidate: CandidatePackage): Promise<QualityResultWithEvo2> {
    const checks: QualityCheck[] = await Promise.all([
      Promise.resolve(this.checkNovelty(candidate)),
      Promise.resolve(this.checkSpecificity(candidate)),
      Promise.resolve(this.checkFTO(candidate)),
      Promise.resolve(this.checkDecodeSignificance(candidate)),
      Promise.resolve(this.checkCitationConfidence(candidate)),
      Promise.resolve(this.checkCompositeScore(candidate)),
    ]);

    let evo2Plausibility: number | undefined;

    // Evo 2 check — DNA layer only
    if (candidate.layer === "dna" && candidate.sequence) {
      const evo2 = await scoreBiologicalPlausibility(candidate.sequence);
      if (evo2 !== null) {
        evo2Plausibility = evo2.plausibility;

        const evo2Check: QualityCheck = {
          name: "evo2_plausibility" as QualityCheckName,
          passed: evo2.plausibility >= this.thresholds.evo2Plausibility,
          value: evo2.plausibility,
          threshold: this.thresholds.evo2Plausibility,
          reason: evo2.plausibility >= this.thresholds.evo2Plausibility
            ? `Evo 2 plausibility ${evo2.plausibility.toFixed(2)} ≥ ${this.thresholds.evo2Plausibility} (perplexity ${evo2.perplexity.toFixed(2)})`
            : `Evo 2 plausibility ${evo2.plausibility.toFixed(2)} < ${this.thresholds.evo2Plausibility} — sequence biologically implausible`,
        };

        checks.push(evo2Check);
      }
    }

    const passed = checks.every((c) => c.passed);

    // Recalculate quality score with Evo 2 weighted at 15%
    const qualityScore = this.calcQualityScoreWithEvo2(checks, evo2Plausibility);

    const result: QualityResultWithEvo2 = {
      candidateId: candidate.id,
      passed,
      checks,
      qualityScore,
      summary: this.buildSummary(passed, checks, qualityScore),
    };

    if (evo2Plausibility !== undefined) {
      result.evo2Plausibility = evo2Plausibility;
    }

    return result;
  }

  filter(candidates: CandidatePackage[]): CandidatePackage[] {
    return candidates.filter((c) => this.evaluate(c).passed);
  }

  async filterAsync(candidates: CandidatePackage[]): Promise<CandidatePackage[]> {
    const results = await Promise.all(
      candidates.map(async (c) => ({ c, result: await this.evaluateAsync(c) }))
    );
    return results.filter(({ result }) => result.passed).map(({ c }) => c);
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
    const weights: Record<string, number> = {
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

  /**
   * Quality score with Evo 2 weighted at 15%.
   * The existing 6 checks are scaled down proportionally to accommodate the
   * new weight without exceeding 100.
   *
   * Original weights sum to 1.0:
   *   novelty 0.25, specificity 0.20, fto 0.20, decode 0.15, citation 0.10, composite 0.10
   * With Evo 2 at 0.15, remaining budget = 0.85 → scale factor = 0.85.
   */
  private calcQualityScoreWithEvo2(
    checks: QualityCheck[],
    evo2Plausibility: number | undefined
  ): number {
    if (evo2Plausibility === undefined) {
      return this.calcQualityScore(checks);
    }

    const baseWeights: Record<string, number> = {
      novelty: 0.25, specificity: 0.20, fto: 0.20,
      decode_significance: 0.15, citation_confidence: 0.10, composite_score: 0.10,
    };
    const EVO2_WEIGHT = 0.15;
    const scaleFactor = 1 - EVO2_WEIGHT; // 0.85

    let score = 0;
    for (const check of checks) {
      if (check.name === "evo2_plausibility") continue;
      const w = (baseWeights[check.name] ?? 0) * scaleFactor;
      score += this.normaliseCheck(check) * w;
    }
    score += evo2Plausibility * EVO2_WEIGHT;
    return Math.round(score * 100);
  }

  private normaliseCheck(check: QualityCheck): number {
    if (check.name === "fto") return check.passed ? 1 : 0;
    if (check.name === "decode_significance") {
      const pv = check.value as number;
      return Math.min(1, -Math.log10(pv) / 60);
    }
    if (check.name === "evo2_plausibility") {
      return typeof check.value === "number" ? check.value : (check.passed ? 1 : 0);
    }
    if (typeof check.value === "number") return Math.min(1, check.value / 100);
    return check.passed ? 1 : 0;
  }

  private buildSummary(passed: boolean, checks: QualityCheck[], score: number): string {
    const total = checks.length;
    const failed = checks.filter((c) => !c.passed).map((c) => c.name);
    if (passed) return `PASS — quality score ${score}/100. All ${total} checks passed.`;
    return `FAIL — quality score ${score}/100. Failed: ${failed.join(", ")}.`;
  }
}

export const defaultGate = new QualityGate();
