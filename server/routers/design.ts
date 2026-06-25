/**
 * Molecular Design (Evolva) Router
 *
 * Provides tRPC procedures for the autonomous molecular evolution pipeline.
 * Uses an in-memory run store for v1; each run simulates generation-by-generation
 * evolution with scoring across DNA, SMILES, protein, and RNA layers.
 *
 * Evidence trail (L1–L5) is backed by the Citation API via citationClient.
 * When the Citation API is unavailable, claims fall back to "Unverified" status
 * so the run is never blocked.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { nanoid } from "nanoid";
import { verifyClaims, type CitationSource } from "../lib/citationClient";
import { fetchMolecularData, type MolecularData } from "../lib/molecularData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MolecularLayer = "dna" | "small_molecule" | "protein" | "rna";

export interface EvolvedSequence {
  layer: MolecularLayer;
  sequence: string;
  score: number;
  novelty: boolean;
  patent: "CLEAR" | "RISK" | "BLOCKED";
  generation: number;
}

/** A single evidence item in the L1–L5 trail */
export interface EvidenceClaim {
  /** Evidence level: L1 = sequence, L2 = specificity, L3 = deCODE, L4 = novelty, L5 = FTO */
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  claim: string;
  status: "Supported" | "Contradicted" | "Unverified" | "Partially Supported";
  confidence: number;
  sources: CitationSource[];
}

/** Legacy per-layer verification claim (kept for backward compat with getVerification) */
export interface VerificationClaim {
  type: "pQTL" | "GWAS" | "clinical" | "structural" | "citation";
  status: "Supported" | "Contradicted" | "Ambiguous" | "Unverified" | "Partially Supported";
  confidence: number;
  sources: string[];
}

export interface EvolutionRun {
  runId: string;
  target: string;
  layers: MolecularLayer[];
  startedAt: Date;
  generation: number;
  maxGenerations: number;
  bestScore: number;
  converged: boolean;
  results: EvolvedSequence[];
  coherence: number;
  recommendedLayer: MolecularLayer;
  /** L1–L5 evidence trail (Citation API backed, per layer) */
  evidenceTrail: Record<MolecularLayer, EvidenceClaim[]>;
  /** Legacy per-layer claims (pQTL, GWAS, structural, clinical) */
  verification: Record<MolecularLayer, VerificationClaim[]>;
  /** Real sequences fetched from UniProt / Ensembl / ChEMBL at run creation time */
  realSequences: Partial<Record<MolecularLayer, MolecularData>>;
}

// ---------------------------------------------------------------------------
// Static target catalogue (v1 — hardcoded, backed by deCODE data)
// ---------------------------------------------------------------------------

const TARGETS = [
  {
    name: "PCSK9",
    gene: "ENSG00000169174",
    protein: "P81686",
    disease: "cardiovascular disease",
    deCODEAssociations: 8,
    pValue: 2e-48,
    description:
      "Proprotein convertase subtilisin/kexin type 9 — regulates LDL receptor degradation. Loss-of-function variants in deCODE cohort strongly associate with reduced LDL-C and cardiovascular protection.",
    approvedDrugs: ["Evolocumab", "Alirocumab"],
    layers: ["dna", "small_molecule", "protein", "rna"] as MolecularLayer[],
  },
  {
    name: "LPA",
    gene: "ENSG00000198670",
    protein: "P08519",
    disease: "coronary artery disease",
    deCODEAssociations: 5,
    pValue: 3e-32,
    description:
      "Lipoprotein(a) — elevated Lp(a) is a causal risk factor for atherosclerosis. deCODE identified multiple pQTLs with large effect sizes on Lp(a) plasma levels.",
    approvedDrugs: [],
    layers: ["dna", "small_molecule", "rna"] as MolecularLayer[],
  },
  {
    name: "APOE",
    gene: "ENSG00000130203",
    protein: "P02649",
    disease: "Alzheimer's disease / dyslipidaemia",
    deCODEAssociations: 12,
    pValue: 5e-61,
    description:
      "Apolipoprotein E — APOE ε4 allele is the strongest genetic risk factor for late-onset Alzheimer's. deCODE data shows 12 independent associations across neurological and metabolic phenotypes.",
    approvedDrugs: [],
    layers: ["dna", "protein", "rna"] as MolecularLayer[],
  },
];

// ---------------------------------------------------------------------------
// Sequence selector — uses only real data from public APIs
// ---------------------------------------------------------------------------

/**
 * Return the real sequence for a layer from the run's fetched data.
 * If no real data was fetched (API down), returns an empty string so the
 * caller can handle the missing sequence explicitly.
 */
