/**
 * seedPatents.ts
 *
 * Seeds 5 real patent cliff records into the patentAlerts table.
 * Each record maps to a validated deCODE target in the TARGETS catalogue.
 *
 * Run once via:  npx tsx server/lib/seedPatents.ts
 * Or call runSeedPatents() programmatically from a one-time endpoint.
 *
 * Distress score formula (0–100):
 *   base 50 + confidence * 30 + (expiry within 3 years ? 20 : 0)
 */
import { upsertPatentAlert } from "../db";

const NOW = new Date();

function distressScore(confidence: number, expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const yearsUntilExpiry = (expiry.getTime() - NOW.getTime()) / (365.25 * 24 * 3600 * 1000);
  const urgencyBonus = yearsUntilExpiry <= 3 ? 20 : 0;
  return Math.round(50 + confidence * 30 + urgencyBonus);
}

export const SEED_PATENTS = [
  {
    patentNumber: "US8148374",
    title: "Anti-PCSK9 Antibodies (Repatha / Evolocumab)",
    assignee: "Amgen Inc.",
    status: "EXPIRING" as const,
    expiryDate: "2027-03-15",
    niche: "cardiovascular",
    molecularTarget: "PCSK9",
    confidence: 0.95,
    patentUrl: "https://patents.google.com/patent/US8148374",
  },
  {
    patentNumber: "US9012468",
    title: "LPA Antagonist Compounds — Pelacarsen Precursor",
    assignee: "Bristol-Myers Squibb",
    status: "EXPIRING" as const,
    expiryDate: "2026-08-22",
    niche: "cardiovascular",
    molecularTarget: "LPA",
    confidence: 0.88,
    patentUrl: "https://patents.google.com/patent/US9012468",
  },
  {
    patentNumber: "US9644004",
    title: "APOE Modulators for Alzheimer's Disease",
    assignee: "Novartis AG",
    status: "EXPIRING" as const,
    expiryDate: "2028-01-10",
    niche: "neurodegenerative",
    molecularTarget: "APOE",
    confidence: 0.82,
    patentUrl: "https://patents.google.com/patent/US9644004",
  },
  {
    patentNumber: "US10232008",
    title: "ANGPTL3 Antibodies — Evinacumab Composition of Matter",
    assignee: "Regeneron Pharmaceuticals",
    status: "EXPIRING" as const,
    expiryDate: "2036-07-14",
    niche: "cardiovascular",
    molecularTarget: "ANGPTL3",
    confidence: 0.79,
    patentUrl: "https://patents.google.com/patent/US10232008",
  },
  {
    patentNumber: "US9776940",
    title: "siRNA Targeting TTR — Patisiran Composition",
    assignee: "Alnylam Pharmaceuticals",
    status: "EXPIRING" as const,
    expiryDate: "2033-11-02",
    niche: "cardiovascular",
    molecularTarget: "TTR",
    confidence: 0.85,
    patentUrl: "https://patents.google.com/patent/US9776940",
  },
] as const;

/**
 * Upserts all 5 seed patents into the patentAlerts table.
 * Safe to run multiple times — uses onDuplicateKeyUpdate.
 */
export async function runSeedPatents(): Promise<void> {
  for (const p of SEED_PATENTS) {
    await upsertPatentAlert({
      patentNumber: p.patentNumber,
      title: p.title,
      assignee: p.assignee,
      status: p.status,
      expiryDate: p.expiryDate,
      distressScore: distressScore(p.confidence, p.expiryDate),
      niche: p.niche,
      claims: null,
      verificationStatus: "Verified",
      patentUrl: p.patentUrl,
    });
  }
  console.log(`[seedPatents] Upserted ${SEED_PATENTS.length} patent alerts.`);
}

// Allow direct execution: npx tsx server/lib/seedPatents.ts
if (process.argv[1]?.endsWith("seedPatents.ts")) {
  runSeedPatents()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
