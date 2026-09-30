# Lead Scout

Lead Scout is an internal Next.js prospecting tool that searches one industry and one location, normalizes provider data, inspects each supplied business landing page, and applies deterministic lead-priority scoring. The website classification is a sales-fit signal, not an objective measure of website or business quality. Lead Scout does not write to the CRM.

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

## Provider behavior

Each Google submission makes one bounded Text Search request with no pagination, city expansion, background polling, or retries. The request uses the query `<industry> in <location>` and includes pure service-area businesses.

The explicit field mask is:

```text
places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.primaryType,places.primaryTypeDisplayName,places.pureServiceAreaBusiness
```

Google response types stay inside the provider. Missing ratings, counts, phones, websites, and review dates remain unknown. Provider data is kept separate from the enrichment result before scoring.

## Website enrichment

After a Google Places search, Lead Scout inspects only the landing page URL supplied by the provider. It does not execute JavaScript, follow page links, crawl a site, fetch review or social pages, use browser automation, or send additional Google API requests. Raw HTML and low-level network failures remain server-side.

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
