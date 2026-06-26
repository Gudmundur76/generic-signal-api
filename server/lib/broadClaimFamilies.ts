/**
 * server/lib/broadClaimFamilies.ts
 *
 * Registry of known broad-claim patent families that may block novel compounds
 * even when a gene-level Notus FTO search returns CLEAR.
 *
 * Each entry represents a patent family with broad structural claims that
 * cover a class of compounds rather than a specific molecule. A compound
 * targeting a gene in the same therapeutic area as one of these families
 * should trigger a "fto-analysis-required" recommendation regardless of
 * the Notus gene-level result.
 *
 * Sources:
 *   - Ghosh/Mitsuya Purdue HIV PI family: Technology No. 2017-GHOS-67663
 *   - Amgen PCSK9 mAb family: US8,829,165 + US9,255,154
 *   - Regeneron ANGPTL3 family: US10,232,008 + US10,428,158
 *   - Alnylam siRNA scaffold family: US9,181,551 + US9,790,494
 *   - Ionis/AstraZeneca antisense APOC3: US9,127,274
 */

export interface BroadClaimFamily {
  /** Human-readable name of the patent family */
  name: string;
  /** Representative patent number (US format) */
  leadPatent: string;
  /** Assignee / owner */
  assignee: string;
  /** Therapeutic areas this family covers */
  therapeuticAreas: string[];
  /** Gene targets explicitly named in the claims */
  targetGenes: string[];
  /** Molecular layers / modality this family covers */
  layers: string[];
  /** Approximate expiry of the lead patent */
  leadPatentExpiry: string;
  /** Short description of the claim scope */
  claimScope: string;
  /** Risk level: high = almost certainly blocking; medium = needs FTO analysis */
  riskLevel: "high" | "medium";
}

export const BROAD_CLAIM_FAMILIES: BroadClaimFamily[] = [
  // ── HIV Protease Inhibitors ────────────────────────────────────────────────
  {
    name: "Ghosh/Mitsuya Tricyclic P2 HIV PI Family",
    leadPatent: "US10,040,799",
    assignee: "Purdue Research Foundation",
    therapeuticAreas: ["antiviral", "hiv"],
    targetGenes: ["HIV1PR", "HIV2PR"],
    layers: ["small_molecule"],
    leadPatentExpiry: "2036-08-15",
    claimScope:
      "Novel tricyclic P2 ligand-containing HIV protease inhibitors with activity against multidrug-resistant variants. Covers hydroxyethylamine isostere scaffolds with bicyclic/tricyclic P2 groups.",
    riskLevel: "high",
  },
  {
    name: "Janssen Darunavir PED Extension",
    leadPatent: "US7,700,645",
    assignee: "Janssen Sciences Ireland",
    therapeuticAreas: ["antiviral", "hiv"],
    targetGenes: ["HIV1PR"],
    layers: ["small_molecule"],
    leadPatentExpiry: "2027-06-26",
    claimScope:
      "Pseudopolymorphic forms of darunavir (TMC114). PED extension expires Jun 26 2027. Core compound patent expired Dec 2026.",
    riskLevel: "medium",
  },

  // ── Cardiovascular / Lipid ─────────────────────────────────────────────────
  {
    name: "Amgen Anti-PCSK9 Antibody Family",
    leadPatent: "US8,829,165",
    assignee: "Amgen Inc.",
    therapeuticAreas: ["cardiovascular"],
    targetGenes: ["PCSK9"],
    layers: ["protein"],
    leadPatentExpiry: "2030-09-25",
    claimScope:
      "Monoclonal antibodies that bind PCSK9 and block LDL-R interaction. Covers evolocumab (Repatha) and structurally similar anti-PCSK9 mAbs.",
    riskLevel: "high",
  },
  {
    name: "Regeneron ANGPTL3 Antibody Family (Evinacumab)",
    leadPatent: "US10,232,008",
    assignee: "Regeneron Pharmaceuticals",
    therapeuticAreas: ["cardiovascular"],
    targetGenes: ["ANGPTL3"],
    layers: ["protein"],
    leadPatentExpiry: "2036-07-14",
    claimScope:
      "Human monoclonal antibodies that bind and inhibit ANGPTL3 (angiopoietin-like 3). Covers evinacumab (Evkeeza) and related antibodies.",
    riskLevel: "high",
  },

  // ── RNA / Antisense / siRNA ────────────────────────────────────────────────
  {
    name: "Alnylam GalNAc-siRNA Scaffold Family",
    leadPatent: "US9,181,551",
    assignee: "Alnylam Pharmaceuticals",
    therapeuticAreas: ["cardiovascular", "metabolic", "rare_disease"],
    targetGenes: ["TTR", "APOC3", "ANGPTL3", "LPA"],
    layers: ["rna", "dna"],
    leadPatentExpiry: "2033-11-02",
    claimScope:
      "GalNAc-conjugated siRNA molecules for hepatic gene silencing. Covers patisiran, inclisiran, and related siRNA constructs targeting liver-expressed genes.",
    riskLevel: "high",
  },
  {
    name: "Ionis/AstraZeneca Antisense APOC3 Family",
    leadPatent: "US9,127,274",
    assignee: "Ionis Pharmaceuticals",
    therapeuticAreas: ["cardiovascular"],
    targetGenes: ["APOC3"],
    layers: ["rna", "dna"],
    leadPatentExpiry: "2030-04-18",
    claimScope:
      "Antisense oligonucleotides targeting APOC3 mRNA for treatment of hypertriglyceridemia. Covers volanesorsen and related ASO constructs.",
    riskLevel: "high",
  },

  // ── CRISPR / Gene Editing ──────────────────────────────────────────────────
  {
    name: "Broad Institute CRISPR-Cas9 Foundation Patents",
    leadPatent: "US8,697,359",
    assignee: "Broad Institute / MIT / Harvard",
    therapeuticAreas: ["cardiovascular", "oncology", "rare_disease", "neurodegenerative"],
    targetGenes: ["PCSK9", "TTR", "APOE", "APOC3", "ANGPTL3"],
    layers: ["dna"],
    leadPatentExpiry: "2033-05-28",
    claimScope:
      "CRISPR-Cas9 gene editing in eukaryotic cells. Covers any therapeutic application of Cas9-based editing regardless of target gene. Extremely broad claim scope.",
    riskLevel: "high",
  },
];