function pickSequence(
  _target: string,
  layer: MolecularLayer,
  _generation: number,
  realSequences?: Partial<Record<MolecularLayer, MolecularData>>
): string {
  return realSequences?.[layer]?.sequence ?? "";
}

function scoreForLayer(layer: MolecularLayer, generation: number): number {
  const base: Record<MolecularLayer, number> = {
    dna: 62,
    small_molecule: 71,
    protein: 55,
    rna: 58,
  };
  return Math.min(97, base[layer] + generation * 2.3 + Math.random() * 3);
}

// ---------------------------------------------------------------------------
// L1–L5 evidence trail (Citation API backed)
// ---------------------------------------------------------------------------

/**
 * Build the L1–L5 evidence trail for a target by calling the Citation API.
 * Falls back gracefully to "Unverified" when the service is unavailable.
 * The representative sequence used for L1/L4 is the DNA template at generation 0.
 */
async function buildEvidenceTrail(
  targetName: string,
  disease: string,
  pValue: number
): Promise<EvidenceClaim[]> {
  // Use the gene name as a placeholder in claims when real sequence is not yet available
  const sequence = targetName;

  const claimDefs: Array<{ level: EvidenceClaim["level"]; claim: string; gene?: string }> = [
    {
      level: "L1",
      claim: `Sequence ${sequence} targets ${targetName} for ${disease}`,
      gene: targetName,
    },
    {
      level: "L2",
      claim: `${targetName} is specifically associated with ${disease} in population genetics data`,
      gene: targetName,
    },
    {
      level: "L3",
      claim: `deCODE genetics associates ${targetName} with ${disease} (p=${pValue.toExponential(1)})`,
      gene: targetName,
    },
    {
      level: "L4",
      claim: `Sequence ${sequence} is novel against known databases`,
      gene: targetName,
    },
    {
      level: "L5",
      claim: `${targetName} has freedom to operate for therapeutic development`,
      gene: targetName,
    },
  ];

  const citationResults = await verifyClaims(
    claimDefs.map((d) => ({ claim: d.claim, gene: d.gene }))
  );

  return claimDefs.map((def, i) => {
    const result = citationResults[i];
    return {
      level: def.level,
      claim: def.claim,
      status: result?.status ?? "Unverified",
      confidence: result?.confidence ?? 0.5,
      sources: result?.sources ?? [],
    };
  });
}

/**
 * Build the legacy per-layer VerificationClaim array (pQTL, GWAS, structural, clinical).
 * These are static and do not call the Citation API.
 */
function buildLegacyVerification(target: string): Record<MolecularLayer, VerificationClaim[]> {
  const layers: MolecularLayer[] = ["dna", "small_molecule", "protein", "rna"];
  const result = {} as Record<MolecularLayer, VerificationClaim[]>;
  for (const layer of layers) {
    result[layer] = [
      {
        type: "pQTL",
        status: "Supported",
        confidence: 0.97,
        sources: [`decode:${target}_pQTL_001`, `decode:${target}_pQTL_002`],
      },
      {
        type: "GWAS",
        status: "Supported",
        confidence: 0.91,
        sources: [`pubmed:${target === "PCSK9" ? "28959963" : "30595370"}`],
      },
      {
        type: "structural",
        status: layer === "protein" ? "Supported" : "Ambiguous",
        confidence: layer === "protein" ? 0.88 : 0.61,
        sources: layer === "protein" ? [`pdb:${target === "PCSK9" ? "2P4E" : "1B68"}`] : [],
      },
      {
        type: "clinical",
        status: target === "PCSK9" ? "Supported" : "Ambiguous",
        confidence: target === "PCSK9" ? 0.95 : 0.72,
        sources: target === "PCSK9" ? ["clinicaltrials:NCT01764633"] : [],
      },
    ];
  }
  return result;
}

// ---------------------------------------------------------------------------
// In-memory run store
// ---------------------------------------------------------------------------

const runStore = new Map<string, EvolutionRun>();

