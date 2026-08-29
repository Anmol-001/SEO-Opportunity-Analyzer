# Searchlight — SEO Opportunity Analyzer

Searchlight turns a focused website scan, real search-result evidence, competitor patterns, and keyword signals into a prioritized SEO opportunity report.

This repository currently contains the **initial execution phase plus targeted website research**: a production-shaped Next.js application, PostgreSQL/Prisma schema, validated assessment flow, staged background processing, persistent report contract, history, redirect-safe website scanning, robots/sitemap discovery, focused page extraction, and a protected `after()` infrastructure probe. Live SEO provider calls, opportunity scoring, Gemini synthesis, and webhook delivery remain later phases.

## Stack

- Next.js App Router, TypeScript, and Tailwind CSS
- shadcn-style local UI primitives
- Zod input validation
- PostgreSQL on Neon through Prisma ORM
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

3. Set `DATABASE_URL` to a Neon PostgreSQL connection string. Keep `ANALYSIS_MODE="fixture"` during this initial phase.

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

`GET /api/health` reports which integrations are configured without exposing their values. A `503 configuration_required` response is expected until `DATABASE_URL` is set.

## Website scanner boundaries

- Revalidates HTTP(S), hostname, standard port, and every resolved address before each request and redirect.
- Rejects local, private, reserved, multicast, documentation, and internal network targets.
- Uses manual redirects with a five-hop limit, per-request timeouts, content-type checks, and strict response-size limits.
- Reads `robots.txt`, respects matching allow/disallow rules, and follows a bounded number of declared/default sitemaps.
- Selects at most five pages: homepage, primary service, location, service + location, and one additional relevant page when available.
- Extracts titles, descriptions, headings, main text, word count, internal links, image alt text, canonical URLs, robots directives, and valid JSON-LD.
- Persists scan warnings without inventing missing evidence. A website failure can remain a partial failure while later research stages continue.

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
- `/history` — saved assessments
- `/api/health` — configuration readiness
- `/api/analyze` — assessment creation
- `/api/assessments/:id` — status and report retrieval
- `/api/smoke/background` — protected Vercel/Neon background proof

## Important limitations

- `fixture` mode performs and persists a real targeted website scan, but the displayed report narrative remains representative fixture evidence and does not claim to come from a live SEO provider.
- `live` mode is intentionally rejected until the research pipeline is implemented.
- Authentication, billing, full crawling, backlinks, analytics integrations, rank tracking, scheduled scans, and PDF export remain out of scope for the MVP.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries, data policy, security baseline, and the planned live pipeline.
