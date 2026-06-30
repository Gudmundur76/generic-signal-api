/**
 * notusIsBusReader.ts — GitHub bus reader for notus-is discovery results.
 *
 * Reads the latest convergence candidates from
 * manus-persistent-drive/bus/notus-is/results/ as an alternative to
 * calling the notus-is HTTP endpoint directly (which is unreliable
 * between Manus-hosted services).
 *
 * This is the Priority 4 connection in the GitHub message bus architecture.
 * Falls back to the embedded curated SMILES in notusClient.ts if the bus
 * has no results yet.
 */

import * as fs from "fs";
import * as path from "path";

export interface BusCandidate {
  smiles: string;
  pic50: number;
  track: string;
  verified: boolean;
  citationVerdict?: string;
  citationConfidence?: number;
  verificationSources?: string[];
}

export interface NotusIsBusResult {
  runId: number;
  publishedAt: string;
  source: string;
  target: string;
  bestCandidate: BusCandidate | null;
  convergenceCandidates: BusCandidate[];
  cycleScore: number;
  noveltySignal: string | null;
}

/**
 * Read the latest notus-is discovery result from the GitHub bus.
 * Returns null if the bus is not mounted or has no results.
 */
export function readLatestNotusResult(busRepoPath?: string): NotusIsBusResult | null {
  const repoPath =
    busRepoPath ??
    process.env.BUS_REPO_PATH ??
    path.join(__dirname, "../../../manus-persistent-drive");
  const busDir = path.join(repoPath, "bus/notus-is/results");

  if (!fs.existsSync(busDir)) return null;

  try {
    const files = fs
      .readdirSync(busDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .sort()
      .reverse(); // newest first

    if (files.length === 0) return null;

    const latest = fs.readFileSync(path.join(busDir, files[0]), "utf8");
    return JSON.parse(latest) as NotusIsBusResult;
  } catch {
    return null;
  }
}

/**
 * Get the best SMILES from the notus-is bus, or null if unavailable.
 * Used by the autonomous loop's designCandidate step.
 */
export function getBestSmilesFromBus(busRepoPath?: string): string | null {
  const result = readLatestNotusResult(busRepoPath);
  return result?.bestCandidate?.smiles ?? null;
}

/**
 * Get all convergence candidates from the notus-is bus.
 * Returns an empty array if the bus is unavailable.
 */
export function getConvergenceCandidatesFromBus(
  busRepoPath?: string
): BusCandidate[] {
  const result = readLatestNotusResult(busRepoPath);
  return result?.convergenceCandidates ?? [];
}

/**
 * Check if the bus has fresh results (published within the last 24 hours).
 */
export function hasFreshBusResults(busRepoPath?: string): boolean {
  const result = readLatestNotusResult(busRepoPath);
  if (!result) return false;
  const publishedAt = new Date(result.publishedAt).getTime();
  const ageMs = Date.now() - publishedAt;
  return ageMs < 24 * 60 * 60 * 1000; // 24 hours
}
