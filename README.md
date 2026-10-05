# Lead Scout

Lead Scout is an internal Next.js prospecting tool that searches one or more explicit industry/location combinations, normalizes and deduplicates provider data, inspects each unique business landing page, and applies deterministic lead-priority scoring. The website classification is a sales-fit signal, not an objective measure of website or business quality. Lead Scout helps prioritize prospects and can add one selected Google Places prospect to SentryPoint Leads; it does not objectively rate business quality.

## Setup

Install dependencies and copy `.env.example` to `.env.local`.

Mock mode is the safe default and requires no external credentials:

```dotenv
LEAD_SCOUT_PROVIDER=mock
```

To use Google Places API (New), enable Places API (New) for the Google Cloud project, restrict the API key appropriately, and configure these server-only values:

```dotenv
LEAD_SCOUT_PROVIDER=google
GOOGLE_PLACES_API_KEY=
```

Never prefix the key with `NEXT_PUBLIC_`. The application sends it only from the server to `POST https://places.googleapis.com/v1/places:searchText`. Switch `LEAD_SCOUT_PROVIDER` back to `mock` for offline development.

Run the development server:

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Search modes and request planning

Single Search preserves the original workflow: one industry or query, one location, and one provider request.

Batch Search accepts a newline-delimited location list and a small optional list of related queries. The primary industry/query is always included. Values are trimmed, whitespace-normalized, and deduplicated case-insensitively before the plan is calculated. A single comma-delimited location line is also supported, including common `City, ST` pairs; one location per line is preferred because it is unambiguous.

The request formula is:

```text
unique locations × unique query variants = planned provider requests
```

Cost and volume controls are enforced again on the server, not only in the UI:

- At most 8 unique locations.
- At most 4 unique query variants, including the primary query.
- At most 12 provider requests in one batch.
- Batches with 5–12 requests require explicit user confirmation.
- At most 3 provider searches run concurrently.
- No locations or query variants are inferred or added silently.
- No pagination, Places Details calls, retries, or background requests are performed.

The UI previews the normalized location, query, and request counts before execution. Per-run metrics include planned, completed, and failed searches; raw and unique result counts; and duration. In Google mode, the client also keeps a non-persistent count of Google requests made during the current browser session. Lead Scout does not estimate dollar cost because no rate is configured in this repository.

## Provider behavior

Each Google plan item makes exactly one bounded Text Search request. The request uses the query `<industry or variant> in <location>` and includes pure service-area businesses. Google calls use the existing 8-second timeout and run with at most 3 calls in flight. One failed item does not discard successful results; the response reports a concise partial-results warning and safe counts. If every request fails, the normal unavailable state is returned. Raw upstream error bodies, stack traces, and API keys are not returned or logged.

The explicit field mask is:

```text
places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.primaryType,places.primaryTypeDisplayName,places.pureServiceAreaBusiness
```

Google response types stay inside the provider. Missing ratings, counts, phones, websites, and review dates remain unknown. Provider data is kept separate from the enrichment result before scoring.

## Deduplication and result limits

Businesses are deduplicated before website enrichment. The primary key is the provider plus `sourceBusinessId` (Google Place ID). If a provider unexpectedly supplies no ID, Lead Scout uses normalized business name plus public phone only when both values exist; name-only matches are deliberately not merged. The result records whether this conservative fallback was used.

Duplicate matches merge the locations and queries that found the business, along with missing provider fields when a later copy has them. Provenance is shown compactly on the result card. Match count and provenance do not affect the lead score.

After deduplication and one enrichment per unique business, Lead Scout applies the unchanged Phase 2 score, ranks deterministically, and returns only the selected Top 10, Top 25 (default), or Top 50. Filters and sorting operate on that bounded result set. Raw matches and duplicate businesses are not double-counted as unique businesses.

## Website enrichment

After provider results are deduplicated, Lead Scout inspects only the landing page URL supplied for each unique business. It does not execute JavaScript, follow page links, crawl a site, fetch review or social pages, use browser automation, or send additional Google API requests. Raw HTML and low-level network failures remain server-side.

## SentryPoint Leads integration

Each Google Places result can be added individually through the Lead Scout server. The browser never receives the integration credential and never calls the CRM backend directly. Configure these server-only values in `.env.local`:

