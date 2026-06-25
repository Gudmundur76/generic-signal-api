/**
 * molecularData.test.ts
 * 6 tests as specified. Uses real API calls (no mocks).
 * Each test has a 20s timeout to accommodate network latency.
 */
import { describe, it, expect } from "vitest";
import {
  fetchUniProtSequence,
  fetchEnsemblCDS,
  fetchChEMBLBioactivity,
  fetchMolecularData,
} from "./lib/molecularData";

describe("molecularData", () => {
  it(
    "Test 1: fetchUniProtSequence(PCSK9) returns non-null, sequence.length > 100, source starts with uniprot:, structureUrl includes alphafold",
    async () => {
      const result = await fetchUniProtSequence("PCSK9");
      expect(result).not.toBeNull();
      expect(result!.sequence.length).toBeGreaterThan(100);
      expect(result!.source).toMatch(/^uniprot:/);
      expect(result!.structureUrl).toBeDefined();
      expect(result!.structureUrl).toContain("alphafold");
    },
    20_000
  );

  it(
    "Test 2: fetchEnsemblCDS(PCSK9) returns non-null, sequence.length > 500, source starts with ensembl:",
    async () => {
      const result = await fetchEnsemblCDS("PCSK9");
      expect(result).not.toBeNull();
      expect(result!.sequence.length).toBeGreaterThan(500);
      expect(result!.source).toMatch(/^ensembl:/);
    },
    20_000
  );

  it(
    "Test 3: fetchChEMBLBioactivity(PCSK9) returns non-null, source starts with chembl:",
    async () => {
      const result = await fetchChEMBLBioactivity("PCSK9");
      expect(result).not.toBeNull();
      expect(result!.source).toMatch(/^chembl:/);
    },
    20_000
  );

  it(
    "Test 4: fetchMolecularData(PCSK9, protein) returns non-null with structureUrl",
    async () => {
      const result = await fetchMolecularData("PCSK9", "protein");
      expect(result).not.toBeNull();
      expect(result!.structureUrl).toBeDefined();
      expect(result!.structureUrl).toContain("alphafold");
    },
    20_000
  );

  it(
    "Test 5: fetchMolecularData(PCSK9, dna) returns non-null, sequence.length > 500",
    async () => {
      const result = await fetchMolecularData("PCSK9", "dna");
      expect(result).not.toBeNull();
      expect(result!.sequence.length).toBeGreaterThan(500);
    },
    20_000
  );

  it(
    "Test 6: fetchMolecularData(FAKEGENE999, protein) returns null (graceful)",
    async () => {
      const result = await fetchMolecularData("FAKEGENE999", "protein");
      expect(result).toBeNull();
    },
    20_000
  );
});
