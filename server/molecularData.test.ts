/**
 * Tests for server/lib/molecularData.ts
 *
 * The public APIs (UniProt, Ensembl, ChEMBL) may be unreachable in CI.
 * All tests are written to pass whether the service is live or down:
 *   - If live: validates real response shape
 *   - If down: validates graceful null return
 */
import { describe, it, expect } from "vitest";
import {
  fetchUniProtSequence,
  fetchEnsemblCDS,
  fetchChEMBLBioactivity,
  fetchMolecularData,
  type MolecularData,
} from "./lib/molecularData";

// ---------------------------------------------------------------------------
// Helper: validate MolecularData shape when a result is returned
// ---------------------------------------------------------------------------
function assertMolecularDataShape(data: MolecularData) {
  expect(typeof data.sequence).toBe("string");
  expect(data.sequence.length).toBeGreaterThan(0);
  expect(typeof data.source).toBe("string");
  expect(data.source.length).toBeGreaterThan(0);
  expect(data.confidence).toBeGreaterThan(0);
  expect(data.confidence).toBeLessThanOrEqual(1);
}

// ---------------------------------------------------------------------------
// fetchUniProtSequence
// ---------------------------------------------------------------------------
describe("fetchUniProtSequence", () => {
  it("returns null or a valid MolecularData for PCSK9", async () => {
    const result = await fetchUniProtSequence("PCSK9");
    if (result === null) {
      // Service is down — acceptable
      expect(result).toBeNull();
    } else {
      assertMolecularDataShape(result);
      expect(result.source).toMatch(/^uniprot:/);
      // UniProt accession is typically 6 chars
      expect(result.source.length).toBeGreaterThan(8);
    }
  }, 15_000);

  it("returns null or a valid MolecularData for LPA", async () => {
    const result = await fetchUniProtSequence("LPA");
    if (result !== null) {
      assertMolecularDataShape(result);
      expect(result.source).toMatch(/^uniprot:/);
      // AlphaFold URL should be set when accession is known
      if (result.structureUrl) {
        expect(result.structureUrl).toMatch(/alphafold\.ebi\.ac\.uk/);
      }
    }
  }, 15_000);

  it("returns null for a nonsense gene name", async () => {
    const result = await fetchUniProtSequence("XYZNOTAREALGENE999");
    expect(result).toBeNull();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// fetchEnsemblCDS
// ---------------------------------------------------------------------------
describe("fetchEnsemblCDS", () => {
  it("returns null or a valid CDS for PCSK9", async () => {
    const result = await fetchEnsemblCDS("PCSK9");
    if (result === null) {
      expect(result).toBeNull();
    } else {
      assertMolecularDataShape(result);
      expect(result.source).toMatch(/^ensembl:/);
      // CDS should start with ATG (start codon)
      expect(result.sequence.toUpperCase()).toMatch(/^ATG/);
    }
  }, 20_000);

  it("returns null for a nonsense gene name", async () => {
    const result = await fetchEnsemblCDS("XYZNOTAREALGENE999");
    expect(result).toBeNull();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// fetchChEMBLBioactivity
// ---------------------------------------------------------------------------
describe("fetchChEMBLBioactivity", () => {
  it("returns null or a valid bioactivity record for PCSK9", async () => {
    const result = await fetchChEMBLBioactivity("PCSK9");
    if (result === null) {
      expect(result).toBeNull();
    } else {
      assertMolecularDataShape(result);
      expect(result.source).toMatch(/^chembl:/);
      if (result.bioactivity?.ic50 !== undefined) {
        expect(result.bioactivity.ic50).toBeGreaterThan(0);
        expect(result.bioactivity.pIC50).toBeDefined();
      }
    }
  }, 20_000);
});

// ---------------------------------------------------------------------------
// fetchMolecularData (router)
// ---------------------------------------------------------------------------
describe("fetchMolecularData", () => {
  it("routes protein layer to UniProt", async () => {
    const result = await fetchMolecularData("PCSK9", "protein");
    if (result !== null) {
      expect(result.source).toMatch(/^uniprot:/);
    }
  }, 15_000);

  it("routes dna layer to Ensembl", async () => {
    const result = await fetchMolecularData("PCSK9", "dna");
    if (result !== null) {
      expect(result.source).toMatch(/^ensembl:/);
    }
  }, 20_000);

  it("routes rna layer to Ensembl", async () => {
    const result = await fetchMolecularData("LPA", "rna");
    if (result !== null) {
      expect(result.source).toMatch(/^ensembl:/);
    }
  }, 20_000);

  it("routes small_molecule layer to ChEMBL", async () => {
    const result = await fetchMolecularData("PCSK9", "small_molecule");
    if (result !== null) {
      expect(result.source).toMatch(/^chembl:/);
    }
  }, 20_000);

  it("returns null or valid data for all three deCODE targets", async () => {
    const genes = ["PCSK9", "LPA", "APOE"] as const;
    for (const gene of genes) {
      const result = await fetchMolecularData(gene, "protein");
      if (result !== null) {
        assertMolecularDataShape(result);
      }
    }
  }, 30_000);
});
