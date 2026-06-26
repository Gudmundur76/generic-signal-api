/**
 * ResistAgent — HIV Protease Inhibitor Resistance Mutation Panel
 *
 * Based on the 37 HIV site liabilities from the Jun 16 2025 bioRxiv paper
 * (Resistance landscape of HIV-1 protease inhibitors against clinical variants)
 * and the Stanford HIV Drug Resistance Database (hivdb.stanford.edu).
 *
 * Scores a candidate's resistance profile against key PI-resistance mutations.
 * A compound maintaining pIC50 > 7.0 across V82A, I84V, and L90M is considered
 * resistance-robust and significantly more patentable.
 */

export interface ResistanceMutation {
  position: number;
  wildType: string;
  mutant: string;
  code: string; // e.g. "V82A"
  clinicalFrequency: "high" | "medium" | "low";
  foldResistance: Record<string, number>; // drug → typical fold-resistance
  mechanismNote: string;
}

export interface ResistanceScore {
  mutation: string;
  predictedPIC50: number; // estimated pIC50 against this mutant
  foldChange: number; // relative to wild-type
  passes: boolean; // pIC50 > 7.0 threshold
  clinicalFrequency: "high" | "medium" | "low";
}

export interface ResistanceProfile {
  wildTypePIC50: number;
  scores: ResistanceScore[];
  overallPass: boolean; // all high-frequency mutations pass
  robustnessScore: number; // 0–1, fraction of mutations that pass
  recommendation: "resistance-robust" | "partial-resistance" | "resistance-sensitive";
}

// ---------------------------------------------------------------------------
// Key PI resistance mutations (Stanford HIVDB + Jun 2025 bioRxiv panel)
// ---------------------------------------------------------------------------

export const RESISTANCE_MUTATIONS: ResistanceMutation[] = [
  {
    position: 82,
    wildType: "V",
    mutant: "A",
    code: "V82A",
    clinicalFrequency: "high",
    foldResistance: { darunavir: 1.5, lopinavir: 8.0, indinavir: 12.0, ritonavir: 5.0 },
    mechanismNote: "Reduces hydrophobic contact at S1/S1' subsites; primary resistance mutation for lopinavir/ritonavir",
  },
  {
    position: 84,
    wildType: "I",
    mutant: "V",
    code: "I84V",
    clinicalFrequency: "high",
    foldResistance: { darunavir: 2.5, lopinavir: 5.0, amprenavir: 8.0, atazanavir: 4.0 },
    mechanismNote: "Removes methyl group at S1/S3 subsite; broad resistance across most approved PIs",
  },
  {
    position: 90,
    wildType: "L",
    mutant: "M",
    code: "L90M",
    clinicalFrequency: "high",
    foldResistance: { darunavir: 1.2, saquinavir: 6.0, nelfinavir: 4.0, lopinavir: 2.5 },
    mechanismNote: "Distal mutation affecting overall protease conformation; reduces binding affinity broadly",
  },
  {
    position: 50,
    wildType: "I",
    mutant: "V",
    code: "I50V",
    clinicalFrequency: "medium",
    foldResistance: { darunavir: 4.0, amprenavir: 15.0, lopinavir: 3.0 },
    mechanismNote: "Primary resistance mutation for amprenavir/fosamprenavir; affects P2 subsite",
  },
  {
    position: 54,
    wildType: "I",
    mutant: "M",
    code: "I54M",
    clinicalFrequency: "medium",
    foldResistance: { darunavir: 2.0, lopinavir: 4.0, tipranavir: 3.0 },
    mechanismNote: "Flap region mutation; reduces van der Waals contacts with inhibitor P1 group",
  },
  {
    position: 76,
    wildType: "L",
    mutant: "V",
    code: "L76V",
    clinicalFrequency: "medium",
    foldResistance: { darunavir: 1.8, lopinavir: 6.0, indinavir: 4.0 },
    mechanismNote: "Reduces hydrophobic packing in the S2 subsite; often co-selected with V82A",
  },
  {
    position: 47,
    wildType: "V",
    mutant: "A",
    code: "V47A",
    clinicalFrequency: "low",
    foldResistance: { lopinavir: 12.0, darunavir: 2.0 },
    mechanismNote: "Flap region mutation; primarily lopinavir-specific resistance",
  },
  {
    position: 32,
    wildType: "V",
    mutant: "I",
    code: "V32I",
    clinicalFrequency: "low",
    foldResistance: { darunavir: 3.0, lopinavir: 2.5, amprenavir: 4.0 },
    mechanismNote: "Active site mutation; reduces S2 subsite volume, affects P2 group binding",
  },
  {
    position: 33,
    wildType: "L",
    mutant: "F",
    code: "L33F",
    clinicalFrequency: "low",
    foldResistance: { darunavir: 1.5, lopinavir: 2.0, amprenavir: 3.0 },
    mechanismNote: "Accessory mutation; typically co-occurs with I84V or V82A",
  },
  {
    position: 10,
    wildType: "L",
    mutant: "I",
    code: "L10I",
    clinicalFrequency: "low",
    foldResistance: { darunavir: 1.2, lopinavir: 1.5, indinavir: 2.0 },
    mechanismNote: "Minor accessory mutation; rarely causes resistance alone but contributes in combinations",
  },
];

