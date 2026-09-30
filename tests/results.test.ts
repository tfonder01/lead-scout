import assert from "node:assert/strict";
import test from "node:test";
import { filterBusinesses, sortBusinesses } from "../lib/results.ts";
import type { CandidateBusiness } from "../lib/sources/types.ts";

function result(id: string, leadScore: number, reviewCount: number, latestReviewDate: string): CandidateBusiness {
  return {
    id,
    businessName: id,
    category: "Handyman",
    address: "100 Test Ave, Orlando, FL",
    phone: null,
    website: null,
    rating: 4,
    reviewCount,
    latestReviewDate,
    source: "Test Source",
    provider: "MOCK",
    sourceBusinessId: id,
    websiteStatus: "NONE",
    websiteSignals: [],
    operationalStatus: "UNKNOWN",
    primaryType: null,
    pureServiceAreaBusiness: null,
    leadScore,
    scoreReasons: [],
  };
}

test("sorting supports score, review count, and newest review without mutating input", () => {
  const businesses = [
    result("middle", 70, 50, "2026-08-01"),
    result("top", 90, 10, "2026-07-01"),
    result("newest", 50, 100, "2026-09-20"),
  ];

  assert.deepEqual(sortBusinesses(businesses, "score").map(({ id }) => id), ["top", "middle", "newest"]);
  assert.deepEqual(sortBusinesses(businesses, "reviews").map(({ id }) => id), ["newest", "middle", "top"]);
  assert.deepEqual(sortBusinesses(businesses, "newest").map(({ id }) => id), ["newest", "middle", "top"]);
  assert.deepEqual(businesses.map(({ id }) => id), ["middle", "top", "newest"]);
});

test("result filters select priority, website, and recent activity signals", () => {
  const businesses = [
    { ...result("high", 90, 30, "2026-09-20"), websiteStatus: "NONE" as const },
    { ...result("weak", 70, 20, "2026-08-01"), websiteStatus: "WEAK" as const },
    { ...result("low", 40, 2, "2024-01-01"), websiteStatus: "HEALTHY" as const },
  ];

  assert.deepEqual(filterBusinesses(businesses, "high", "2026-09-28").map(({ id }) => id), ["high"]);
  assert.deepEqual(filterBusinesses(businesses, "none", "2026-09-28").map(({ id }) => id), ["high"]);
  assert.deepEqual(filterBusinesses(businesses, "weak", "2026-09-28").map(({ id }) => id), ["weak"]);
  assert.deepEqual(filterBusinesses(businesses, "recent", "2026-09-28").map(({ id }) => id), ["high"]);
});
