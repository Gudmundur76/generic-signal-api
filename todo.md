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
- [ ] Create weekly heartbeat cron: manus-heartbeat create --name weekly-patent-alert --cron "0 0 6 * * 1" --path /api/scheduled/weeklyAlert --description "Monday 6 AM UTC weekly patent digest"
- [ ] Set CORS_ALLOWED_ORIGINS env var to *.lovable.app for production
