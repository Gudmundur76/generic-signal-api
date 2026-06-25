/**
 * server/lib/clf/decodeTargetList.ts
 *
 * Inlined copy of cognitive-loop-framework/src/targets/decodeTargetList.ts
 * so the server has no external workspace dependency at runtime.
 *
 * Sources: deCODE pQTL / GWAS catalogue, PubMed meta-analyses. Updated 2026-Q2.
 */

export type TherapeuticArea =
  | "cardiovascular"
  | "oncology"
  | "neurology"
  | "metabolic"
  | "immunology"
  | "rare_disease"
  | "infectious_disease"
  | "ophthalmology"
  | "respiratory"
  | "renal";

export type MolecularLayer = "dna" | "rna" | "protein" | "small_molecule";

export interface DecodeTarget {
  gene: string;
  fullName: string;
  areas: TherapeuticArea[];
  topVariant: string;
  pValue: number;
  effectSize: number;
  diseaseContext: string;
  recommendedLayer: MolecularLayer;
  diseaseId?: string;
}

export const DECODE_TARGETS: DecodeTarget[] = [
  // ── Cardiovascular ──────────────────────────────────────────────────────────
  {
    gene: "PCSK9", fullName: "Proprotein Convertase Subtilisin/Kexin Type 9",
    areas: ["cardiovascular"], topVariant: "rs11591147", pValue: 2.0e-48,
    effectSize: -0.600, diseaseContext: "LDL receptor degradation; hypercholesterolaemia",
    recommendedLayer: "dna", diseaseId: "OMIM:603776",
  },
  {
    gene: "LDLR", fullName: "Low Density Lipoprotein Receptor",
    areas: ["cardiovascular"], topVariant: "rs6511720", pValue: 5.0e-40,
    effectSize: -0.520, diseaseContext: "LDL clearance; familial hypercholesterolaemia",
    recommendedLayer: "dna", diseaseId: "OMIM:606945",
  },
  {
    gene: "APOB", fullName: "Apolipoprotein B",
    areas: ["cardiovascular"], topVariant: "rs1367117", pValue: 8.0e-35,
    effectSize: 0.450, diseaseContext: "LDL particle; hypercholesterolaemia, CAD",
    recommendedLayer: "rna", diseaseId: "OMIM:107730",
  },
  {
    gene: "LPA", fullName: "Lipoprotein(a)",
    areas: ["cardiovascular"], topVariant: "rs10455872", pValue: 1.1e-62,
    effectSize: 0.720, diseaseContext: "Lp(a) levels; CAD, aortic stenosis",
    recommendedLayer: "rna", diseaseId: "OMIM:152200",
  },
  // ── Oncology ────────────────────────────────────────────────────────────────
  {
    gene: "BRCA1", fullName: "Breast Cancer Gene 1",
    areas: ["oncology"], topVariant: "rs80357906", pValue: 1.0e-45,
    effectSize: -0.680, diseaseContext: "DNA repair; breast/ovarian cancer",
    recommendedLayer: "dna", diseaseId: "OMIM:113705",
  },
  {
    gene: "BRCA2", fullName: "Breast Cancer Gene 2",
    areas: ["oncology"], topVariant: "rs80359550", pValue: 2.5e-38,
    effectSize: -0.620, diseaseContext: "Homologous recombination; breast/ovarian/pancreatic cancer",
    recommendedLayer: "dna", diseaseId: "OMIM:600185",
  },
  {
    gene: "TP53", fullName: "Tumour Protein P53",
    areas: ["oncology"], topVariant: "rs1042522", pValue: 3.2e-30,
    effectSize: -0.550, diseaseContext: "Cell cycle checkpoint; pan-cancer tumour suppressor",
    recommendedLayer: "protein", diseaseId: "OMIM:191170",
  },
  {
    gene: "KRAS", fullName: "KRAS Proto-Oncogene",
    areas: ["oncology"], topVariant: "rs121913529", pValue: 1.8e-28,
    effectSize: 0.500, diseaseContext: "RAS signalling; NSCLC, CRC, pancreatic cancer",
    recommendedLayer: "small_molecule", diseaseId: "OMIM:190070",
  },
  // ── Neurology ───────────────────────────────────────────────────────────────
  {
    gene: "APP", fullName: "Amyloid Precursor Protein",
    areas: ["neurology"], topVariant: "rs63750847", pValue: 4.0e-35,
    effectSize: 0.580, diseaseContext: "Amyloid-β production; Alzheimer disease",
    recommendedLayer: "dna", diseaseId: "OMIM:104760",
  },
  {
    gene: "SNCA", fullName: "Synuclein Alpha",
    areas: ["neurology"], topVariant: "rs356182", pValue: 2.3e-28,
    effectSize: 0.420, diseaseContext: "α-synuclein aggregation; Parkinson disease",
    recommendedLayer: "rna", diseaseId: "OMIM:163890",
  },
  {
    gene: "C9orf72", fullName: "Chromosome 9 Open Reading Frame 72",
    areas: ["neurology"], topVariant: "rs3849942", pValue: 1.5e-22,
    effectSize: -0.380, diseaseContext: "Hexanucleotide repeat expansion; ALS, FTD",
    recommendedLayer: "dna", diseaseId: "OMIM:614260",
  },
  // ── Metabolic ───────────────────────────────────────────────────────────────
  {
    gene: "GLP1R", fullName: "Glucagon-Like Peptide 1 Receptor",
    areas: ["metabolic"], topVariant: "rs10305492", pValue: 6.0e-20,
    effectSize: -0.310, diseaseContext: "Incretin signalling; T2D, obesity",
    recommendedLayer: "small_molecule", diseaseId: "OMIM:138032",
  },
  {
    gene: "FTO", fullName: "Fat Mass and Obesity Associated",
    areas: ["metabolic"], topVariant: "rs9939609", pValue: 3.0e-35,
    effectSize: 0.390, diseaseContext: "Energy balance; obesity, T2D",
    recommendedLayer: "dna", diseaseId: "OMIM:610966",
  },
  {
    gene: "PPARG", fullName: "Peroxisome Proliferator Activated Receptor Gamma",
    areas: ["metabolic"], topVariant: "rs1801282", pValue: 1.2e-18,
    effectSize: -0.280, diseaseContext: "Adipogenesis, insulin sensitivity; T2D",
    recommendedLayer: "small_molecule", diseaseId: "OMIM:601487",
  },
  // ── Immunology ──────────────────────────────────────────────────────────────
  {
    gene: "IL23R", fullName: "Interleukin 23 Receptor",
    areas: ["immunology"], topVariant: "rs11209026", pValue: 2.0e-30,
    effectSize: -0.440, diseaseContext: "Th17 signalling; Crohn disease, psoriasis, AS",
    recommendedLayer: "protein",
  },
  {
    gene: "JAK2", fullName: "Janus Kinase 2",
    areas: ["immunology", "oncology"], topVariant: "rs10974944", pValue: 3.9e-25,
    effectSize: 0.330, diseaseContext: "JAK-STAT signalling; myeloproliferative neoplasms, RA",
    recommendedLayer: "small_molecule", diseaseId: "OMIM:147796",
  },
  // ── Rare Disease ────────────────────────────────────────────────────────────
  {
    gene: "CFTR", fullName: "CF Transmembrane Conductance Regulator",
    areas: ["rare_disease", "respiratory"], topVariant: "rs113993960", pValue: 1.0e-60,
    effectSize: -0.900, diseaseContext: "Chloride channel; cystic fibrosis",
    recommendedLayer: "dna", diseaseId: "OMIM:602421",
  },
  {
    gene: "SMN1", fullName: "Survival Of Motor Neuron 1",
    areas: ["rare_disease", "neurology"], topVariant: "rs143990276", pValue: 1.0e-55,
    effectSize: -0.850, diseaseContext: "Motor neuron survival; spinal muscular atrophy",
    recommendedLayer: "rna", diseaseId: "OMIM:600354",
  },
  {
    gene: "DMD", fullName: "Dystrophin",
    areas: ["rare_disease"], topVariant: "rs28933693", pValue: 1.0e-50,
    effectSize: -0.800, diseaseContext: "Muscle structural protein; Duchenne muscular dystrophy",
    recommendedLayer: "dna", diseaseId: "OMIM:300377",
  },
  // ── Ophthalmology ───────────────────────────────────────────────────────────
  {
    gene: "CFH", fullName: "Complement Factor H",
    areas: ["ophthalmology"], topVariant: "rs1061170", pValue: 4.5e-58,
    effectSize: 0.620, diseaseContext: "Complement regulation; age-related macular degeneration",
    recommendedLayer: "protein", diseaseId: "OMIM:134370",
  },
  {
    gene: "ARMS2", fullName: "Age-Related Maculopathy Susceptibility 2",
    areas: ["ophthalmology"], topVariant: "rs10490924", pValue: 2.1e-45,
    effectSize: 0.580, diseaseContext: "Mitochondrial function; AMD",
    recommendedLayer: "dna",
  },
  // ── Infectious Disease ──────────────────────────────────────────────────────
  {
    gene: "CCR5", fullName: "C-C Motif Chemokine Receptor 5",
    areas: ["infectious_disease", "immunology"], topVariant: "rs333", pValue: 1.0e-42,
    effectSize: -0.750, diseaseContext: "HIV co-receptor; CCR5-delta32 protective allele",
    recommendedLayer: "dna", diseaseId: "OMIM:601373",
  },
  {
    gene: "ACE2", fullName: "Angiotensin Converting Enzyme 2",
    areas: ["infectious_disease", "cardiovascular"], topVariant: "rs2285666", pValue: 3.7e-12,
    effectSize: 0.160, diseaseContext: "SARS-CoV-2 receptor; COVID-19 severity",
    recommendedLayer: "protein", diseaseId: "OMIM:300335",
  },
  // ── Renal ───────────────────────────────────────────────────────────────────
  {
    gene: "UMOD", fullName: "Uromodulin",
    areas: ["renal"], topVariant: "rs12917707", pValue: 6.8e-32,
    effectSize: -0.420, diseaseContext: "Tubular function; CKD, kidney stones",
    recommendedLayer: "protein",
  },
  {
    gene: "SHROOM3", fullName: "Shroom Family Member 3",
    areas: ["renal"], topVariant: "rs17319721", pValue: 4.1e-20,
    effectSize: 0.270, diseaseContext: "Podocyte structure; CKD progression",
    recommendedLayer: "dna",
  },
];

export function getTargetsByArea(area: TherapeuticArea): DecodeTarget[] {
  return DECODE_TARGETS.filter((t) => t.areas.includes(area));
}

export function getTopTargets(limit = 10): DecodeTarget[] {
  return [...DECODE_TARGETS].sort((a, b) => a.pValue - b.pValue).slice(0, limit);
}

export function getTargetsBySignificance(pValueThreshold: number): DecodeTarget[] {
  return DECODE_TARGETS.filter((t) => t.pValue <= pValueThreshold);
}

export function getCoveredAreas(): TherapeuticArea[] {
  const areas = new Set<TherapeuticArea>();
  for (const t of DECODE_TARGETS) t.areas.forEach((a) => areas.add(a));
  return Array.from(areas).sort();
}

export function findTarget(gene: string): DecodeTarget | undefined {
  return DECODE_TARGETS.find((t) => t.gene.toLowerCase() === gene.toLowerCase());
}
