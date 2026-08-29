# Searchlight architecture

Searchlight is an evidence-led SEO research workflow, not a general-purpose SEO platform. The initial codebase deliberately separates the working SaaS flow from the live research implementation so the product can be tested end to end before external provider logic is added.

## Current initial slice

```text
Landing
  → validated assessment form
  → POST /api/analyze
  → PostgreSQL Submission row
  → immediate 202 response
  → Next.js after() pipeline
  → redirect-safe targeted website scan
  → robots/sitemap discovery
  → 1–5 PageScan records
  → deterministic 5–8 query discovery
  → localized Serper collection
  → SerpResult + Keyword ranking evidence
  → recurring-domain competitor classification
  → up to five robots-aware competitor page checks
  → persisted Competitor strengths + gaps
  → staged processing screen
  → persisted structured report
  → report and history screens
```

`ANALYSIS_MODE=fixture` is an explicit incremental-delivery mode. It now performs a real, bounded website scan and live Serper research while exercising validation, persistence, background continuation, polling, report storage, and page routing. The report narrative is still representative fixture data and must not be mistaken for synthesized live recommendations.

The application refuses `ANALYSIS_MODE=live` for now. This is intentional: real mode should only be enabled after the website scanner, SEO provider adapter, opportunity engine, and Gemini synthesis have been implemented and verified.

## Core boundaries

### Route handlers

- `POST /api/analyze` validates and creates assessments, applies basic database-backed throttling, and dispatches post-response work.
- `GET /api/assessments/:id` is the polling and retrieval boundary.
- `GET /api/health` reports configuration presence without returning secret values.
- `POST /api/smoke/background` proves that a deployed response can return before a 10-second background task completes a Neon write. It is disabled unless explicitly enabled and token-protected.

### Persistence

Prisma models preserve raw evidence and synthesized output separately:

- `Submission`: business input, status, warnings, score, and assessment history.
- `SiteScan` / `PageScan`: targeted website evidence.
- `SerpResult`: organic results plus non-organic SERP characteristics.
- `Keyword`: metrics, ranking, deterministic signals, and opportunity classification.
- `Competitor`: recurring-domain evidence and competitor classification.
- `Report`: versioned structured report JSON.
- `WebhookEvent`: non-blocking delivery history.
- `InfrastructureProbe`: production background-execution proof.

### Provider abstraction

`src/lib/providers/seo-provider.ts` defines the internal SEO provider contract. The Serper adapter now implements localized SERP behavior and returns an explicit unavailable result for keyword metrics. DataForSEO remains the planned implementation for search volume, CPC, paid competition, and monthly trends. No provider is allowed to fabricate search volume.

### Query and SERP research

- Query discovery is deterministic and produces no more than eight queries.
- User-supplied keywords remain the first seeds; generated queries fill coverage gaps across core, commercial, pricing, informational, and local intent.
- Serper requests use a constant server-side endpoint, bounded concurrency, timeout handling, response-size limits, and normalized response parsing.
- One SERP summary row preserves features and related searches for each successful query; organic result rows preserve position, URL, domain, title, and snippet.
- Ranking detection accepts the submitted domain and its subdomains while rejecting lookalike suffixes.
- Bulk persistence keeps Neon writes inside a short database transaction.

### Competitor research

- Organic SERP domains are aggregated by the number of distinct queries in which they appear; the submitted domain is excluded.
- Deterministic domain lists separate known platforms, directories/marketplaces, and publishers before topical relevance is used to classify direct competitors.
- Candidate ordering combines recurring-query frequency, best position, service/industry term coverage, and domain type.
- At most five direct competitors are inspected, using only their strongest stored ranking URL.
- Competitor page requests reuse the scanner's SSRF and response limits, fetch robots rules first, and reject cross-domain final redirects.
- Page evidence records content depth, FAQ presence, structured data, location/service mentions, and CTA signals.
- Strengths and gaps are calculated from page evidence versus the submitted `PageScan` baseline and stored separately from later LLM interpretation.
- A blocked or unavailable competitor page creates a warning while successful competitor evidence remains usable.

### Evidence contract

The eventual live pipeline must preserve three layers:

1. Facts: values returned by scans and providers.
2. Inferences: deterministic classifications and evidence-based interpretation.
3. Recommendations: actions that reference finding IDs.

The LLM may explain collected and calculated evidence. It may not invent ranking positions, volumes, traffic, competitors, conversions, or guaranteed outcomes.

## Planned live pipeline

```text
validate + SSRF gate
  → targeted page scan
  → structured query discovery
  → location-aware SERP collection
  → submitted-domain ranking detection
  → recurring competitor classification
  → keyword metrics (optional, never invented)
  → deterministic opportunity scoring
  → schema-constrained Gemini synthesis
  → report persistence
  → non-blocking webhook delivery
```

Every external stage will return evidence plus warnings. A missing optional source, such as keyword volume, should downgrade report coverage rather than fail the assessment. Critical failure is reserved for cases where meaningful analysis is impossible.

## Security baseline

- Website inputs accept only HTTP(S) public hosts.
- Static hostname checks reject localhost, private/reserved IP ranges, and common internal suffixes.
- DNS resolution is checked before submission and repeated before every scanner request and redirect.
- Only standard HTTP(S) ports are accepted; redirects are manual and bounded.
- HTML, robots, and sitemap responses have independent time, type, and byte limits.
- Robots rules are respected for additional pages, and sitemap traversal has strict document and URL budgets.
- Webhook destinations remain server-configured.
- Provider and database credentials remain server-only.
- Submission throttling uses a salted request fingerprint stored in PostgreSQL.
- The infrastructure probe is disabled by default and protected by a constant-time token check.

## Production proof gate

Before implementing the complete research pipeline, deploy the current fixture slice manually and prove:

1. `POST /api/smoke/background` returns `202` immediately.
2. The probe begins in `queued` state.
3. A follow-up read after at least 12 seconds returns `complete` with `completedAt` set.
4. A normal fixture assessment progresses to `complete` and persists after the original response ends.

If either proof fails within the target hosting limits, simplify or move the processing boundary before adding the expensive research stages.
