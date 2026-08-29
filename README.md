# Searchlight — SEO Opportunity Analyzer

Searchlight turns a focused website scan, real search-result evidence, competitor patterns, and keyword signals into a prioritized SEO opportunity report.

This repository currently contains the **initial execution phase**: a production-shaped Next.js application, PostgreSQL/Prisma schema, validated assessment flow, staged background-processing fixture, persistent report contract, history, SSRF safeguards, and a protected `after()` infrastructure probe. Live website research, SEO provider calls, opportunity scoring, Gemini synthesis, and webhook delivery are the next implementation phase.

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

- `fixture` mode uses representative report evidence only; it does not claim to have queried the submitted website or a live SEO provider.
- `live` mode is intentionally rejected until the research pipeline is implemented.
- Authentication, billing, full crawling, backlinks, analytics integrations, rank tracking, scheduled scans, and PDF export remain out of scope for the MVP.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries, data policy, security baseline, and the planned live pipeline.
