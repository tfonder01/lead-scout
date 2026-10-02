import assert from "node:assert/strict";
import test from "node:test";
import { enrichBusinessWebsites } from "../lib/enrichment/website-enrichment.ts";
import { calculateLeadScore } from "../lib/scoring/lead-score.ts";
import {
  BATCH_CONFIRMATION_THRESHOLD,
  GOOGLE_SEARCH_CONCURRENCY,
  MAX_BATCH_REQUESTS,
  SearchPlanError,
  calculateRequestCount,
  createSearchPlan,
  deduplicateBusinesses,
  executeSearchPlan,
  normalizeLocations,
  normalizeQueryVariants,
} from "../lib/search-plan.ts";
import type { BusinessSource } from "../lib/sources/business-source.ts";
import type { SourceBusiness } from "../lib/sources/types.ts";

function business(id: string, overrides: Partial<SourceBusiness> = {}): SourceBusiness {
  return {
    id: `test-${id}`,
    businessName: `Business ${id}`,
    category: "Tree Service",
    address: "Orlando, FL",
    phone: "(407) 555-0100",
    website: "https://example.com",
    rating: 4.6,
    reviewCount: 30,
    latestReviewDate: null,
    source: "Test",
    provider: "GOOGLE_PLACES",
    sourceBusinessId: id,
    operationalStatus: "OPERATIONAL",
    primaryType: "tree_service",
    pureServiceAreaBusiness: false,
    ...overrides,
  };
}

test("location and query normalization trims and removes case-insensitive duplicates", () => {
  assert.deepEqual(
    normalizeLocations(" Orlando, FL\nWinter Park, FL\norlando, fl "),
    ["Orlando, FL", "Winter Park, FL"],
  );
  assert.deepEqual(
    normalizeLocations("Orlando, FL, Winter Park, FL"),
    ["Orlando, FL", "Winter Park, FL"],
  );
  assert.deepEqual(
    normalizeQueryVariants(" tree service, Tree Removal\ntree service "),
    ["tree service", "Tree Removal"],
  );
});

test("request planning calculates combinations and preserves single search", () => {
  assert.equal(calculateRequestCount(["A", "B"], ["one", "two"]), 4);
  const single = createSearchPlan({ industry: "Tree Service", location: "Orlando, FL" });
  assert.deepEqual(single.items, [{ query: "Tree Service", location: "Orlando, FL" }]);

  const batch = createSearchPlan({
    mode: "batch",
    industry: "Tree Service",
    location: "",
    locations: "Orlando, FL\nWinter Park, FL",
    queryVariants: "tree removal",
  });
  assert.equal(batch.items.length, 4);
});

test("batch planning requires confirmation above four and enforces all hard caps", () => {
  const confirmationInput = {
    mode: "batch" as const,
    industry: "Tree Service",
    location: "",
    locations: "A\nB\nC",
    queryVariants: "tree removal",
  };
  assert.equal(BATCH_CONFIRMATION_THRESHOLD, 4);
  assert.throws(() => createSearchPlan(confirmationInput), /Confirm the 6-request batch/);
  assert.equal(createSearchPlan({ ...confirmationInput, batchConfirmed: true }).items.length, 6);

  assert.throws(
    () => createSearchPlan({
      mode: "batch",
      industry: "Tree Service",
      location: "",
      locations: "A\nB\nC\nD",
      queryVariants: "one\ntwo\nthree",
      batchConfirmed: true,
    }),
    (error: unknown) => error instanceof SearchPlanError &&
      error.message.includes(String(MAX_BATCH_REQUESTS)),
  );
  assert.throws(
    () => createSearchPlan({
      mode: "batch",
      industry: "Tree Service",
      location: "",
      locations: "A\nB\nC\nD\nE\nF\nG\nH\nI",
    }),
    /at most 8 locations/,
  );
  assert.throws(
    () => createSearchPlan({
      mode: "batch",
      industry: "Tree Service",
      location: "",
      locations: "A",
      queryVariants: "one\ntwo\nthree\nfour",
    }),
    /at most 4 query variants/,
  );
  assert.throws(
    () => createSearchPlan({
      mode: "batch",
      industry: "Tree Service",
      location: "",
      locations: "A".repeat(721),
    }),
    /720 characters or fewer/,
  );
  assert.throws(
    () => createSearchPlan({
      mode: "invalid" as "batch",
      industry: "Tree Service",
      location: "Orlando, FL",
    }),
    /Search mode is invalid/,
  );
});

