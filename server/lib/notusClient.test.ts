/**
 * notusClient.test.ts
 * Tests for the embedded curated USPTO/EPO patent dataset (Sprint 14).
 * No external API calls — all data is embedded in notusClient.ts.
 */
import { describe, it, expect } from "vitest";
import { fetchPatentLandscape } from "./notusClient";

describe("notusClient", () => {
  it(
    "Test 1: fetchPatentLandscape(PCSK9) returns RISK with 4 active patents (threshold 5+ for BLOCKED)",
    async () => {
      const result = await fetchPatentLandscape("PCSK9");
      expect(result).toBeDefined();
      // PCSK9 has 4 active blocking patents; threshold is 5+ for BLOCKED → RISK
      expect(result.ftoStatus).toBe("RISK");
      expect(result.totalBlockingPatents).toBe(4);
      expect(Array.isArray(result.patents)).toBe(true);
      expect(result.patents.length).toBeGreaterThan(0);
    },
    20_000
  );

  it(
    "Test 2: fetchPatentLandscape(FAKEGENE999) returns CLEAR (no patents = clear FTO)",
    async () => {
      // Unknown genes have no patents in the embedded dataset → CLEAR FTO (not UNKNOWN)
      const result = await fetchPatentLandscape("FAKEGENE999");
      expect(result.ftoStatus).toBe("CLEAR");
      expect(result.patents).toEqual([]);
      expect(result.totalBlockingPatents).toBe(0);
    },
    20_000
  );

  it(
    "Test 3: fetchPatentLandscape(HMGCR) returns CLEAR (all statin patents expired)",
    async () => {
      const result = await fetchPatentLandscape("HMGCR");
      expect(result).toHaveProperty("ftoStatus");
      expect(result).toHaveProperty("patents");
      expect(result).toHaveProperty("totalBlockingPatents");
      // All statin core patents expired → CLEAR FTO
      expect(result.ftoStatus).toBe("CLEAR");
      expect(result.totalBlockingPatents).toBe(0);
    },
    20_000
  );
});
