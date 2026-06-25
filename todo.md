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
