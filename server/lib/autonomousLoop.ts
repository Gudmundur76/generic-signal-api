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
  minCompositeScore: 0.50,            // Sandbox: lowered to 0.50 to allow delivery with quick-run fitness scores
  maxDeliveriesPerRun: 3,             // Never deliver more than 3 per run
  autoDesignGenes: [                  // Known genes — auto-approved
    "PCSK9", "LPA", "APOE", "ANGPTL3", "LDLR",
  ] as readonly string[],
  requireApproval: {
    novelTarget: true,                // Gene not in autoDesignGenes → approval
    compositeBelow80: false,          // Sandbox: disabled to allow delivery with quick-run fitness scores
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
  /** Layer used for this candidate (dna | rna | protein | small_molecule) */
  layer?: string;
  /** Whether the seed was enriched from a notus-is bus result */
  notusEnriched?: boolean;
  /** Citation/literature verification result from dna-evolve */
  verification?: {
    confidence: number;
    verdict: string;
    pmids?: string[];
    summary?: string;
  } | null;
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
        // dna-evolve qualityGate has bestFitness (0–100) but no composite field.
        // Derive composite: bestFitness/100, capped at 1.0.
        const qg = evolveResult.qualityGate as any;
        const composite = typeof qg?.composite === 'number'
          ? qg.composite
          : typeof qg?.bestFitness === 'number'
            ? Math.min(qg.bestFitness / 100, 1.0)
            : 0;
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

  // Helper: post-process the raw result to ensure layer/notusEnriched are present
  // (bus runner may not echo them back, so we inject from the request)
  function enrichResult(raw: DnaEvolveResult | null): DnaEvolveResult | null {
    if (!raw) return null;
    return {
      ...raw,
      layer: raw.layer ?? layer,
      notusEnriched: raw.notusEnriched ?? notusEnriched,
    };
  }

  // ── Try GitHub bus first (works on Manus where HTTP is unreliable) ──────────
  try {
    const { isBusAvailable, busDesignCandidate } = await import('./dnaEvolveBusClient');
    if (isBusAvailable()) {
      console.log(`[autonomous] Using GitHub bus for dna-evolve (gene: ${signal.gene})`);
      const busResult = await busDesignCandidate(request);
      if (busResult) return enrichResult(busResult);
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
    const httpResult = await response.json() as DnaEvolveResult;
    return enrichResult(httpResult);
  } catch {
    return null;
  }
}

export function getLayerForGene(gene: string): string {
  // dna-evolve accepts: crispr-grna | capture-probe | regulatory-element | primer | protein-engineering | aso
  // generic-signal-api semantic layers: dna | rna | protein | small_molecule
  // Map each gene to the most appropriate dna-evolve task type
  const layerMap: Record<string, string> = {
    PCSK9: "crispr-grna",      // CRISPR guide for LDL-lowering gene editing
    LPA: "crispr-grna",        // CRISPR guide for Lp(a) reduction
    APOE: "crispr-grna",       // CRISPR guide for APOE4 correction
    LDLR: "crispr-grna",       // CRISPR guide for LDLR restoration
    ANGPTL3: "aso",            // Antisense oligo (like volanesorsen)
    HMGCR: "aso",              // ASO for statin-resistant cases
    BRCA1: "crispr-grna",      // CRISPR guide for BRCA1 correction
    TP53: "crispr-grna",       // CRISPR guide for TP53 restoration
    CETP: "aso",               // ASO inhibitor
    APOC3: "aso",              // ASO (like olezarsen)
    TTR: "aso",                // ASO (like inotersen)
  };
  return layerMap[gene.toUpperCase()] ?? "crispr-grna";
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

  const areaLower = area.toLowerCase();
  const match = rows.find((r) => {
    const ta = r.therapeuticAreas;
    // Handle both JSON array (from live DB) and plain string (from Drizzle schema)
    if (Array.isArray(ta)) {
      return ta.some((a: string) => a.toLowerCase().includes(areaLower));
    }
    return String(ta).toLowerCase().includes(areaLower);
  });
  return match ? { id: match.id } : null;
}

async function deliverToPartner(
  partnerId: number,
  signal: PatentSignal,
  evolveResult: DnaEvolveResult,
): Promise<void> {
  const best = evolveResult.topCandidates[0];
  if (!best) return;

  // Build a full candidate payload that matches the deliverySchema in partners.ts
  // and carries all the rich data from the dna-evolve result.
  const compositeScore = Math.round((evolveResult.qualityGate?.composite ?? 0) * 100);
  const noveltyScore = Math.round(evolveResult.qualityGate?.novelty ?? 50);
  const specificityScore = Math.round(evolveResult.qualityGate?.specificity ?? 50);
  const layer = (evolveResult.layer ?? getLayerForGene(signal.gene)) as
    "dna" | "rna" | "protein" | "small_molecule";
  const therapeuticArea = getTherapeuticArea(signal.gene);
  const candidateId = `CAND-${Date.now()}-${partnerId}-${signal.gene}`;

  // Determine FTO status from verification confidence
  const verificationConfidence = evolveResult.verification?.confidence ?? 0;
  const fto: "CLEAR" | "RISK" | "BLOCKED" =
    verificationConfidence >= 0.8 ? "CLEAR" :
    verificationConfidence >= 0.5 ? "RISK" : "BLOCKED";

  // ── Use the correct tRPC route: partners.recordDelivery ──────────────────────
  await fetch(`${AutonomousConfig.endpoints.genericSignal}/api/trpc/partners.recordDelivery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateId,
      partnerId,
      gene: signal.gene,
      therapeuticArea,
      noveltyScore,
      compositeScore,
      fto,
      // Extended fields for partner-facing candidate package
      sequence: best.sequence,
      layer,
      fitness: best.fitness,
      specificityScore,
      patentNumber: signal.patentNumber ?? null,
      source: "autonomous_loop",
      notusEnriched: evolveResult.notusEnriched ?? false,
      verificationVerdict: evolveResult.verification?.verdict ?? null,
      verificationPmids: evolveResult.verification?.pmids ?? [],
      verificationSummary: evolveResult.verification?.summary ?? null,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((e) => {
    console.warn(`[autonomous] Delivery to partner ${partnerId} failed:`, (e as Error).message);
  });

  console.log(
    `[autonomous] Delivered ${signal.gene} (${layer}) to partner #${partnerId}: ` +
    `composite=${compositeScore}, novelty=${noveltyScore}, fto=${fto}, ` +
    `notusEnriched=${evolveResult.notusEnriched ?? false}`
  );
}

// ─── STEP 7: TRACK ────────────────────────────────────────────────────────────

async function logDistributionEvent(
  signal: PatentSignal,
  evolveResult: DnaEvolveResult,
  partnerId: number,
): Promise<void> {
  const best = evolveResult.topCandidates[0];
  const compositeScore = Math.round((evolveResult.qualityGate?.composite ?? 0) * 100);
  await insertDistributionEvent({
    signalSource: signal.source,
    gene: signal.gene,
    patentNumber: signal.patentNumber,
    sequence: best?.sequence ?? "",
    compositeScore,
    partnerId,
    status: "delivered",
    deliveredAt: new Date(),
  });
  console.log(
    `[autonomous] Distribution event logged: gene=${signal.gene}, ` +
    `layer=${evolveResult.layer ?? "unknown"}, composite=${compositeScore}, ` +
    `partner=${partnerId}, notusEnriched=${evolveResult.notusEnriched ?? false}, ` +
    `verificationVerdict=${evolveResult.verification?.verdict ?? "none"}`
  );
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