/**
 * Check whether a given gene + layer combination is covered by any known
 * broad-claim patent family.
 *
 * Returns all matching families sorted by risk level (high first).
 */
export function checkBroadClaimRisk(
  gene: string,
  layer: string,
  therapeuticArea?: string
): BroadClaimFamily[] {
  const geneUpper = gene.toUpperCase();
  return BROAD_CLAIM_FAMILIES.filter((family) => {
    const geneMatch = family.targetGenes.some(
      (g) => g.toUpperCase() === geneUpper
    );
    const layerMatch = family.layers.includes(layer);
    const areaMatch = therapeuticArea
      ? family.therapeuticAreas.some(
          (a) => a.toLowerCase() === therapeuticArea.toLowerCase()
        )
      : true;
    return geneMatch && layerMatch && areaMatch;
  }).sort((a, b) => (a.riskLevel === "high" ? -1 : 1) - (b.riskLevel === "high" ? -1 : 1));
}

/**
 * Derive a patent-clear recommendation from FTO status + broad-claim risk.
 *
 * "proceed"               → CLEAR ftoStatus, no broad-claim risk
 * "proceed-with-caution"  → CLEAR ftoStatus, medium broad-claim risk
 * "fto-analysis-required" → RISK ftoStatus OR high broad-claim risk
 * "do-not-file"           → BLOCKED ftoStatus
 */
export type PatentRecommendation =
  | "proceed"
  | "proceed-with-caution"
  | "fto-analysis-required"
  | "do-not-file";

export function derivePatentRecommendation(
  ftoStatus: "CLEAR" | "RISK" | "BLOCKED" | "UNKNOWN",
  broadClaimFamilies: BroadClaimFamily[]
): PatentRecommendation {
  if (ftoStatus === "BLOCKED") return "do-not-file";
  if (ftoStatus === "RISK") return "fto-analysis-required";

  const highRisk = broadClaimFamilies.some((f) => f.riskLevel === "high");
  const mediumRisk = broadClaimFamilies.some((f) => f.riskLevel === "medium");

  if (highRisk) return "fto-analysis-required";
  if (mediumRisk) return "proceed-with-caution";
  return "proceed";
}
