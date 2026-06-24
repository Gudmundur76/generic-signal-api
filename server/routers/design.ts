/**
 * Molecular Design (Evolva) Router
 *
 * Provides tRPC procedures for the autonomous molecular evolution pipeline.
 * Uses an in-memory run store for v1; each run simulates generation-by-generation
 * evolution with scoring across DNA, SMILES, protein, and RNA layers.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { nanoid } from "nanoid";

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

export interface VerificationClaim {
  type: "pQTL" | "GWAS" | "clinical" | "structural" | "citation";
  status: "Supported" | "Contradicted" | "Ambiguous";
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
  verification: Record<MolecularLayer, VerificationClaim[]>;
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
// Sequence generators (deterministic mock for v1)
// ---------------------------------------------------------------------------

const DNA_TEMPLATES: Record<string, string[]> = {
  PCSK9: ["GAGTCCGAGCAGAGGACGAA", "CACCGTCATCGCCATCAACG", "GGAGCTGCAGAAGGTGCTGA"],
  LPA:   ["GCAGCTGAAGAACGTCATCG", "CTGGACAAGCTCAAGGTCAA", "AAGCAGCTGGAGAACCTGCA"],
  APOE:  ["CGCAGAGCCGGAGCCCGAGC", "GCAGCGCCTGGAGGAGCTGG", "CAGCGGCTGGAGGAGCTGCA"],
};

const SMILES_TEMPLATES: Record<string, string[]> = {
  PCSK9: [
    "C[C@H](NC(=O)C1CC1)c1ccc(F)cc1",
    "CC(C)(C)c1ccc(NC(=O)c2cccc(Cl)c2)cc1",
    "O=C(Nc1ccc(F)cc1)c1ccc(Cl)cc1",
  ],
  LPA: [
    "CC(=O)Nc1ccc(S(=O)(=O)N2CCCC2)cc1",
    "O=C(O)c1ccc(NC(=O)c2ccccc2)cc1",
    "Cc1ccc(NC(=O)c2ccc(F)cc2)cc1",
  ],
  APOE: [
    "CC(C)Cc1ccc(C(C)C(=O)O)cc1",
    "O=C(O)CCc1ccc(NC(=O)c2ccccc2)cc1",
    "Cc1ccc(C(=O)Nc2ccc(Cl)cc2)cc1",
  ],
};

const PROTEIN_TEMPLATES: Record<string, string[]> = {
  PCSK9: ["MGTVSSRRSWWPLPLCLLLLAAAQGLAAQEDEDGDYEELVLALRQKLIEDLQELRQEAEQRAQHVSQALRQKLEELRQEAEQRAQHVSQ"],
  LPA:   ["MAWRLLLLAAAFCFAEGQKISASRGGGPQCLQPQEHAGGITCPKGQNTCSQCEEDRRADAHKSEGTFTSDVSSYLEGQAAKEFIAWLVKGR"],
  APOE:  ["MKVLWAALLVTFLAGCQAKVEQAVETEPEPELRQQTEWQSGQRWELALGRFWDYLRWVQTLSEQVQEELLSSQVTQELRALMDETMKELKAYKSELEEQLTPVAEETRARLSKELQAAQARLGADMEDVCGRLVQYRGEVQAMLGQSTEELRVRLASHLRKLRKRLLRDADDLQKRLAVYQAGAREGAERGLSAIRERLGPLVEQGRVRAATVGSLAGQPLQERAQAWGERLRARMEEMGSRTRDRLDEVKEQVAEVRAKLEEQAQQIRLQAEAFQARLKSWFEPLVEDMQRQWAGLVEKVQAAVGTSAAPVPSDNH"],
};

const RNA_TEMPLATES: Record<string, string[]> = {
  PCSK9: ["GCAUCGAGCUGCAGAAGGUG", "CAGCGGCUGGAGGAGCUGCA", "GCAGCGCCUGGAGGAGCUGG"],
  LPA:   ["GCAGCUGAAGAACGUCAUCG", "CUGGACAAGCUCAAGGUCAA", "AAGCAGCUGGAGAACCUGCA"],
  APOE:  ["CGCAGAGCCGGAGCCCGAGC", "GCAGCGCCUGGAGGAGCUGG", "CAGCGGCUGGAGGAGCUGCA"],
};

function pickSequence(
  target: string,
  layer: MolecularLayer,
  generation: number
): string {
  const idx = generation % 3;
  if (layer === "dna") return (DNA_TEMPLATES[target] ?? DNA_TEMPLATES.PCSK9)[idx]!;
  if (layer === "small_molecule") return (SMILES_TEMPLATES[target] ?? SMILES_TEMPLATES.PCSK9)[idx]!;
  if (layer === "protein") return (PROTEIN_TEMPLATES[target] ?? PROTEIN_TEMPLATES.PCSK9)[0]!;
  return (RNA_TEMPLATES[target] ?? RNA_TEMPLATES.PCSK9)[idx]!;
}

function scoreForLayer(layer: MolecularLayer, generation: number): number {
  const base: Record<MolecularLayer, number> = {
    dna: 62,
    small_molecule: 71,
    protein: 55,
    rna: 58,
  };
  // Score improves with generation, caps at 97
  return Math.min(97, base[layer] + generation * 2.3 + Math.random() * 3);
}

function buildVerification(target: string): Record<MolecularLayer, VerificationClaim[]> {
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
        type: "citation",
        status: "Supported",
        confidence: 0.99,
        sources: [`citation.is:verified:${target.toLowerCase()}_${layer}`],
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
    sequence: pickSequence(run.target, layer, run.generation),
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
    .mutation(({ input }) => {
      const runId = `run_${nanoid(12)}`;
      const targetMeta = TARGETS.find((t) => t.name === input.target)!;
      const layers = input.layers as MolecularLayer[];

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
        verification: buildVerification(input.target),
      };

      // Seed generation 0
      advanceRun(run);
      runStore.set(runId, run);

      return { runId, status: 'started' as const, target: input.target, layers, startedAt: run.startedAt };
    }),

  /** Poll progress — advances the run by one generation each call (simulates async work) */
  getProgress: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => {
      const run = runStore.get(input.runId);
      if (!run) throw new Error(`Run ${input.runId} not found`);

      // Advance one generation per poll (simulates background work)
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
        })),
      };
    }),

  /** Return L1-L5 evidence trail for a specific layer in a run */
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

      const claims = run.verification[input.layer as MolecularLayer];
      return {
        runId: run.runId,
        target: run.target,
        layer: input.layer,
        claims,
        overallConfidence:
          Math.round(
            (claims.reduce((s, c) => s + c.confidence, 0) / claims.length) * 100
          ) / 100,
      };
    }),
});
