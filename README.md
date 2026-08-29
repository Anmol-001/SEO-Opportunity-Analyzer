# Searchlight — SEO Opportunity Analyzer

Searchlight turns a focused website scan, real search-result evidence, competitor patterns, and keyword signals into a prioritized SEO opportunity report.

This repository contains the **complete locally validated MVP pipeline**: a production-shaped Next.js application, PostgreSQL/Prisma schema, validated and throttled assessment flow, staged background processing, browser-scoped history, redirect-safe website scanning, robots/sitemap discovery, focused page extraction, deterministic query discovery, localized Serper searches, submitted-domain ranking detection, recurring-domain competitor classification, focused competitor-page comparison, evidence-backed keyword classification, weighted opportunity scoring, schema-constrained Gemini synthesis, isolated completion-webhook delivery, and a protected `after()` infrastructure probe. Optional keyword metrics remain a later enhancement.

## Stack

- Next.js App Router, TypeScript, and Tailwind CSS
- shadcn-style local UI primitives
- Zod input validation
- PostgreSQL on Neon through Prisma ORM
- Google Gemini structured JSON generation with deterministic fallback
- Next.js `after()` for the infrastructure proof and initial fixture pipeline

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Set `DATABASE_URL` to a Neon PostgreSQL connection string. Use `ANALYSIS_MODE="fixture"` while integrations are intentionally incomplete; use `live` only after `/api/health` reports the selected mode as ready.

4. Generate the Prisma client and apply the committed migration:

   ```powershell
   npm run db:generate
   npm run db:deploy
   ```

