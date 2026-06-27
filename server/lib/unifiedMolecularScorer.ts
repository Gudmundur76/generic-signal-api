/**
 * unifiedMolecularScorer.ts
 * Aggregates signals from 60+ data sources into a composite molecular score.
 * Each source contributes a weighted sub-score; the final score is 0–100.
 */

export interface MolecularCandidate {
  id: string;
  smiles?: string;
  name: string;
  domain: string;
  rawSignals: Record<string, number>;
}

export interface ScoredCandidate extends MolecularCandidate {
  compositeScore: number;
  subScores: Record<string, number>;
  tier: "S" | "A" | "B" | "C" | "D";
  scoredAt: string;
}

/** Source weights — 60 sources across 6 categories */
export const SOURCE_WEIGHTS: Record<string, number> = {
  // Structural biology (10 sources)
  alphafold_confidence: 0.8,
  pdb_resolution: 0.7,
  uniprot_annotation: 0.9,
  rcsb_binding_affinity: 0.85,
  prosite_motif_match: 0.6,
  pfam_domain_coverage: 0.65,
  scop_fold_class: 0.55,
  cath_topology: 0.55,
  dssp_secondary_structure: 0.5,
  stride_accessibility: 0.45,

  // Bioactivity (12 sources)
  chembl_activity: 0.95,
  pubchem_bioassay: 0.9,
  bindingdb_kd: 0.9,
  drugbank_target: 0.85,
  stitch_interaction: 0.75,
  dgidb_interaction: 0.7,
  ttd_target: 0.8,
  pharos_tdl: 0.75,
  opentargets_score: 0.9,
  ctd_chemical_gene: 0.7,
  hmdb_metabolite: 0.65,
  kegg_pathway: 0.7,

  // Genomics (10 sources)
  gnomad_frequency: 0.8,
  clinvar_significance: 0.95,
  omim_phenotype: 0.9,
  gwas_catalog_pvalue: 0.85,
  ensembl_gene_score: 0.75,
  ncbi_gene_expression: 0.7,
  gtex_tissue_expression: 0.75,
  encode_regulatory: 0.65,
  roadmap_epigenomics: 0.6,
  fantom5_enhancer: 0.55,

  // Literature (8 sources)
  pubmed_citation_count: 0.7,
  biorxiv_preprint_score: 0.6,
  semantic_scholar_influence: 0.65,
  europe_pmc_mentions: 0.6,
  lens_patent_citations: 0.7,
  dimensions_altmetric: 0.55,
  crossref_citation_velocity: 0.6,
  unpaywall_open_access: 0.4,

  // Clinical (10 sources)
  clinicaltrials_phase: 0.95,
  fda_approval_status: 1.0,
  ema_approval_status: 0.95,
  who_essential_medicine: 0.85,
  nci_thesaurus: 0.8,
  mesh_disease_association: 0.75,
  icd11_code_match: 0.7,
  orphanet_rare_disease: 0.8,
  reactome_pathway: 0.7,
  biogrid_interaction: 0.65,

  // Patent & IP (10 sources)
  uspto_patent_count: 0.75,
  epo_patent_count: 0.7,
  wipo_filing_count: 0.65,
  google_patents_citations: 0.7,
  lens_patent_family_size: 0.65,
  espacenet_legal_status: 0.8,
  patsnap_innovation_index: 0.75,
  derwent_innovation_score: 0.8,
  clarivate_patent_strength: 0.85,
  ifi_claims_coverage: 0.7,
};

function tierFromScore(score: number): ScoredCandidate["tier"] {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

export function scoreCandidate(candidate: MolecularCandidate): ScoredCandidate {
  const subScores: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [source, weight] of Object.entries(SOURCE_WEIGHTS)) {
    const raw = candidate.rawSignals[source] ?? 0;
    // Normalise raw signal to 0–1 if > 1
    const normalised = raw > 1 ? Math.min(raw / 100, 1) : raw;
    const sub = normalised * 100;
    subScores[source] = Math.round(sub * 10) / 10;
    weightedSum += sub * weight;
    totalWeight += weight;
  }

  const compositeScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

  return {
    ...candidate,
    compositeScore,
    subScores,
    tier: tierFromScore(compositeScore),
    scoredAt: new Date().toISOString(),
  };
}

export function scoreCandidates(candidates: MolecularCandidate[]): ScoredCandidate[] {
  return candidates.map(scoreCandidate).sort((a, b) => b.compositeScore - a.compositeScore);
}
