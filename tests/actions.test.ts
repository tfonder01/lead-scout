import assert from "node:assert/strict";
import test from "node:test";
import { getInitialSearchResult, searchBusinesses } from "../app/actions.ts";

const QUERY = { industry: "Tree Service", location: "Orlando, FL" };

async function withProvider(
  provider: string,
  callback: () => Promise<void>,
): Promise<void> {
  const previousProvider = process.env.LEAD_SCOUT_PROVIDER;
  const previousKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.LEAD_SCOUT_PROVIDER = provider;
  delete process.env.GOOGLE_PLACES_API_KEY;

  try {
    await callback();
  } finally {
    if (previousProvider === undefined) delete process.env.LEAD_SCOUT_PROVIDER;
    else process.env.LEAD_SCOUT_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousKey;
  }
}

test("mock mode preserves the existing synthetic search flow", async () => {
  await withProvider("mock", async () => {
    const result = await searchBusinesses(QUERY);

    assert.equal(result.error, null);
    assert.equal(result.provider, "MOCK");
    assert.equal(result.businesses.length, 4);
    assert.equal(result.hasSearched, true);
    assert.equal(result.metrics.plannedRequests, 1);
    assert.equal(result.metrics.completedRequests, 1);
    assert.equal(result.metrics.uniqueResultCount, 4);
    assert.ok(result.businesses.every((business) => !("websiteEnrichment" in business)));
    assert.ok(result.businesses.every((business) => Array.isArray(business.websiteSignals)));
  });
});

test("Google mode does not spend a request before form submission", async () => {
  await withProvider("google", async () => {
    const result = await getInitialSearchResult(QUERY);

    assert.equal(result.error, null);
    assert.equal(result.provider, "GOOGLE_PLACES");
    assert.equal(result.businesses.length, 0);
    assert.equal(result.requestCount, 0);
    assert.equal(result.metrics.plannedRequests, 0);
    assert.equal(result.hasSearched, false);
  });
});

test("Google mode without a key returns a safe, useful server-action error", async () => {
  await withProvider("google", async () => {
    const result = await searchBusinesses(QUERY);

    assert.equal(result.error, "Google Places API key is not configured.");
    assert.equal(result.provider, "GOOGLE_PLACES");
    assert.equal(result.businesses.length, 0);
    assert.equal(result.requestCount, 0);
    assert.equal(result.metrics.failedRequests, 1);
    assert.equal(result.hasSearched, true);
  });
});

test("batch mode executes each normalized location and returns bounded metrics", async () => {
  await withProvider("mock", async () => {
    const result = await searchBusinesses({
      ...QUERY,
      mode: "batch",
      locations: "Orlando, FL\nWinter Park, FL",
    });

    assert.equal(result.error, null);
    assert.equal(result.metrics.plannedRequests, 2);
    assert.equal(result.metrics.rawResultCount, 4);
    assert.equal(result.metrics.uniqueResultCount, 4);
    assert.equal(result.businesses.length, 4);
    assert.ok(result.businesses.every((item) => item.matchedLocations?.length === 1));
  });
});

test("server-side batch validation rejects unconfirmed cost plans before provider execution", async () => {
  await withProvider("mock", async () => {
    const result = await searchBusinesses({
      ...QUERY,
      mode: "batch",
      locations: "A\nB\nC",
      queryVariants: "tree removal",
    });

    assert.match(result.error ?? "", /Confirm the 6-request batch/);
    assert.equal(result.metrics.plannedRequests, 0);
  });
});