// ---------------------------------------------------------------------------
// Score a candidate's resistance profile
// pIC50 is the wild-type in-silico pIC50 from the design run
// Fold resistance is applied per mutation to estimate mutant pIC50
// ---------------------------------------------------------------------------

export function scoreResistanceProfile(
  wildTypePIC50: number,
  referenceCompound: "darunavir" | "lopinavir" | "amprenavir" | "generic" = "generic"
): ResistanceProfile {
  const scores: ResistanceScore[] = RESISTANCE_MUTATIONS.map((m) => {
    // Get fold resistance for the reference compound, or use geometric mean of all
    let foldResistance: number;
    if (referenceCompound === "generic") {
      const values = Object.values(m.foldResistance);
      foldResistance = values.reduce((a, b) => a * b, 1) ** (1 / values.length);
    } else {
      foldResistance = m.foldResistance[referenceCompound] ?? 2.0;
    }

    // Predicted mutant pIC50 = wildType pIC50 - log10(foldResistance)
    const predictedPIC50 = wildTypePIC50 - Math.log10(foldResistance);

    return {
      mutation: m.code,
      predictedPIC50: Math.round(predictedPIC50 * 1000) / 1000,
      foldChange: Math.round(foldResistance * 100) / 100,
      passes: predictedPIC50 >= 7.0,
      clinicalFrequency: m.clinicalFrequency,
    };
  });

  const highFreqScores = scores.filter((s) => s.clinicalFrequency === "high");
  const overallPass = highFreqScores.every((s) => s.passes);
  const robustnessScore = scores.filter((s) => s.passes).length / scores.length;

  let recommendation: ResistanceProfile["recommendation"];
  if (overallPass && robustnessScore >= 0.8) {
    recommendation = "resistance-robust";
  } else if (robustnessScore >= 0.5) {
    recommendation = "partial-resistance";
  } else {
    recommendation = "resistance-sensitive";
  }

  return {
    wildTypePIC50,
    scores,
    overallPass,
    robustnessScore: Math.round(robustnessScore * 1000) / 1000,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Helper: get the three key mutations for a quick summary
// ---------------------------------------------------------------------------

export function getKeyMutationSummary(profile: ResistanceProfile): {
  V82A: ResistanceScore;
  I84V: ResistanceScore;
  L90M: ResistanceScore;
} {
  const find = (code: string) =>
    profile.scores.find((s) => s.mutation === code) as ResistanceScore;
  return { V82A: find("V82A"), I84V: find("I84V"), L90M: find("L90M") };
}
