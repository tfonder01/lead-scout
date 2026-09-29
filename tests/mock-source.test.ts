import assert from "node:assert/strict";
import test from "node:test";
import { mockBusinessSource } from "../lib/sources/mock-source.ts";

test("mock provider searches normalized industry and location fields", async () => {
  const results = await mockBusinessSource.searchBusinesses({
    industry: "Tree Service",
    location: "Orlando, FL",
  });

  assert.equal(results.length, 4);
  assert.ok(results.every((business) => business.category === "Tree Service"));
  assert.ok(results.every((business) => business.address.includes("Orlando, FL")));
});

test("mock provider applies optional filters and supports an empty result", async () => {
  const filtered = await mockBusinessSource.searchBusinesses({
    industry: "Painting",
    location: "Winter Park, FL",
    filters: { minimumRating: 4.6, minimumReviewCount: 20, recentReviewActivity: true },
  });
  const empty = await mockBusinessSource.searchBusinesses({
    industry: "Plumbing",
    location: "Orlando, FL",
  });

  assert.deepEqual(filtered.map(({ id }) => id), ["mock-paint-001"]);
  assert.deepEqual(empty, []);
});