```bash
SENTRYPOINT_API_BASE_URL=http://localhost:8081
SENTRYPOINT_CRM_BASE_URL=http://localhost:3000
LEAD_SCOUT_API_TOKEN=use-the-same-dedicated-value-as-the-backend
```

The backend must configure the matching `LEAD_SCOUT_API_TOKEN`. The API base must be an HTTP(S) origin without a path; the optional CRM base creates the **Open lead** link. Missing or invalid configuration fails closed.

The integration sends only the normalized result fields needed for the lead. It creates a `NEW` lead with source `Lead Scout`; score 85–100 maps to `HIGH`, 65–84 to `MEDIUM`, and lower scores to `LOW`. Website, location, score, website status, matched search context, and the Google listing URL are preserved as concise working notes. No follow-up date, outreach, email, SMS, background sync, or bulk action is triggered.

Duplicate matching is conservative and ordered: exact provider/source ID, normalized phone, normalized website, then exact normalized business name plus address. Existing records are returned without being overwritten. The backend’s provider/source unique index makes repeated or concurrent requests for the same Google Place idempotent.

The deterministic classifications are:

- `NONE`: Google supplied no website URL, so no request was made.
- `HEALTHY`: the landing page returned HTML over final HTTPS and had a title, meaningful text, a mobile viewport, no obvious placeholder or broken-page marker, and at least one basic contact/conversion signal.
- `WEAK`: the HTML landing page had a concrete opportunity signal such as HTTP-only delivery, a missing title or viewport, thin content, no contact/conversion signal, or an obvious placeholder/broken-page marker.
- `UNREACHABLE`: the request timed out, failed at the network/TLS layer, exceeded the redirect limit, or returned a clearly unusable response such as not-found or server-error HTML.
- `UNKNOWN`: inspection was intentionally refused or could not support a responsible classification, including a blocked destination, access-denied/rate-limited response, oversized body, or non-HTML response.

These rules evaluate a few reliable technical and conversion signals. They do not judge visual design, brand quality, accessibility conformance, SEO quality, or the business itself.

### Safety and performance controls

- Only HTTP and HTTPS URLs without embedded credentials are accepted.
- The initial hostname and every redirect are resolved and checked. Loopback, private, link-local, multicast, reserved/documentation, local/internal, and cloud-metadata destinations are refused.
- The HTTP connection is pinned to the validated DNS address while preserving the intended HTTP Host and TLS server name.
- Redirects are handled manually and capped at 3.
- The total DNS, redirect, response-header, and body deadline is 7 seconds per website.
- Response bodies are capped at 512 KiB and only HTML/XHTML content types are inspected.
- At most 5 websites are inspected concurrently; requests are not retried.
- Logs contain aggregate counts, status totals, and duration only—not URLs, response bodies, secrets, or extracted content.

Known limitations: JavaScript-rendered content is not visible to the classifier; unusual HTML can produce an inconclusive or conservative result; a single landing page cannot represent an entire site; and a technically healthy page may still be a strong sales prospect for reasons outside these signals. DNS and outbound-network behavior also depends on the deployment environment.

Batch search has additional known limitations: locations and query variants must be entered explicitly; there is no radius/map expansion, automatic synonym generation, pagination, Places Details enrichment, persistence, background scheduling, billing analytics, or CRM integration. Session request accounting resets when the page reloads.

## Lead scoring

Scores are clamped to 0–100 and prioritize SentryPoint sales opportunity rather than general business quality. Website opportunity intentionally outweighs large review-count differences. The current weights are:

- Base: +30
- Review recency when known (mock data only): within 14 days +10; within 30 +6; within 90 +2; 91–365 days -3; over 365 days -8
- Review count when known: 100+ +8; 25+ +7; 10+ +4; under 5 -8. Counts above 100 receive no additional weight.
- Rating when known: 4.7+ +8; 4.4+ +6; 4.0+ +3; 3.5–3.9 -4; below 3.5 -12
- Website opportunity: none +30; unreachable +25; weak +25; unknown +0; healthy -20
- Phone: present +10; missing -20
- Configured high-value category: +4
- Google business status: operational +6; temporarily closed -30; permanently closed -70
- Mock-only multi-signal inactivity condition: -15

Unknown rating, review count, review date, and operational status add no points and incur no penalty. Real Google results therefore never receive mock review-recency or fabricated activity signals.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
pnpm exec tsc --noEmit
git diff --check
```
