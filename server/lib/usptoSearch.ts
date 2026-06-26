/**
 * USPTO Prior Art Search via PatentsView API (free, no auth required)
 * https://patentsview.org/apis/api-endpoints
 *
 * Two search modes:
 *   1. searchUsptoByKeyword — full-text search by gene/compound name
 *   2. searchUsptoBySmiles  — structural similarity proxy via keyword extraction from SMILES
 *
 * All functions return empty arrays on any error so callers never crash.
 */

export interface PatentResult {
  patentNumber: string;
  title: string;
  assignee: string | null;
  filingDate: string | null;
  grantDate: string | null;
  abstract: string | null;
  url: string;
  relevanceScore: number; // 0–1 heuristic
}

const PATENTSVIEW_BASE = "https://search.patentsview.org/api/v1/patent";

// Fields we request from PatentsView
const FIELDS = [
  "patent_id",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_year",
  "assignees.assignee_organization",
  "applications.app_date",
].join(",");

// ---------------------------------------------------------------------------
// Core search: query PatentsView by a text query string
// Returns up to 10 results sorted by grant date desc
// ---------------------------------------------------------------------------

async function queryPatentsView(query: string): Promise<PatentResult[]> {
  try {
    const body = {
      q: { _text_any: { patent_abstract: query } },
      f: FIELDS.split(","),
      s: [{ patent_date: "desc" }],
      o: { per_page: 10 },
    };

    const res = await fetch(PATENTSVIEW_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      patents?: Array<{
        patent_id?: string;
        patent_title?: string;
        patent_abstract?: string;
        patent_date?: string;
        assignees?: Array<{ assignee_organization?: string }>;
        applications?: Array<{ app_date?: string }>;
      }>;
    };

    return (data.patents ?? []).map((p, i) => ({
      patentNumber: p.patent_id ?? "UNKNOWN",
      title: p.patent_title ?? "Untitled",
      assignee: p.assignees?.[0]?.assignee_organization ?? null,
      filingDate: p.applications?.[0]?.app_date ?? null,
      grantDate: p.patent_date ?? null,
      abstract: p.patent_abstract ? p.patent_abstract.slice(0, 400) : null,
      url: `https://patents.google.com/patent/US${p.patent_id}`,
      relevanceScore: Math.max(0, 1 - i * 0.08), // rank-based heuristic
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Search by gene/compound keyword (primary mode for cardiovascular targets)
// ---------------------------------------------------------------------------

export async function searchUsptoByKeyword(
  keyword: string,
  therapeuticArea?: string
): Promise<PatentResult[]> {
  const terms = [keyword];
  if (therapeuticArea) terms.push(therapeuticArea);
  // Also search common synonyms for known targets
  const synonyms: Record<string, string[]> = {
    PCSK9: ["proprotein convertase subtilisin kexin type 9", "evolocumab", "alirocumab"],
    LPA: ["lipoprotein a", "apo a", "LPA antagonist"],
    APOE: ["apolipoprotein E", "APOE modulator"],
    ANGPTL3: ["angiopoietin-like 3", "evinacumab"],
    CETP: ["cholesteryl ester transfer protein", "obicetrapib", "anacetrapib"],
    HMGCR: ["HMG-CoA reductase", "statin", "bempedoic acid"],
    APOC3: ["apolipoprotein C-III", "volanesorsen"],
    TTR: ["transthyretin", "patisiran", "tafamidis"],
  };
  const extra = synonyms[keyword.toUpperCase()] ?? [];
  const query = [...terms, ...extra].join(" ");
  return queryPatentsView(query);
}

// ---------------------------------------------------------------------------
// Search by SMILES string — extracts chemical class keywords from SMILES
// and searches PatentsView by those terms (structural search not available
// in PatentsView; this is the best available free approximation)
// ---------------------------------------------------------------------------

export function extractChemicalKeywords(smiles: string): string[] {
  const keywords: string[] = [];
  // Detect common pharmacophore features from SMILES patterns
  if (/N\(C\(=O\)/.test(smiles)) keywords.push("amide protease inhibitor");
  if (/c1ccc/.test(smiles)) keywords.push("aromatic ring compound");
  if (/F/.test(smiles)) keywords.push("fluorinated compound");
  if (/Cl/.test(smiles)) keywords.push("chlorinated compound");
  if (/\[NH\]/.test(smiles) || /N[^(]/.test(smiles)) keywords.push("amine compound");
  if (/C\(=O\)O/.test(smiles)) keywords.push("carboxylic acid ester");
  if (/S\(=O\)/.test(smiles)) keywords.push("sulfonamide compound");
  if (/\[nH\]/.test(smiles)) keywords.push("heterocyclic compound");
  // Default fallback
  if (keywords.length === 0) keywords.push("small molecule protease inhibitor");
  return keywords;
}

export async function searchUsptoBySmiles(
  smiles: string,
  gene?: string
): Promise<PatentResult[]> {
  if (!smiles || smiles.length < 5) return [];
  const chemKeywords = extractChemicalKeywords(smiles);
  const query = gene
    ? `${gene} ${chemKeywords.slice(0, 2).join(" ")}`
    : chemKeywords.join(" ");
  return queryPatentsView(query);
}

// ---------------------------------------------------------------------------
// Convenience: search both by keyword and SMILES, deduplicate by patent number
// ---------------------------------------------------------------------------

export async function searchUsptoFull(
  gene: string,
  smiles?: string,
  therapeuticArea?: string
): Promise<PatentResult[]> {
  const [byKeyword, bySmiles] = await Promise.all([
    searchUsptoByKeyword(gene, therapeuticArea),
    smiles ? searchUsptoBySmiles(smiles, gene) : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const merged: PatentResult[] = [];
  for (const p of [...byKeyword, ...bySmiles]) {
    if (!seen.has(p.patentNumber)) {
      seen.add(p.patentNumber);
      merged.push(p);
    }
  }
  // Sort by relevance desc, cap at 10
  return merged.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);
}
