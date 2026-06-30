/**
 * dnaEvolveBusClient.ts
 *
 * GitHub-bus replacement for the broken HTTP call to dna-evolve at localhost:4000.
 *
 * Instead of POST http://localhost:4000/v1/evolve (which fails on Manus),
 * this client:
 *   1. Writes a job JSON file to manus-persistent-drive/bus/dna-evolve/pending/
 *   2. Commits + pushes to GitHub
 *   3. Polls bus/dna-evolve/results/ until the job runner completes it
 *   4. Returns the DnaEvolveResult to the caller
 *
 * The dna-evolve job runner (src/bus/jobRunner.ts) picks up the job,
 * runs the evolution, and writes the result back to the bus.
 *
 * Environment variables:
 *   BUS_REPO_PATH   — path to manus-persistent-drive clone
 *   BUS_POLL_MS     — how often to poll for result (default: 30000 = 30s)
 *   BUS_TIMEOUT_MS  — max wait for result (default: 600000 = 10min)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { DnaEvolveResult } from './autonomousLoop';

// ── Config ────────────────────────────────────────────────────────────────────

const BUS_REPO = path.resolve(
  process.env.BUS_REPO_PATH ??
  path.join(__dirname, '../../../../manus-persistent-drive'),
);
const PENDING_DIR = path.join(BUS_REPO, 'bus/dna-evolve/pending');
const RESULTS_DIR = path.join(BUS_REPO, 'bus/dna-evolve/results');
const POLL_MS = parseInt(process.env.BUS_POLL_MS ?? '30000', 10);
const TIMEOUT_MS = parseInt(process.env.BUS_TIMEOUT_MS ?? '600000', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusEvolveRequest {
  seed: string;
  targetGene?: string;
  targetProtein?: string;
  targetTrait?: string;
  layer?: string;
  generations?: number;
  population?: number;
  topN?: number;
  verify?: boolean;
}

interface BusJob {
  jobId: string;
  createdAt: string;
  source: 'generic-signal-api';
  request: BusEvolveRequest;
}

interface BusResult {
  jobId: string;
  completedAt: string;
  source: 'dna-evolve';
  status: 'ok' | 'error';
  result?: DnaEvolveResult;
  error?: string;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function gitPull(): void {
  try {
    execSync('git pull --rebase --quiet', { cwd: BUS_REPO, stdio: 'pipe' });
  } catch {
    // non-fatal — may be offline
  }
}

function gitPush(message: string): void {
  execSync(
    `git add -A && git commit -m "${message}" && git push`,
    {
      cwd: BUS_REPO,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'generic-signal-bus',
        GIT_AUTHOR_EMAIL: 'bus@generic-signal',
        GIT_COMMITTER_NAME: 'generic-signal-bus',
        GIT_COMMITTER_EMAIL: 'bus@generic-signal',
      },
    },
  );
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Submit an evolution job to dna-evolve via the GitHub bus and wait for the result.
 *
 * Returns null if the bus repo is unavailable, the job times out, or the
 * job runner reports an error — matching the existing designCandidate() contract.
 */
export async function busDesignCandidate(
  request: BusEvolveRequest,
): Promise<DnaEvolveResult | null> {
  // Verify bus repo is accessible
  if (!fs.existsSync(PENDING_DIR)) {
    console.warn('[bus-client] Pending dir not found — bus repo may not be cloned');
    return null;
  }

  const gene = request.targetGene ?? 'unknown';
  const jobId = `job_${Date.now()}_${gene.toLowerCase()}`;
  const jobFile = path.join(PENDING_DIR, `${jobId}.json`);
  const resultFile = path.join(RESULTS_DIR, `${jobId}.json`);

  // Write job to pending/
  const job: BusJob = {
    jobId,
    createdAt: new Date().toISOString(),
    source: 'generic-signal-api',
    request,
  };

  try {
    fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), 'utf8');
    gitPush(`generic-signal: job ${jobId} for ${gene}`);
    console.log(`[bus-client] Job ${jobId} submitted for ${gene}`);
  } catch (e) {
    console.error('[bus-client] Failed to submit job:', e);
    return null;
  }

  // Poll for result
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    gitPull();

    if (fs.existsSync(resultFile)) {
      try {
        const raw = fs.readFileSync(resultFile, 'utf8');
        const busResult = JSON.parse(raw) as BusResult;

        if (busResult.status === 'error') {
          console.warn(`[bus-client] Job ${jobId} failed on runner:`, busResult.error);
          return null;
        }

        console.log(`[bus-client] Job ${jobId} complete — received result`);
        return busResult.result ?? null;
      } catch (e) {
        console.warn('[bus-client] Failed to parse result:', e);
        return null;
      }
    }

    const elapsed = Math.round((Date.now() - (deadline - TIMEOUT_MS)) / 1000);
    console.log(`[bus-client] Waiting for ${jobId}... (${elapsed}s elapsed)`);
  }

  console.warn(`[bus-client] Job ${jobId} timed out after ${TIMEOUT_MS / 1000}s`);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── isBusAvailable ────────────────────────────────────────────────────────────

/**
 * Returns true if the bus repo is cloned and the pending directory exists.
 * Used by autonomousLoop.ts to decide whether to use bus or HTTP.
 */
export function isBusAvailable(): boolean {
  return fs.existsSync(PENDING_DIR) && fs.existsSync(RESULTS_DIR);
}
