# Generic Signal API — TODO

## Backend
- [x] Add subscribers table to drizzle/schema.ts (email, status, createdAt)
- [x] Run Drizzle migration and apply SQL
- [x] Add CORS middleware (origin: '*' dev, switchable for prod)
- [x] Add subscribe tRPC procedure (POST /api/trpc/subscribe)
- [x] Add alerts.latest tRPC procedure (GET /api/trpc/alerts.latest)
- [x] Add alerts.trigger tRPC procedure (POST /api/trpc/alerts.trigger, admin-only)
- [x] Add DB helpers for subscribers in server/db.ts
- [x] Wire weekly scheduled job handler at /api/scheduled/weeklyAlert
- [x] Send Manus notification emails to all active subscribers on cycle complete

## Frontend
- [x] Set up International Typographic Style (white/red/black, grid, fonts)
- [x] Hero section: exact headline "Know Which Drug Patents Expire Before Your Competitors"
- [x] Problem statement section
- [x] How-it-works cards (3 cards)
- [x] Sample alerts section fetching from alerts.latest
- [x] Pricing section: Free tier + $99/mo Pro tier with feature comparison
- [x] Email capture CTA wired to subscribe endpoint
- [x] Footer

## Tests
- [x] Test subscribe procedure (invalid email rejected)
- [x] Test alerts.latest procedure (3 alerts, correct shape)
- [x] Test alerts.trigger admin guard (FORBIDDEN for non-admin)
- [x] Test formatWeeklyAlert output (patent numbers, assignees, scores, CTA)
- [x] Test SAMPLE_ALERTS shape (required fields, niche, distress scores)

## Post-Deploy (requires Publish first)
- [x] Create weekly heartbeat cron: task_uid=5netoUaHTKGvWqsSdmExoJ (Monday 6 AM UTC)
- [x] Set CORS_ALLOWED_ORIGINS env var to *.lovable.app for production (ready to configure via webdev_request_secrets)

## Molecular Design (Evolva) — Sprint 2

- [x] server/routers/design.ts — 5 tRPC procedures (evolve, getTargets, getProgress, getResults, getVerification)
- [x] In-memory run store with simulated evolution loop
- [x] Mount designRouter in server/routers.ts
- [x] client/src/pages/Design.tsx — /design target cards listing page
- [x] client/src/pages/DesignTarget.tsx — /design/:target detail + progress + results
- [x] Register /design and /design/:target routes in App.tsx
- [x] "Order Synthesis" button linking to GenScript cart with pre-filled sequence
- [x] Evidence trail expandable L1-L5 per claim
- [x] Vitest tests for design router
- [x] Checkpoint saved

## Copy Updates — Sprint 3
- [x] Add EVOLVA nav link to homepage nav bar
- [x] Add "RUN MOLECULAR DESIGN →" second CTA button in hero
- [x] Add Generic Signal wordmark + back-link to /design page nav
- [x] Checkpoint saved
## Partner Portal & Royalty Dashboard — Sprint 4
- [x] Fix cognitive-loop-framework package.json exports (add import/default conditions)
- [x] Fix insertId extraction from drizzle mysql2 insert result (result[0].insertId)
- [x] Register mutation auto-delivers first candidate on signup via selectFirstCandidate
- [x] buildCandidatePackage maps deCODE targets to CandidatePackage with quality gate
- [x] toCLFArea maps hematology → oncology (and other portal areas to CLF areas)
- [x] PartnerPortal.tsx success step shows first candidate gene + area
- [x] Add "Partner Network" nav link to Home.tsx nav bar
- [x] PartnerPortal.tsx: full registration form with tier selection + agreement
- [x] RoyaltyDashboard.tsx: overview/partners/deliveries/royalties tabs
- [x] RoyaltyDashboard.tsx: record royalty form (admin only)
- [x] server/partners.test.ts: 15 vitest tests for CLF integration + selectFirstCandidate
- [x] All 42 tests passing (partners + alerts + design + auth)

## Deployment Fix & Next Steps

- [x] Inline cognitive-loop-framework into server/lib/clf/ to fix production ERR_MODULE_NOT_FOUND
- [x] Owner notification (notifyOwner) on partner signup with full candidate details
- [x] Duplicate-email guard: toast with "Go to dashboard" action button
- [x] Admin listDeliveries query (protectedProcedure)
- [x] Deliveries tab: live table with gene, area, FTO, scores, partner ID, sent date
- [x] Inline status dropdown per row — updates status and increments positiveValidations counter
- [x] Status filter dropdown (all / sent / opened / validated_positive / etc.)

## Stub / Placeholder Fixes — Sprint 5

- [x] scheduledJobs.ts handleWeeklyReport — wired to real weeklyAlertHandler() (was logging only)
- [x] scheduledJobs.ts handlePatentScan — wired to real patent scan loop with DB upsert (was logging only)
- [x] design.ts buildLegacyVerification — replaced fake decode:*_pQTL_001 IDs with real PubMed PMIDs, PDB accessions, and ClinicalTrials NCT IDs per target (PCSK9/LPA/APOE)
- [x] design.ts advanceRun — patent field now reads real Notus FTO status (CLEAR/BLOCKED) before falling back to generation heuristic
- [x] DesignTarget.tsx LayerCard — now renders AlphaFold structureUrl link and IC50/pIC50 bioactivity badge from meta field
- [x] RoyaltyDashboard.tsx — added 5th "alerts" admin tab with full patent cliff ingest form (wired to alerts.ingest mutation)
- [x] drizzle/schema.ts — removed leftover "// TODO: Add your tables here" template comment
- [x] server/routers.ts — removed leftover "// TODO: add feature routers here" template block
- [x] All 74 tests passing (9 test files, 2 skipped)

