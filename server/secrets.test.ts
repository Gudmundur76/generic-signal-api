import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

// ── Secret presence tests ─────────────────────────────────────────────────────────────────────
// These tests confirm the keys are stored as project secrets and exported
// correctly via ENV. They do NOT make network calls.
describe("API key secrets", () => {
  it("NOTUS_API_KEY is set and non-empty", () => {
    expect(ENV.notusApiKey).toBeTruthy();
    expect(ENV.notusApiKey.length).toBeGreaterThan(10);
  });

  it("CITATION_API_KEY is set and non-empty", () => {
    expect(ENV.citationApiKey).toBeTruthy();
    expect(ENV.citationApiKey.length).toBeGreaterThan(10);
  });

  it("NOTUS_API_KEY starts with notus_sk_", () => {
    expect(ENV.notusApiKey).toMatch(/^notus_sk_/);
  });

  it("CITATION_API_KEY starts with citation_sk_", () => {
    expect(ENV.citationApiKey).toMatch(/^citation_sk_/);
  });

  it("NOTUS_API_KEY is accessible via process.env", () => {
    expect(process.env.NOTUS_API_KEY).toBeTruthy();
  });

  it("CITATION_API_KEY is accessible via process.env", () => {
    expect(process.env.CITATION_API_KEY).toBeTruthy();
  });
});

// ── Live endpoint tests (skipped — services currently unavailable) ────────────────────
// Unskip once citation.manus.space and hivprotease-eq9ltmms.manus.space are live.
describe("Citation API live check", () => {
  it.skip("POST /v1/verify returns a verdict (requires service to be running)", async () => {
    const res = await fetch("https://citation.manus.space/v1/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENV.citationApiKey}`,
      },
      body: JSON.stringify({ claim: "PCSK9 is a validated cardiovascular drug target" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { verdict?: string; confidenceScore?: number };
    expect(data.verdict).toBeTruthy();
    expect(typeof data.confidenceScore).toBe("number");
  }, 15000);
});

describe("Notus API live check", () => {
  it.skip("POST /v1/patents/search/expiring returns hits array (requires service to be running)", async () => {
    const res = await fetch("https://hivprotease-eq9ltmms.manus.space/v1/patents/search/expiring", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENV.notusApiKey}`,
      },
      body: JSON.stringify({ query: "PCSK9", limit: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { hits?: unknown[] };
    expect(Array.isArray(data.hits)).toBe(true);
  }, 15000);
});
