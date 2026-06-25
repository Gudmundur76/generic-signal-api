import { ENV } from "../_core/env";

// The Citation API base URL. No separate env var exists yet, so we use the
// known production URL directly. Override CITATION_API_URL if needed.
const CITATION_API_BASE =
  process.env.CITATION_API_URL ?? "https://citation.manus.space";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CitationClaim {
  claim: string;
  gene?: string;
  sequence?: string;
  context?: string;
}

export interface CitationSource {
  name: string;
  url?: string;
  snippet?: string;
  pmid?: string;
}

export interface CitationResult {
  claim: string;
  status: "Supported" | "Contradicted" | "Unverified" | "Partially Supported";
  confidence: number;
  sources: CitationSource[];
}

// ── Raw API response shape ────────────────────────────────────────────────────

interface RawCitationResult {
  claim?: string;
  verdict?: string;
  confidenceScore?: number;
  confidence?: number;
  sources?: Array<{ name?: string; url?: string; snippet?: string; pmid?: string }>;
  citedPmids?: string[];
}

interface RawApiResponse {
  results?: RawCitationResult[];
  // Single-claim shorthand (the API also accepts a single claim object)
  verdict?: string;
  confidenceScore?: number;
  sources?: RawCitationResult["sources"];
  citedPmids?: string[];
}

// ── Normaliser ────────────────────────────────────────────────────────────────

function normaliseVerdict(
  raw: string | undefined
): CitationResult["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "supported":
      return "Supported";
    case "contradicted":
      return "Contradicted";
    case "partially supported":
    case "partial":
      return "Partially Supported";
    default:
      return "Unverified";
  }
}

function normaliseResult(raw: RawCitationResult, claim: string): CitationResult {
  const pmids: CitationSource[] = (raw.citedPmids ?? []).map((pmid) => ({
    name: `PubMed ${pmid}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pmid,
  }));

  const namedSources: CitationSource[] = (raw.sources ?? []).map((s) => ({
    name: s.name ?? "Unknown source",
    url: s.url,
    snippet: s.snippet,
    pmid: s.pmid,
  }));

  // Merge, deduplicating by pmid
  const seen = new Set<string>();
  const sources: CitationSource[] = [];
  for (const s of [...namedSources, ...pmids]) {
    const key = s.pmid ?? s.url ?? s.name;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(s);
    }
  }

  return {
    claim: raw.claim ?? claim,
    status: normaliseVerdict(raw.verdict),
    confidence: raw.confidenceScore ?? raw.confidence ?? 0.5,
    sources,
  };
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function fallbackResults(claims: CitationClaim[]): CitationResult[] {
  return claims.map((c) => ({
    claim: c.claim,
    status: "Unverified" as const,
    confidence: 0.5,
    sources: [],
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify one or more claims against the Citation API.
 *
 * Gracefully falls back to `Unverified` results when:
 *   - The service is unreachable (network error, timeout)
 *   - The service returns a non-200 status
 *   - The response body is not valid JSON (e.g. "Site Unavailable" HTML)
 *   - The API key is missing
 *
 * @param claims  Array of claims to verify.
 * @returns       Array of CitationResult in the same order as the input.
 */
export async function verifyClaims(
  claims: CitationClaim[]
): Promise<CitationResult[]> {
  if (claims.length === 0) return [];

  if (!ENV.citationApiKey) {
    console.warn("[citation] CITATION_API_KEY not set — returning Unverified");
    return fallbackResults(claims);
  }

  try {
    const response = await fetch(`${CITATION_API_BASE}/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.citationApiKey}`,
      },
      body: JSON.stringify({ claims }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(
        `[citation] API returned HTTP ${response.status} — falling back to Unverified`
      );
      return fallbackResults(claims);
    }

    // Guard against HTML "Site Unavailable" responses
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      console.warn(
        `[citation] API returned non-JSON content-type "${contentType}" — falling back`
      );
      return fallbackResults(claims);
    }

    const data = (await response.json()) as RawApiResponse;

    // Multi-claim response
    if (Array.isArray(data.results) && data.results.length > 0) {
      return data.results.map((r, i) =>
        normaliseResult(r, claims[i]?.claim ?? "")
      );
    }

    // Single-claim shorthand response (API returns the result directly)
    if (data.verdict !== undefined) {
      return [normaliseResult(data as RawCitationResult, claims[0].claim)];
    }

    console.warn("[citation] Unexpected response shape — falling back");
    return fallbackResults(claims);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[citation] API unreachable: ${msg} — falling back to Unverified`);
    return fallbackResults(claims);
  }
}

/**
 * Convenience wrapper for verifying a single claim.
 */
export async function verifyClaim(
  claim: CitationClaim
): Promise<CitationResult> {
  const results = await verifyClaims([claim]);
  return results[0];
}
