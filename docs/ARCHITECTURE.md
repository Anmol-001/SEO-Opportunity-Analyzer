# Searchlight architecture

Searchlight is an evidence-led SEO research workflow, not a general-purpose SEO platform. The codebase separates external evidence collection, deterministic scoring, AI interpretation, persistence, and delivery so each boundary can fail safely and be tested independently.

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
  → deterministic keyword classification + priority signals
  → versioned weighted opportunity score
  → bounded evidence packet
  → schema-constrained Gemini synthesis or deterministic fallback
  → report + completed assessment persistence
  → isolated completion webhook attempt
  → staged processing screen
  → report and history screens
```

`ANALYSIS_MODE=fixture` is an explicit partial-configuration mode. It performs the same real, bounded website scan, live Serper and competitor research, deterministic opportunity scoring, and evidence-bound Gemini synthesis while allowing optional integrations to be absent. When Gemini is unavailable or its output is rejected, the assessment completes with a disclosed deterministic report rather than unrelated fixture content.

`ANALYSIS_MODE=live` uses the same pipeline but is rejected unless the database, Gemini, a SERP provider, webhook, trusted public origin, rate-limit salt, and any enabled smoke-test token pass runtime readiness. The only remaining release gate is the owner-run production proof.

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

### Deterministic opportunity scoring

- Keyword finding IDs are stable for the same alphabetically normalized query set (`K001`, `K002`, and so on).
- Existing opportunities require a submitted-domain ranking or strong relevant on-site coverage; the remaining queries are potential opportunities.
- Per-keyword priority combines business relevance (30%), ranking opportunity (25%), content gap (20%), direct-competitor evidence (15%), and intent (10%).
- The overall formula is versioned and combines website readiness (20%), keyword opportunity (25%), current-ranking opportunity (20%), SERP opportunity (20%), and competitive gaps (15%).
- Each keyword stores its coverage, relevance, priority, classification, component signals, and a deterministic rationale.
- Provider metrics remain optional: unavailable volume, CPC, and paid-competition values stay null and are explicitly disclosed in the report contract.

### AI synthesis

- The synthesis packet is bounded to five website observations, eight SERP/query observations, five direct competitors, and the versioned score components.
- Scanned titles and headings are treated as untrusted data inside the prompt; they cannot change the system instruction.
- Gemini returns only interpretations, selected evidence IDs, recommendations, and execution steps through a constrained JSON schema.
- Zod validates the structural response. A second policy pass validates evidence existence, uniqueness, recommendation references, and unsupported claims.
- Displayed evidence statements and all provider/deterministic values are assembled by application code rather than copied from model prose.
- Provider calls use a constant server-side origin, API-key header, validated model name, timeout, output-token cap, and streamed response-size limit.
- Missing configuration, provider errors, malformed output, and policy violations are isolated as warnings and produce a conservative deterministic fallback.
- Persisted report schema version `1.1` records whether synthesis used Gemini or the fallback and identifies the model when applicable.

### Completion webhook

- `WEBHOOK_URL` is server configuration and is never accepted from assessment input.
- The destination must be public HTTPS on port 443, pass hostname and DNS checks, and return directly without a redirect.
- The payload contains only event name, assessment ID, business name, website, completed status, deterministic score, and completion timestamp.
- Each delivery is stored before the request. Transient network, timeout, 408, 425, 429, and 5xx failures receive one bounded retry; other responses are terminal.
- `idempotency-key` and `x-searchlight-delivery` identify a persisted event, and an already delivered completion event is not emitted again.
- `WEBHOOK_SECRET` optionally adds an HMAC-SHA256 `x-searchlight-signature` over `${timestamp}.${rawBody}`.
- Response bodies are discarded, destination paths are not stored, and error messages are sanitized.
- Missing configuration persists a `skipped` event. Invalid configuration or exhausted delivery persists `failed`; neither outcome changes the assessment's completed state.

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
  → deterministic opportunity scoring (implemented)
  → schema-constrained Gemini synthesis (implemented)
  → report persistence
  → isolated webhook delivery (implemented)
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
- Assessment requests require bounded JSON bodies, and rate-limit reset responses describe the actual remaining window.
- Production and live readiness reject weak placeholder throttling salts and unsafe public origins.
- Browser history is scoped to opaque assessment IDs in an HTTP-only same-site cookie rather than a global submission listing.
- Application responses set CSP, frame, MIME, referrer, permissions, and production transport-security headers.
- The infrastructure probe is disabled by default and protected by a constant-time token check.

## Production proof gate

Before declaring the release production-ready, deploy manually and prove:

1. `POST /api/smoke/background` returns `202` immediately.
2. The probe begins in `queued` state.
3. A follow-up read after at least 12 seconds returns `complete` with `completedAt` set.
4. A normal fixture assessment progresses to `complete` and persists after the original response ends.

If either proof fails within the target hosting limits, simplify or move the processing boundary before adding the expensive research stages.
