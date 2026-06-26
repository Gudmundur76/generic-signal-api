/**
 * Fetch real molecular data from free public APIs.
 * No authentication required. No rate limits for reasonable usage.
 *
 * All functions return null on any error so callers can fall back to
 * hardcoded templates without crashing.
 */

export interface MolecularData {
  sequence: string;
  source: string;
  confidence: number;
  structureUrl?: string;
  bioactivity?: { ic50?: number; ki?: number; pIC50?: number };
  canonicalSmiles?: string;
}

export interface SimilarCompound {
  chemblId: string;
  similarity: number;
  canonicalSmiles: string;
  pref_name: string | null;
  maxPhase: number | null;
}

// ---------------------------------------------------------------------------
// UniProt: protein sequences + AlphaFold structure links
// ---------------------------------------------------------------------------

export async function fetchUniProtSequence(gene: string): Promise<MolecularData | null> {
  try {
    const res = await fetch(
      `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(gene)}+AND+organism_id:9606&format=json&size=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      results?: Array<{
        primaryAccession?: string;
        sequence?: { value?: string; sequence?: string };
      }>;
    };
    const result = data.results?.[0];
    if (!result) return null;
    // UniProt REST API v2 uses sequence.value; older responses use sequence.sequence
    const seq = result.sequence?.value ?? result.sequence?.sequence;
    if (!seq) return null;

    return {
      sequence: seq,
      source: `uniprot:${result.primaryAccession}`,
      confidence: 0.95,
      structureUrl: result.primaryAccession
        ? `https://alphafold.ebi.ac.uk/files/AF-${result.primaryAccession}-F1-model_v4.pdb`
        : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ensembl: DNA coding sequences (CDS)
// ---------------------------------------------------------------------------

export async function fetchEnsemblCDS(gene: string): Promise<MolecularData | null> {
  try {
    const lookup = await fetch(
      `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${encodeURIComponent(gene)}?expand=1`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!lookup.ok) return null;
    const data = await lookup.json() as {
      Transcript?: Array<{ id?: string; is_canonical?: number }>;
    };
    const transcript = data.Transcript?.find((t) => t.is_canonical === 1) ?? data.Transcript?.[0];
    if (!transcript?.id) return null;

    const seqRes = await fetch(
      `https://rest.ensembl.org/sequence/id/${transcript.id}?type=cds`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!seqRes.ok) return null;
    const seqData = await seqRes.json() as { seq?: string };

    if (!seqData.seq) return null;

    return {
      sequence: seqData.seq,
      source: `ensembl:${transcript.id}`,
      confidence: 0.95,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ChEMBL: small molecule bioactivity (IC50 → pIC50)
// ---------------------------------------------------------------------------

export async function fetchChEMBLBioactivity(gene: string): Promise<MolecularData | null> {
  try {
    // Step 1: Resolve UniProt accession for this gene (human)
    const uniprotRes = await fetch(
      `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(gene)}+AND+organism_id:9606&format=json&size=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!uniprotRes.ok) return null;
    const uniprotData = await uniprotRes.json() as {
      results?: Array<{ primaryAccession?: string }>;
    };
    const accession = uniprotData.results?.[0]?.primaryAccession;
    if (!accession) return null;

    // Step 2: Look up ChEMBL target by UniProt accession (most reliable mapping)
    const targetRes = await fetch(
      `https://www.ebi.ac.uk/chembl/api/data/target.json?target_components__accession=${encodeURIComponent(accession)}&limit=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!targetRes.ok) return null;
    const targetData = await targetRes.json() as {
      targets?: Array<{ target_chembl_id?: string; pref_name?: string }>;
    };
    const target = targetData.targets?.[0];
    if (!target?.target_chembl_id) return null;

    const bioRes = await fetch(
      `https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=${target.target_chembl_id}&standard_type=IC50&limit=5`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!bioRes.ok) return null;
    const bioData = await bioRes.json() as {
      activities?: Array<{ standard_value?: string; molecule_chembl_id?: string }>;
    };

    const best = bioData.activities
      ?.filter((a) => a.standard_value && parseFloat(a.standard_value) > 0)
      ?.sort((a, b) => parseFloat(a.standard_value!) - parseFloat(b.standard_value!))[0];

    const ic50 = best?.standard_value ? parseFloat(best.standard_value) : undefined;

    // Fetch canonical SMILES for the best-activity molecule
    let canonicalSmiles: string | undefined;
    if (best?.molecule_chembl_id) {
      try {
        const molRes = await fetch(
          `https://www.ebi.ac.uk/chembl/api/data/molecule/${best.molecule_chembl_id}.json`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (molRes.ok) {
          const molData = await molRes.json() as {
            molecule_structures?: { canonical_smiles?: string };
          };
          canonicalSmiles = molData.molecule_structures?.canonical_smiles ?? undefined;
        }
      } catch {
        // non-fatal — SMILES is optional
      }
    }

    return {
      sequence: target.pref_name ?? gene,
      source: `chembl:${target.target_chembl_id}`,
      confidence: best ? 0.85 : 0.6,
      canonicalSmiles,
      bioactivity: ic50
        ? {
            ic50,
            pIC50: -Math.log10(ic50 * 1e-9),
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ChEMBL: structural similarity search (Tanimoto ≥ threshold)
// Returns up to 5 similar known compounds with their SMILES and max clinical phase
// ---------------------------------------------------------------------------

export async function fetchChEMBLSimilarity(
  smiles: string,
  threshold = 70
): Promise<SimilarCompound[]> {
  if (!smiles || smiles.length < 5) return [];
  try {
    const encoded = encodeURIComponent(smiles);
    const res = await fetch(
      `https://www.ebi.ac.uk/chembl/api/data/similarity/${encoded}/${threshold}.json?limit=5`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      molecules?: Array<{
        molecule_chembl_id?: string;
        similarity?: number;
        molecule_structures?: { canonical_smiles?: string };
        pref_name?: string | null;
        max_phase?: number | null;
      }>;
    };
    return (data.molecules ?? []).map((m) => ({
      chemblId: m.molecule_chembl_id ?? "unknown",
      similarity: m.similarity ?? threshold,
      canonicalSmiles: m.molecule_structures?.canonical_smiles ?? "",
      pref_name: m.pref_name ?? null,
      maxPhase: m.max_phase ?? null,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Router: dispatch to the correct API by molecular layer
// ---------------------------------------------------------------------------

export async function fetchMolecularData(
  gene: string,
  layer: "dna" | "rna" | "protein" | "small_molecule"
): Promise<MolecularData | null> {
  switch (layer) {
    case "protein":
      return fetchUniProtSequence(gene);
    case "dna":
      return fetchEnsemblCDS(gene);
    case "rna":
      return fetchEnsemblCDS(gene);
    case "small_molecule":
      return fetchChEMBLBioactivity(gene);
    default:
      return null;
  }
}