## TARGETS Expansion & Patent Seed — Sprint 6

- [x] Add ANGPTL3, CETP, HMGCR, APOC3, TTR to TARGETS array in design.ts (8 total)
- [x] Add TARGET_EVIDENCE entries for all 5 new genes with real PMIDs, PDB IDs, NCT IDs
- [x] Update evolve input z.enum to accept all 8 targets
- [x] Create server/lib/seedPatents.ts with 5 real patent cliff records
- [x] Run seed and verify 5 rows in patentAlerts table
- [x] Test: TARGETS.length === 8
- [x] Test: TARGET_EVIDENCE has all 8 entries with non-empty PMIDs, PDBs, NCTs
- [x] Test: patentAlerts table has 5 rows after seed
- [x] Test: getRecentAlerts() returns 5 alerts
- [x] 0 TypeScript errors

## Evo 2 Biological Plausibility Scoring — Sprint 7

- [x] Create server/lib/evo2Scorer.ts with scoreBiologicalPlausibility()
- [x] Add NVIDIA_NIM_API_KEY secret via webdev_request_secrets (pending user key)
- [x] Wire Evo 2 check into qualityGate.ts (DNA layer only, 15% composite weight)
- [x] Test 1: scoreBiologicalPlausibility("ATGCGATCGATCG") returns plausibility in [0,1]
- [x] Test 2: scoreBiologicalPlausibility("XYZ123") returns null (invalid DNA)
- [x] Test 3: DNA candidate + low Evo 2 score → quality gate fails
- [x] Test 4: DNA candidate + high Evo 2 score → quality gate passes
- [x] Test 5: Protein candidate → skips Evo 2 check (DNA layer only)
- [x] Test 6: API 503 → returns null, gate continues (non-blocking)
- [x] 0 TypeScript errors, all 94 tests pass (11 test files, 2 skipped)

## Auto-Delivery Approval Gate — Sprint 8

- [x] Add AUTO_DELIVERY_CONFIG to shared/const.ts
- [x] Create server/lib/autoDelivery.ts with gate logic (auto-deliver, approval-required, hard limits)
- [x] Wire autoDelivery gate into partners.ts register mutation
- [x] Send owner notification email for novelTarget and compositeBelow85 approval cases
- [x] Test: auto-delivers known gene with score >= 85 and confidence >= 0.80
- [x] Test: blocks delivery for novel gene and sends owner notification
- [x] Test: blocks delivery when compositeScore < 85 and sends owner notification
- [x] Test: enforces maxDeliveriesPerRun: 3 hard limit
- [x] Test: blocks delivery when confidence < 0.80
- [x] 0 TypeScript errors, 100 tests passing (12 test files, 2 skipped)

## Autonomous Distribution Loop — Sprint 9

- [x] Add distributionEvents table to drizzle/schema.ts
- [x] Add approvalRequests table to drizzle/schema.ts
- [x] Generate migration SQL and apply via webdev_execute_sql
- [x] Create server/lib/autonomousLoop.ts (7-step loop, adapted to Drizzle)
- [x] Create server/config/autonomousDistribution.ts (re-export config)
- [x] Add tRPC router: autonomous.run, autonomous.approvals, autonomous.approve, autonomous.reject
- [x] Wire heartbeat cron (every 6 hours) to runAutonomousDistributionLoop
- [x] Add Autonomous Loop admin panel to RoyaltyDashboard (status, stats, approvals table, manual trigger, recent events)
- [x] Test 1: evaluateSignal PCSK9 confidence 0.90 → auto-approved
- [x] Test 2: evaluateSignal UNKNOWN99 confidence 0.90 → requires approval
- [x] Test 3: evaluateSignal PCSK9 confidence 0.50 → should not act
- [x] Test 4: generateSeedForGene returns 20nt DNA string
- [x] Test 5: getLayerForGene PCSK9 → dna; ANGPTL3 → protein
- [x] Test 6: getTherapeuticArea PCSK9 → cardiovascular
- [x] Test 7: runAutonomousDistributionLoop with mock signals → correct LoopResult counts
- [x] Test 8: createApprovalRequest + getPendingApprovals + approveRequest full flow
- [x] 0 TypeScript errors, 113 tests passing (13 test files, 2 skipped)

## Patent Clear Path Assessment — Sprint 10

- [x] Extend fetchChEMBLBioactivity to also return canonicalSmiles
- [x] Add fetchChEMBLSimilarity(smiles, threshold) using ChEMBL similarity search endpoint
- [x] Create server/lib/broadClaimFamilies.ts with BROAD_CLAIM_FAMILIES registry per therapeutic area
- [x] Add design.getPatentClearance tRPC procedure (per-layer verdict: ftoStatus, blockingPatents, similarKnownCompounds, broadClaimRisk, patentClearScore, recommendation)
- [x] Add Patent Clearance tab to DesignTarget.tsx (traffic-light badge, blocking patents table, similar compounds, broad-claim warning)
- [x] Test 1: fetchChEMBLBioactivity returns canonicalSmiles for PCSK9
- [x] Test 2: fetchChEMBLSimilarity returns array of similar compounds or empty array on no match
- [x] Test 3: getPatentClearance returns verdict for each layer in a run
- [x] Test 4: CLEAR ftoStatus + no broad-claim risk → recommendation is "proceed"
- [x] Test 5: BLOCKED ftoStatus → recommendation is "do not file"
- [x] Test 6: broad-claim family match → recommendation is "fto-analysis-required"
- [x] 0 TypeScript errors, 126 tests passing (14 test files, 2 skipped)
