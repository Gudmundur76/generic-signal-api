import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyClaims, verifyClaim } from "./lib/citationClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(
  status: number,
  body: unknown,
  contentType = "application/json"
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: async () => body,
  });
}

function htmlFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    json: async () => { throw new SyntaxError("not json"); },
  });
}

function networkErrorFetch() {
  return vi.fn().mockRejectedValue(new TypeError("fetch failed"));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("verifyClaims", () => {
  const originalFetch = globalThis.fetch;
  const originalCitationApiKey = process.env.CITATION_API_KEY;

  beforeEach(() => {
    // Set a dummy API key so verifyClaims uses the primary path (not PubMed fallback)
    process.env.CITATION_API_KEY = "test-citation-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.CITATION_API_KEY = originalCitationApiKey;
    vi.restoreAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const results = await verifyClaims([]);
    expect(results).toEqual([]);
  });

  it("normalises a multi-claim API response", async () => {
    globalThis.fetch = mockFetch(200, {
      results: [
        {
          claim: "PCSK9 is a cardiovascular target",
          verdict: "Supported",
          confidenceScore: 0.97,
          citedPmids: ["12345678", "87654321"],
        },
      ],
    });

    const results = await verifyClaims([
      { claim: "PCSK9 is a cardiovascular target", gene: "PCSK9" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("Supported");
    expect(results[0].confidence).toBe(0.97);
    expect(results[0].sources).toHaveLength(2);
    expect(results[0].sources[0].pmid).toBe("12345678");
    expect(results[0].sources[0].url).toContain("pubmed.ncbi.nlm.nih.gov/12345678");
  });

  it("normalises a single-claim shorthand API response", async () => {
    globalThis.fetch = mockFetch(200, {
      verdict: "Partially Supported",
      confidenceScore: 0.72,
      citedPmids: ["11111111"],
    });

    const result = await verifyClaim({ claim: "LPA causes CVD" });

    expect(result.status).toBe("Partially Supported");
    expect(result.confidence).toBe(0.72);
    expect(result.sources[0].pmid).toBe("11111111");
  });

  it("falls back to Unverified on HTTP 503", async () => {
    globalThis.fetch = mockFetch(503, {});

    const results = await verifyClaims([{ claim: "some claim" }]);

    expect(results[0].status).toBe("Unverified");
    expect(results[0].confidence).toBe(0.5);
    expect(results[0].sources).toEqual([]);
  });

  it("falls back to Unverified when response is HTML (service unavailable)", async () => {
    globalThis.fetch = htmlFetch();

    const results = await verifyClaims([{ claim: "some claim" }]);

    expect(results[0].status).toBe("Unverified");
    expect(results[0].sources).toEqual([]);
  });

  it("falls back to Unverified on network error", async () => {
    globalThis.fetch = networkErrorFetch();

    const results = await verifyClaims([{ claim: "some claim" }]);

    expect(results[0].status).toBe("Unverified");
    expect(results[0].sources).toEqual([]);
  });

  it("falls back to Unverified on unexpected response shape", async () => {
    globalThis.fetch = mockFetch(200, { unexpected: true });

    const results = await verifyClaims([{ claim: "some claim" }]);

    expect(results[0].status).toBe("Unverified");
  });

  it("deduplicates sources by pmid", async () => {
    globalThis.fetch = mockFetch(200, {
      results: [
        {
          claim: "test",
          verdict: "Supported",
          confidenceScore: 0.9,
          sources: [{ name: "PubMed 99999", pmid: "99999" }],
          citedPmids: ["99999", "88888"],
        },
      ],
    });

    const results = await verifyClaims([{ claim: "test" }]);
    const pmids = results[0].sources.map((s) => s.pmid);
    const unique = new Set(pmids);
    expect(unique.size).toBe(pmids.length);
  });

  it("handles multiple claims in one call", async () => {
    globalThis.fetch = mockFetch(200, {
      results: [
        { claim: "claim A", verdict: "Supported", confidenceScore: 0.9, citedPmids: [] },
        { claim: "claim B", verdict: "Contradicted", confidenceScore: 0.8, citedPmids: [] },
      ],
    });

    const results = await verifyClaims([
      { claim: "claim A" },
      { claim: "claim B" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("Supported");
    expect(results[1].status).toBe("Contradicted");
  });
});
