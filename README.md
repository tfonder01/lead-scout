# Lead Scout

Lead Scout is an internal Next.js prospecting tool that searches one industry and one location, normalizes provider data, and applies deterministic lead-priority scoring. It does not write to the CRM.

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

Google response types stay inside the provider. Missing ratings, counts, phones, websites, and review dates remain unknown. Website status is `NONE` when no URL exists and `UNKNOWN` when one exists; website quality is not assessed in Phase 1.

## Lead scoring

Scores are clamped to 0–100. The current weights are:

- Base: +35
- Review recency when known (mock data only): within 14 days +20; within 30 +12; within 90 +4; 91–365 days -6; over 365 days -15
- Review count when known: 100+ +12; 25+ +8; 10+ +4; under 5 -12
- Rating when known: 4.7+ +12; 4.4+ +8; 4.0+ +3; 3.5–3.9 -5; below 3.5 -15
- Website: none +15; unreachable +12; weak +8; unknown +3; healthy -6
- Phone: present +8; missing -18
- Configured high-value category: +5
- Google business status: operational +5; temporarily closed -25; permanently closed -60
- Mock-only multi-signal inactivity condition: -20

Unknown rating, review count, review date, and operational status add no points and incur no penalty. Real Google results therefore never receive mock review-recency or fabricated activity signals.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
git diff --check
```
