/**
 * server/lib/clf/types.ts
 *
 * Inlined copy of cognitive-loop-framework/src/distribution/types.ts
 */
import type { TherapeuticArea } from "./decodeTargetList";

export interface CandidatePackage {
  id: string;
  gene: string;
  area: TherapeuticArea;
  sequence: string;
  layer: "dna" | "rna" | "protein" | "small_molecule";
  compositeScore: number;
  noveltyScore: number;
  specificityScore: number;
  fto: "CLEAR" | "RISK" | "BLOCKED";
  deCODEEvidence: {
    variantId: string;
    pValue: number;
    effectSize: number;
  };
  citationEvidence: {
    source: string;
    verdict: string;
    confidence: number;
  };
  provisionalDraft?: {
    background: string;
    summary: string;
    detailedDescription: string;
    claims: string[];
    filingDate: string;
  };
  recommendedAssay: string;
  validationThreshold: string;
  generatedAt: string;
}

export type QualityCheckName =
  | "novelty"
  | "specificity"
  | "fto"
  | "decode_significance"
  | "citation_confidence"
  | "composite_score";

export interface QualityCheck {
  name: QualityCheckName;
  passed: boolean;
  value: number | string;
  threshold: number | string;
  reason: string;
}

export interface QualityResult {
  candidateId: string;
  passed: boolean;
  checks: QualityCheck[];
  qualityScore: number;
  summary: string;
}
