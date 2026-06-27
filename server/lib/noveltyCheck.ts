/**
 * noveltyCheck.ts
 * Scores a molecular signal candidate for novelty against the citation corpus.
 * Returns a 0–100 novelty score; candidates scoring < 80 are filtered out.
 */

import { verifyClaim, type CitationResult } from "./citationClient.js";

export interface NoveltyCheckInput {
  candidateId: string;
  claim: string;
  domain?: string;
}

export interface NoveltyCheckResult {
  candidateId: string;
  noveltyScore: number; // 0–100
  status: CitationResult["status"];
  confidence: number;
  passes: boolean; // true if noveltyScore >= NOVELTY_THRESHOLD
  sources: CitationResult["sources"];
}

/** Minimum novelty score required to pass the pipeline gate. */
export const NOVELTY_THRESHOLD = 80;

/**
 * Maps a citation status + confidence to a 0–100 novelty score.
 * Unverified / Partially Supported → high novelty (novel territory)
 * Contradicted → low novelty (well-known / disproven)
 * Supported with high confidence → low novelty (already established)
 */
export function computeNoveltyScore(
  status: CitationResult["status"],
  confidence: number,
): number {
  switch (status) {
    case "Unverified":
      return 90;
    case "Partially Supported":
      return 85;
    case "Contradicted":
      // Contradicted claims are not novel — they are known-wrong
      return Math.max(0, 20 - Math.round(confidence * 20));
    case "Supported":
      // Fully supported = already known; score inversely proportional to confidence
      return Math.max(0, 100 - Math.round(confidence * 100));
    default:
      return 50;
  }
}

export async function checkNovelty(input: NoveltyCheckInput): Promise<NoveltyCheckResult> {
  const result = await verifyClaim({
    claim: input.claim,
    context: input.domain,
  });
  const noveltyScore = computeNoveltyScore(result.status, result.confidence);

  return {
    candidateId: input.candidateId,
    noveltyScore,
    status: result.status,
    confidence: result.confidence,
    passes: noveltyScore >= NOVELTY_THRESHOLD,
    sources: result.sources,
  };
}

export async function batchNoveltyCheck(
  inputs: NoveltyCheckInput[],
): Promise<NoveltyCheckResult[]> {
  return Promise.all(inputs.map(checkNovelty));
}