test("deduplication uses source ID, merges provenance, and uses only a strict name-phone fallback", () => {
  const duplicate = business("place-1");
  const deduplicated = deduplicateBusinesses([
    { business: duplicate, query: "tree service", location: "Orlando, FL" },
    { business: { ...duplicate, businessName: "Different provider spelling" }, query: "tree removal", location: "Winter Park, FL" },
    { business: business("", { id: "fallback-a", businessName: "Fallback Co" }), query: "arborist", location: "Orlando, FL" },
    { business: business("", { id: "fallback-b", businessName: " fallback co " }), query: "tree service", location: "Sanford, FL" },
    { business: business("", { id: "no-phone-a", businessName: "Same Name", phone: null }), query: "tree service", location: "A" },
    { business: business("", { id: "no-phone-b", businessName: "Same Name", phone: null }), query: "tree service", location: "B" },
  ]);

  assert.equal(deduplicated.length, 4);
  assert.deepEqual(deduplicated[0].matchedLocations, ["Orlando, FL", "Winter Park, FL"]);
  assert.deepEqual(deduplicated[0].matchedQueries, ["tree service", "tree removal"]);
  assert.equal(deduplicated[0].deduplicationMethod, "SOURCE_BUSINESS_ID");
  assert.equal(deduplicated[1].deduplicationMethod, "NAME_PHONE_FALLBACK");
});

test("plan execution bounds provider concurrency and records partial failure", async () => {
  const plan = createSearchPlan({
    mode: "batch",
    industry: "Tree Service",
    location: "",
    locations: "A\nB\nC\nD",
    queryVariants: "tree removal",
    batchConfirmed: true,
  });
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const source: BusinessSource = {
    name: "Test",
    async searchBusinesses(input) {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (input.location === "C" && input.industry === "tree removal") throw new Error("safe test failure");
      return [business(`${input.location}-${input.industry}`)];
    },
  };

  const execution = await executeSearchPlan(plan, source, {});
  assert.equal(calls, 8);
  assert.equal(maximumActive, GOOGLE_SEARCH_CONCURRENCY);
  assert.equal(execution.metrics.completedRequests, 7);
  assert.equal(execution.metrics.failedRequests, 1);
  assert.equal(execution.metrics.rawResultCount, 7);
  assert.equal(execution.metrics.uniqueResultCount, 7);
});

test("all request failures are represented without successful results", async () => {
  const plan = createSearchPlan({ industry: "Tree Service", location: "Orlando, FL" });
  const source: BusinessSource = {
    name: "Failing",
    async searchBusinesses() { throw new Error("upstream internals"); },
  };
  const execution = await executeSearchPlan(plan, source, {});

  assert.equal(execution.metrics.completedRequests, 0);
  assert.equal(execution.metrics.failedRequests, 1);
  assert.deepEqual(execution.businesses, []);
});

test("duplicate businesses are enriched once and score exactly as a single match", async () => {
  const duplicate = business("shared");
  const deduplicated = deduplicateBusinesses([
    { business: duplicate, query: "tree service", location: "Orlando, FL" },
    { business: duplicate, query: "tree removal", location: "Winter Park, FL" },
  ]);
  let inspections = 0;
  const enrichment = await enrichBusinessWebsites(deduplicated, async () => {
    inspections += 1;
    return {
      websiteStatus: "WEAK",
      finalUrl: "https://example.com/",
      httpStatus: 200,
      responseTimeMs: 1,
      signals: ["PAGE_REACHABLE"],
      checkedAt: "2026-09-29T12:00:00.000Z",
    };
  });

  assert.equal(inspections, 1);
  assert.equal(enrichment.businesses.length, 1);
  assert.deepEqual(
    calculateLeadScore(enrichment.businesses[0], "2026-09-29"),
    calculateLeadScore({ ...duplicate, websiteEnrichment: enrichment.businesses[0].websiteEnrichment }, "2026-09-29"),
  );
});