function advanceRun(run: EvolutionRun): void {
  if (run.converged) return;
  run.generation = Math.min(run.generation + 1, run.maxGenerations);

  const newResults: EvolvedSequence[] = run.layers.map((layer) => ({
    layer,
    sequence: pickSequence(run.target, layer, run.generation, run.realSequences),
    score: scoreForLayer(layer, run.generation),
    novelty: run.generation >= 3,
    patent: run.generation >= 5 ? "CLEAR" : "RISK",
    generation: run.generation,
  }));

  run.results = newResults;
  run.bestScore = Math.max(...newResults.map((r) => r.score));
  run.coherence = Math.min(100, 60 + run.generation * 4);
  run.recommendedLayer = newResults.reduce((a, b) => (a.score > b.score ? a : b)).layer;
  run.converged = run.generation >= run.maxGenerations;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const designRouter = router({
  /** Return the static target catalogue */
  getTargets: publicProcedure.query(() => TARGETS),

  /** Start a new evolution run — returns runId immediately */
  evolve: publicProcedure
    .input(
      z.object({
        target: z.enum(["PCSK9", "LPA", "APOE"]),
        layers: z.array(z.enum(["dna", "small_molecule", "protein", "rna"])).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const runId = `run_${nanoid(12)}`;
      const targetMeta = TARGETS.find((t) => t.name === input.target)!;
      const layers = input.layers as MolecularLayer[];

      // Fetch real molecular sequences in parallel (non-blocking — falls back to templates)
      const realSequences: Partial<Record<MolecularLayer, MolecularData>> = {};
      await Promise.allSettled(
        layers.map(async (layer) => {
          const data = await fetchMolecularData(targetMeta.name, layer);
          if (data) realSequences[layer] = data;
        })
      );

      // Build evidence trail via Citation API (non-blocking fallback if service is down)
      const evidenceTrail = await buildEvidenceTrail(
        targetMeta.name,
        targetMeta.disease,
        targetMeta.pValue
      );

      // Build per-layer evidence trail map (same trail for all layers in v1)
      const evidenceTrailByLayer = {} as Record<MolecularLayer, EvidenceClaim[]>;
      for (const layer of (["dna", "small_molecule", "protein", "rna"] as MolecularLayer[])) {
        evidenceTrailByLayer[layer] = evidenceTrail;
      }

      const run: EvolutionRun = {
        runId,
        target: input.target,
        layers,
        startedAt: new Date(),
        generation: 0,
        maxGenerations: 10,
        bestScore: 0,
        converged: false,
        results: [],
        coherence: 0,
        recommendedLayer: layers[0]!,
        evidenceTrail: evidenceTrailByLayer,
        verification: buildLegacyVerification(input.target),
        realSequences,
      };

      // Seed generation 0
      advanceRun(run);
      runStore.set(runId, run);

      return {
        runId,
        status: "started" as const,
        target: input.target,
        layers,
        startedAt: run.startedAt,
      };
    }),

  /** Poll progress — advances the run by one generation each call (simulates async work) */
  getProgress: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => {
      const run = runStore.get(input.runId);
      if (!run) throw new Error(`Run ${input.runId} not found`);

      if (!run.converged) advanceRun(run);

      return {
        runId: run.runId,
        target: run.target,
        generation: run.generation,
        maxGenerations: run.maxGenerations,
        bestScore: Math.round(run.bestScore * 10) / 10,
        converged: run.converged,
        progressPct: Math.round((run.generation / run.maxGenerations) * 100),
      };
    }),

  /** Return full results for a completed (or in-progress) run */
  getResults: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => {
      const run = runStore.get(input.runId);
      if (!run) throw new Error(`Run ${input.runId} not found`);

      // Attach real-data metadata per layer so the UI can show source + AlphaFold link
      const layerMeta: Record<string, { source: string; confidence: number; structureUrl?: string; bioactivity?: { ic50?: number; pIC50?: number } }> = {};
      for (const [layer, data] of Object.entries(run.realSequences)) {
        layerMeta[layer] = {
          source: data.source,
          confidence: data.confidence,
          structureUrl: data.structureUrl,
          bioactivity: data.bioactivity,
        };
      }

      return {
        runId: run.runId,
        target: run.target,
        generation: run.generation,
        converged: run.converged,
        coherence: run.coherence,
        recommendedLayer: run.recommendedLayer,
        layers: run.results.map((r) => ({
          ...r,
          score: Math.round(r.score * 10) / 10,
          meta: layerMeta[r.layer],
        })),
      };
    }),

  /**
   * Return L1–L5 evidence trail for a specific layer in a run.
   * Each claim has status, confidence, and sources (with real PMIDs when
   * the Citation API is available).
   */
  getVerification: publicProcedure
    .input(
      z.object({
        runId: z.string(),
        layer: z.enum(["dna", "small_molecule", "protein", "rna"]),
      })
    )
    .query(({ input }) => {
      const run = runStore.get(input.runId);
      if (!run) throw new Error(`Run ${input.runId} not found`);

      const evidenceClaims = run.evidenceTrail[input.layer as MolecularLayer];
      const overallConfidence =
        Math.round(
          (evidenceClaims.reduce((s, c) => s + c.confidence, 0) /
            evidenceClaims.length) *
            100
        ) / 100;

      return {
        runId: run.runId,
        target: run.target,
        layer: input.layer,
        claims: evidenceClaims,
        overallConfidence,
      };
    }),
});
