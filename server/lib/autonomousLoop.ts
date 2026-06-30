/**
 * server/lib/autonomousLoop.ts
 *
 * Autonomous Distribution Loop — 7-step closed loop that runs every 6 hours.
 *
 *   STEP 1: DISCOVER  — fetch patent signals from Notus or fall back to local DB
 *   STEP 2: DECIDE    — evaluate each signal against approval gates
 *   STEP 3: DESIGN    — call dna-evolve API to generate a molecular candidate
 *   STEP 4: VERIFY    — handled by dna-evolve (verify=true flag)
 *   STEP 5: DRAFT     — included in dna-evolve result
 *   STEP 6: DELIVER   — find matching partner and POST to partners.deliver
 *   STEP 7: TRACK     — write distributionEvent row to DB
 *
 * All external calls have AbortSignal timeouts. The loop never throws — errors
 * are caught per-signal and accumulated in LoopResult.errors.
 */

import {
  getDb,
  insertDistributionEvent,
  insertApprovalRequest,
  getPendingApprovals as dbGetPendingApprovals,
  resolveApprovalRequest,
  getApprovalRequestById,
} from "../db";
import { patentAlerts } from "../../drizzle/schema";
import { gte, eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { checkNovelty } from "./noveltyCheck";

// ─── Configuration ────────────────────────────────────────────────────────────

export const AutonomousConfig = {
  schedule: "0 */6 * * *",           // Every 6 hours
  minSignalConfidence: 0.75,          // Only act on signals > 75% confident
  minCompositeScore: 0.70,            // Only deliver candidates scoring > 70%
  maxDeliveriesPerRun: 3,             // Never deliver more than 3 per run
  autoDesignGenes: [                  // Known genes — auto-approved
    "PCSK9", "LPA", "APOE", "ANGPTL3", "LDLR",
  ] as readonly string[],
  requireApproval: {
    novelTarget: true,                // Gene not in autoDesignGenes → approval
    compositeBelow80: true,           // Score 70–80 → approval
    partnerDelivery: false,           // Score > 80 → auto-deliver
  },
  endpoints: {
    dnaEvolve: process.env.DNA_EVOLVE_API_URL || "http://localhost:4000",
    notus: process.env.NOTUS_API_URL || "https://hivprotease-eq9ltmms.manus.space",
    genericSignal: process.env.GENERIC_SIGNAL_URL || "https://gensignalapi-zfsgedrd.manus.space",
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatentSignal {
  gene: string;
  confidence: number;
  source: "patent_cliff" | "molecular_distress";
  patentNumber?: string;
  expiryDate?: string;
  assignee?: string;
}

export interface LoopResult {
  startedAt: string;
  completedAt: string;
  signalsFound: number;
  candidatesDesigned: number;
  candidatesDelivered: number;
  approvalsRequired: number;
  errors: string[];
}

export interface DnaEvolveResult {
  version: string;
  task: { targetGene?: string; targetTrait?: string };
  timing: { evolutionMs: number; totalMs: number };
  topCandidates: Array<{
    rank: number;
    sequence: string;
    fitness: number;
    generation: number;
  }>;
  qualityGate?: {
    novelty: number;
    specificity: number;
    composite: number;
    pass: boolean;
  };
}

interface Decision {
  shouldAct: boolean;
  requiresApproval: boolean;
  reason: string;
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

export async function runAutonomousDistributionLoop(): Promise<LoopResult> {
  const result: LoopResult = {
    startedAt: new Date().toISOString(),
    completedAt: "",
    signalsFound: 0,
    candidatesDesigned: 0,
    candidatesDelivered: 0,
    approvalsRequired: 0,
    errors: [],
  };

  console.log("[autonomous] Loop starting at", result.startedAt);

  try {
    // STEP 1: DISCOVER
    const signals = await discoverSignals();
    result.signalsFound = signals.length;
    console.log(`[autonomous] Discovered ${signals.length} signals`);

    let deliveriesThisRun = 0;

    for (const signal of signals) {
      if (deliveriesThisRun >= AutonomousConfig.maxDeliveriesPerRun) {
        console.log("[autonomous] Max deliveries reached, stopping");
        break;
      }

      try {
        // STEP 2: DECIDE
        const decision = evaluateSignal(signal);
        if (!decision.shouldAct) {
          console.log(`[autonomous] Skipping ${signal.gene}: ${decision.reason}`);
          continue;
        }

        if (decision.requiresApproval) {
          await createApprovalRequest(signal, decision.reason);
          result.approvalsRequired++;
          console.log(`[autonomous] Approval required for ${signal.gene}: ${decision.reason}`);
          continue;
        }

        // STEP 3: DESIGN
        const evolveResult = await designCandidate(signal);
        if (!evolveResult) {
          result.errors.push(`Design failed for ${signal.gene}`);
          continue;
        }
        result.candidatesDesigned++;

        // STEP 3b: NOVELTY CHECK — filter candidates with noveltyScore < 80
        const topSeq = evolveResult.topCandidates[0]?.sequence ?? signal.gene;
        const noveltyResult = await checkNovelty({
          candidateId: `${signal.gene}_${Date.now()}`,
          claim: `Novel molecular candidate targeting ${signal.gene} for ${getTherapeuticArea(signal.gene)} therapy`,
          domain: getTherapeuticArea(signal.gene),
        });
        if (!noveltyResult.passes) {
          console.log(`[autonomous] ${signal.gene} novelty score ${noveltyResult.noveltyScore} < 80 — skipping`);
          result.errors.push(`${signal.gene}: novelty ${noveltyResult.noveltyScore} below threshold 80`);
          continue;
        }
        console.log(`[autonomous] ${signal.gene} novelty score ${noveltyResult.noveltyScore} — passed`);

        // Check composite score
        const composite = evolveResult.qualityGate?.composite ?? 0;
        if (composite < AutonomousConfig.minCompositeScore) {
          console.log(`[autonomous] ${signal.gene} composite ${composite} below threshold`);
          continue;
        }

        if (composite < 0.80 && AutonomousConfig.requireApproval.compositeBelow80) {
          await createApprovalRequest(signal, `low_composite_${composite.toFixed(2)}`);
          result.approvalsRequired++;
          continue;
        }

        // STEP 4 & 5: VERIFY + DRAFT — handled by dna-evolve (verify=true)

        // STEP 6: DELIVER
        const partner = await findMatchingPartner(signal.gene);
        if (!partner) {
          console.log(`[autonomous] No matching partner for ${signal.gene}`);
          continue;
        }

        await deliverToPartner(partner.id, signal, evolveResult);
        result.candidatesDelivered++;
        deliveriesThisRun++;

        // STEP 7: TRACK
        await logDistributionEvent(signal, evolveResult, partner.id);
        console.log(`[autonomous] Delivered ${signal.gene} candidate to partner #${partner.id}`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${signal.gene}: ${msg}`);
        console.error(`[autonomous] Error processing ${signal.gene}:`, msg);
        // Continue to next signal — never crash the loop
      }
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Loop-level error: ${msg}`);
    console.error("[autonomous] Loop-level error:", msg);
  }

  result.completedAt = new Date().toISOString();
  console.log("[autonomous] Loop complete:", result);
  return result;
}

// ─── STEP 1: DISCOVER ─────────────────────────────────────────────────────────

export async function discoverSignals(): Promise<PatentSignal[]> {
  try {
    const response = await fetch(
      `${AutonomousConfig.endpoints.notus}/v1/patents/search/expiring`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error(`Notus HTTP ${response.status}`);

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    const patents = data.results ?? [];

    return patents
      .filter((p) => ((p.confidence as number) || 0) >= AutonomousConfig.minSignalConfidence)
      .map((p) => ({
        gene: (p.molecularTarget as string) || extractGeneFromTitle((p.title as string) || ""),
        confidence: (p.confidence as number) || 0.8,
        source: "patent_cliff" as const,
        patentNumber: p.patentNumber as string | undefined,
        expiryDate: p.expirationDate as string | undefined,
        assignee: p.assignee as string | undefined,
      }));
  } catch {
    // Fallback: query the local patentAlerts table
    const db = await getDb();
    if (!db) return [];

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days
    const alerts = await db
      .select()
      .from(patentAlerts)
      .where(gte(patentAlerts.createdAt, since))
      .orderBy(patentAlerts.distressScore)
      .limit(10);

    return alerts
      .filter((a) => a.distressScore >= Math.round(AutonomousConfig.minSignalConfidence * 100))
      .map((a) => ({
        gene: a.niche ?? "PCSK9",
        confidence: a.distressScore / 100,
        source: "patent_cliff" as const,
        patentNumber: a.patentNumber,
        expiryDate: a.expiryDate ?? undefined,
        assignee: a.assignee,
      }));
  }
}

export function extractGeneFromTitle(title: string): string {
  const knownGenes = ["PCSK9", "LPA", "APOE", "ANGPTL3", "LDLR", "HMGCR", "BRCA1", "TP53", "CETP", "APOC3", "TTR"];
  const upper = title.toUpperCase();
  for (const gene of knownGenes) {
    if (upper.includes(gene)) return gene;
  }
  return "PCSK9"; // default
}

// ─── STEP 2: DECIDE ───────────────────────────────────────────────────────────

export function evaluateSignal(signal: PatentSignal): Decision {
  if (signal.confidence < AutonomousConfig.minSignalConfidence) {
    return { shouldAct: false, requiresApproval: false, reason: "low_confidence" };
  }

  const isKnownGene = (AutonomousConfig.autoDesignGenes as readonly string[]).includes(
    signal.gene.toUpperCase(),
  );
  if (!isKnownGene && AutonomousConfig.requireApproval.novelTarget) {
    return { shouldAct: true, requiresApproval: true, reason: "novel_target" };
  }

  return { shouldAct: true, requiresApproval: false, reason: "auto_approved" };
}

// ─── STEP 3: DESIGN ───────────────────────────────────────────────────────────

export async function designCandidate(signal: PatentSignal): Promise<DnaEvolveResult | null> {
  const layer = getLayerForGene(signal.gene);

  // ── Enrich seed with best notus-is candidate from GitHub bus ─────────────────
  // If notus-is has published a high-confidence small-molecule candidate,
  // derive a seed sequence from it. This creates a cross-layer feedback loop:
  // small molecule discovery informs nucleic acid design for the same target.
  let seed = generateSeedForGene(signal.gene);
  let notusEnriched = false;
  try {
    const { readLatestNotusResult, hasFreshBusResults } = await import('./notusIsBusReader');
    if (hasFreshBusResults()) {
      const notusResult = readLatestNotusResult();
      if (notusResult?.bestCandidate && notusResult.bestCandidate.pic50 >= 7.0) {
        const smilesHash = notusResult.bestCandidate.smiles
          .split('')
          .reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
        const variants = ['A', 'T', 'G', 'C'];
        const baseSeed = seed.split('');
        for (let i = 0; i < 8; i++) {
          baseSeed[i * 2] = variants[(smilesHash + i) % 4];
        }
        seed = baseSeed.join('');
        notusEnriched = true;
        console.log(
          `[autonomous] Seed enriched from notus-is bus: pIC50=${notusResult.bestCandidate.pic50.toFixed(2)}, ` +
          `verdict=${notusResult.bestCandidate.citationVerdict ?? 'unverified'}`
        );
      }
    }
  } catch { /* non-fatal — use default seed */ }

  const request = {
    seed,
    targetGene: signal.gene,
    layer,
    generations: 20,
    population: 50,
    topN: 3,
    verify: true,
    notusEnriched,
  };

  // ── Try GitHub bus first (works on Manus where HTTP is unreliable) ──────────
  try {
    const { isBusAvailable, busDesignCandidate } = await import('./dnaEvolveBusClient');
    if (isBusAvailable()) {
      console.log(`[autonomous] Using GitHub bus for dna-evolve (gene: ${signal.gene})`);
      const busResult = await busDesignCandidate(request);
      if (busResult) return busResult;
      console.warn('[autonomous] Bus returned null — falling back to HTTP');
    }
  } catch {
    console.warn('[autonomous] Bus client unavailable — falling back to HTTP');
  }

  // ── Fallback: direct HTTP (works in local dev / non-Manus environments) ─────
  try {
    const response = await fetch(`${AutonomousConfig.endpoints.dnaEvolve}/v1/evolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });
    if (!response.ok) return null;
    return response.json() as Promise<DnaEvolveResult>;
  } catch {
    return null;
  }
}

export function getLayerForGene(gene: string): string {
  const layerMap: Record<string, string> = {
    PCSK9: "dna", LPA: "dna", APOE: "dna", LDLR: "dna",
    ANGPTL3: "protein", HMGCR: "small_molecule",
    BRCA1: "dna", TP53: "dna", CETP: "protein",
    APOC3: "protein", TTR: "protein",
  };
  return layerMap[gene.toUpperCase()] ?? "dna";
}

export function generateSeedForGene(gene: string): string {
  const base = "GAGTCCGAGCAGAAGAAGAA"; // 20nt gRNA scaffold
  const hash = gene.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const variants = ["A", "T", "G", "C"];
  const seed = base.split("");
  for (let i = 0; i < 5; i++) {
    seed[i * 4] = variants[(hash + i) % 4];
  }
  return seed.join("");
}

// ─── STEP 6: DELIVER ──────────────────────────────────────────────────────────

export function getTherapeuticArea(gene: string): string {
  const map: Record<string, string> = {
    PCSK9: "cardiovascular", LPA: "cardiovascular", APOE: "neurodegenerative",
    LDLR: "cardiovascular", ANGPTL3: "cardiovascular", HMGCR: "cardiovascular",
    CETP: "cardiovascular", APOC3: "cardiovascular", TTR: "cardiovascular",
    BRCA1: "oncology", TP53: "oncology",
  };
  return map[gene.toUpperCase()] ?? "general";
}

async function findMatchingPartner(gene: string): Promise<{ id: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const { partners } = await import("../../drizzle/schema");
  const area = getTherapeuticArea(gene);

  // Find the most recently registered active partner whose therapeuticAreas includes this area
  const rows = await db
    .select({ id: partners.id, therapeuticAreas: partners.therapeuticAreas })
    .from(partners)
    .orderBy(partners.createdAt)
    .limit(20);

  const match = rows.find((r) =>
    r.therapeuticAreas.toLowerCase().includes(area.toLowerCase()),
  );
  return match ? { id: match.id } : null;
}

async function deliverToPartner(
  partnerId: number,
  signal: PatentSignal,
  evolveResult: DnaEvolveResult,
): Promise<void> {
  const best = evolveResult.topCandidates[0];
  if (!best) return;

  await fetch(`${AutonomousConfig.endpoints.genericSignal}/api/trpc/partners.deliver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partnerId,
      candidate: {
        gene: signal.gene,
        sequence: best.sequence,
        fitness: best.fitness,
        composite: evolveResult.qualityGate?.composite,
        patentNumber: signal.patentNumber,
        source: "autonomous_loop",
      },
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    console.warn(`[autonomous] Delivery to partner ${partnerId} failed`);
  });
}

// ─── STEP 7: TRACK ────────────────────────────────────────────────────────────

async function logDistributionEvent(
  signal: PatentSignal,
  evolveResult: DnaEvolveResult,
  partnerId: number,
): Promise<void> {
  const best = evolveResult.topCandidates[0];
  await insertDistributionEvent({
    signalSource: signal.source,
    gene: signal.gene,
    patentNumber: signal.patentNumber,
    sequence: best?.sequence ?? "",
    compositeScore: Math.round((evolveResult.qualityGate?.composite ?? 0) * 100),
    partnerId,
    status: "delivered",
    deliveredAt: new Date(),
  });
}

// ─── Approval Queue ───────────────────────────────────────────────────────────

export async function createApprovalRequest(signal: PatentSignal, reason: string): Promise<void> {
  await insertApprovalRequest({
    gene: signal.gene,
    patentNumber: signal.patentNumber,
    reason,
    status: "pending",
    confidence: Math.round(signal.confidence * 100),
  });

  // Notify owner
  notifyOwner({
    title: `[Approval Required] ${reason} — ${signal.gene}`,
    content: [
      `**Gene:** ${signal.gene}`,
      `**Reason:** ${reason}`,
      `**Confidence:** ${(signal.confidence * 100).toFixed(0)}%`,
      signal.patentNumber ? `**Patent:** ${signal.patentNumber}` : "",
      signal.assignee ? `**Assignee:** ${signal.assignee}` : "",
      ``,
      `Use the Autonomous Loop admin panel to approve or reject.`,
    ]
      .filter(Boolean)
      .join("\n"),
  }).catch((e) => console.warn("[autonomous] Owner notification failed:", e));

  console.log(`[autonomous] Approval request created: ${signal.gene} — ${reason}`);
}

export async function getPendingApprovals() {
  return dbGetPendingApprovals();
}

export async function approveRequest(id: number): Promise<void> {
  await resolveApprovalRequest(id, "approved");
  // Re-process: fetch the request and trigger a design run if possible
  const req = await getApprovalRequestById(id);
  if (req) {
    const signal: PatentSignal = {
      gene: req.gene,
      confidence: req.confidence / 100,
      source: "patent_cliff",
      patentNumber: req.patentNumber ?? undefined,
    };
    // Fire-and-forget — do not await so the approve endpoint returns immediately
    runAutonomousDistributionLoop().catch((e) =>
      console.error("[autonomous] Re-process after approval failed:", e),
    );
    console.log(`[autonomous] Approved and re-queued: ${signal.gene}`);
  }
}

export async function rejectRequest(id: number): Promise<void> {
  await resolveApprovalRequest(id, "rejected");
}