5. Start the application:

   ```powershell
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). The example report works without a database. Creating and persisting a new assessment requires `DATABASE_URL`.

## Useful checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`GET /api/health` reports which integrations are configured without exposing their values. It returns `503 configuration_required` until the currently selected mode passes its readiness checks.

## Production hardening

- `POST /api/analyze` accepts only bounded `application/json` request bodies and rejects malformed or oversized input before provider work begins.
- Submission throttling hashes the closest valid proxy address with `RATE_LIMIT_SALT`; production and live readiness require at least 32 non-placeholder characters.
- `ANALYSIS_MODE=live` runs the real scanner, Serper, competitor, scoring, Gemini, persistence, and webhook pipeline only when all required integrations, the trusted public origin, throttling salt, and any enabled smoke-test token are valid.
- `/api/health` is mode-aware and returns `503` when the selected mode is not ready.
- Assessment history stores only a bounded list of opaque assessment IDs in an HTTP-only, same-site browser cookie. It never lists other visitors' database records; direct report links remain intentionally shareable.
- All routes receive a content security policy, frame protection, MIME sniffing protection, a strict referrer policy, and a minimal permissions policy. Production responses also receive HSTS; assessment, history, and API responses are private, non-cacheable, and excluded from search indexing.

## Website scanner boundaries

- Revalidates HTTP(S), hostname, standard port, and every resolved address before each request and redirect.
- Rejects local, private, reserved, multicast, documentation, and internal network targets.
- Uses manual redirects with a five-hop limit, per-request timeouts, content-type checks, and strict response-size limits.
- Reads `robots.txt`, respects matching allow/disallow rules, and follows a bounded number of declared/default sitemaps.
- Selects at most five pages: homepage, primary service, location, service + location, and one additional relevant page when available.
- Extracts titles, descriptions, headings, main text, word count, internal links, image alt text, canonical URLs, robots directives, and valid JSON-LD.
- Persists scan warnings without inventing missing evidence. A website failure can remain a partial failure while later research stages continue.

## SERP research boundaries

- Builds a deterministic set of five to eight queries from user seeds, service, location, industry, and business goal.
- Preserves query clusters and intent labels rather than asking an LLM to invent search terms.
- Uses the server-only `SERPER_API_KEY` for localized Google searches with two-request concurrency and request timeouts.
- Stores normalized organic results, related searches, and detected SERP features in `SerpResult`.
- Detects exact-domain and subdomain visibility and stores the actual ranking URL/position on `Keyword`.
- Isolates individual query failures and continues with successful evidence.
- Explicitly records that search-volume, CPC, and paid-competition data are unavailable from Serper.

## Competitor research boundaries

- Aggregates recurring organic domains by distinct query presence and normalizes common country-code domain suffixes.
- Excludes the submitted domain and classifies known platforms, directories/marketplaces, publishers, direct competitors, and other results deterministically.
- Ranks candidates using frequency, best organic position, topical relevance, and a type weight.
- Selects no more than five direct competitors and inspects one ranking page per domain.
- Reuses the scanner's DNS/SSRF, redirect, timeout, content-type, and byte protections and checks each domain's robots rules before fetching its ranking page.
- Extracts content depth, FAQ presence, structured-data types, location/service coverage, and CTA signals.
- Compares competitor evidence with the submitted pages and persists observed strengths and gaps without treating blocked pages as successful evidence.

## Opportunity scoring boundaries

- Classifies each deterministic query as an existing or potential opportunity from observed ranking and submitted-page coverage.
- Assigns stable finding IDs and calculates keyword priority from business relevance, ranking opportunity, content gap, direct-competitor recurrence, and intent.
- Calculates the overall score with versioned weights: website readiness 20%, keyword opportunity 25%, current-ranking opportunity 20%, SERP opportunity 20%, and competitive gaps 15%.
- Persists component signals and rationales so the calculation remains auditable and repeatable.
- Leaves search volume, CPC, and paid-competition values null when the configured provider does not supply them.

## AI synthesis boundaries

- Sends Gemini a bounded packet containing business context, code-generated evidence statements, stable evidence IDs, and deterministic score components.
- Uses Gemini structured JSON mode and validates the response with Zod before report assembly.
- Keeps factual evidence, rankings, competitor fields, keyword metrics, classifications, and the opportunity score code-controlled.
- Rejects unknown or duplicate evidence references and narrative promises, percentages, currency forecasts, or guaranteed outcomes.
- Uses a business-specific deterministic report when the Gemini key is absent, the provider fails, or the output does not pass schema and evidence-policy validation.
- Never includes the Gemini key in the request URL or client-side code.

## Completion webhook boundaries

- Uses one server-configured `WEBHOOK_URL`; assessment input can never select a destination.
- Accepts only public HTTPS destinations on the standard port, reuses the DNS/private-address guard, and refuses redirects.
- Sends a minimal `seo_assessment.completed` payload after the report and completion state are persisted.
- Uses a stable delivery ID and idempotency header, with at most two attempts for network, rate-limit, timeout, and server failures.
- Persists skipped, pending, delivered, and failed outcomes in `WebhookEvent`; a webhook failure never changes a completed assessment to failed.
- Optionally signs `${timestamp}.${rawBody}` with HMAC-SHA256 when `WEBHOOK_SECRET` is configured and sends the result in `x-searchlight-signature`.

## Manual deployment proof

Deployment is intentionally left to the repository owner. Before connecting live providers:

1. Add the variables from `.env.example` to the Vercel project.
2. Set `NEXT_PUBLIC_APP_URL` to the trusted production origin.
3. Run the production migration with `npm run db:deploy`.
4. Set `ENABLE_INFRA_SMOKE=true` and choose a long random `SMOKE_TEST_TOKEN`.
5. Deploy, then call the protected smoke endpoint:

   ```powershell
   $headers = @{ "x-smoke-token" = "YOUR_TOKEN" }
   $probe = Invoke-RestMethod -Method Post -Uri "https://YOUR_DOMAIN/api/smoke/background" -Headers $headers
   $probe
   ```

6. Wait at least 12 seconds and verify persistence:

   ```powershell
   Invoke-RestMethod -Uri "https://YOUR_DOMAIN/api/smoke/background?id=$($probe.probeId)" -Headers $headers
   ```

The second response must show `status: "complete"` and a non-null `completedAt`. Disable the smoke route after the proof by setting `ENABLE_INFRA_SMOKE=false`.

## Current routes

- `/` — landing page
- `/assess` — validated assessment form
- `/assessment/demo` — representative structured report
- `/assessment/:id/processing` — live stage polling
- `/assessment/:id` — persisted report
- `/history` — assessments saved in the current browser
- `/api/health` — configuration readiness
- `/api/analyze` — assessment creation
- `/api/assessments/:id` — status and report retrieval
- `/api/smoke/background` — protected Vercel/Neon background proof

## Important limitations

- `fixture` mode performs and persists a real targeted website scan, live Serper research, focused competitor research, deterministic opportunity scoring, Gemini synthesis, and completion webhook delivery when the corresponding server-side configuration is present. Missing or invalid AI output produces a disclosed deterministic fallback, while a missing webhook records a skipped delivery.
- `live` mode is implemented and configuration-gated. The remaining release gate is the owner-run Vercel/Neon production proof described above.
- Authentication, billing, full crawling, backlinks, analytics integrations, rank tracking, scheduled scans, and PDF export remain out of scope for the MVP.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries, data policy, security baseline, and the planned live pipeline.
