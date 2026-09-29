import assert from "node:assert/strict";
import test from "node:test";
import { calculateLeadScore, getPriorityBand } from "../lib/scoring/lead-score.ts";
import type { SourceBusiness } from "../lib/sources/types.ts";

const REFERENCE_DATE = "2026-09-28";

function candidate(overrides: Partial<SourceBusiness> = {}): SourceBusiness {
  return {
    id: "test-business",
    businessName: "Test Service Co.",
    category: "Tree Service",
    address: "100 Test Ave, Orlando, FL",
    phone: "(407) 555-0199",
    website: "https://test-service.example",
    rating: 4.5,
    reviewCount: 30,
    latestReviewDate: "2026-09-20",
    source: "Test Source",
    sourceBusinessId: "TEST-001",
    websiteStatus: "WEAK",
    ...overrides,
  };
}

test("score calculation is deterministic and remains in the 0-100 range", () => {
  const business = candidate();
  const first = calculateLeadScore(business, REFERENCE_DATE);
  const second = calculateLeadScore(business, REFERENCE_DATE);

  assert.deepEqual(first, second);
  assert.equal(first.score, 92);
});

test("a review within 14 days earns more than a 30-day review", () => {
  const recent = calculateLeadScore(candidate({ latestReviewDate: "2026-09-23" }), REFERENCE_DATE);
  const older = calculateLeadScore(candidate({ latestReviewDate: "2026-09-08" }), REFERENCE_DATE);

  assert.equal(recent.score - older.score, 8);
  assert.match(recent.reasons[0], /Recent review 5 days ago/);
});

test("a stale review receives the over-one-year penalty", () => {
  const result = calculateLeadScore(candidate({ latestReviewDate: "2024-01-10" }), REFERENCE_DATE);

  assert.ok(result.reasons.some((reason) => reason.includes("Latest review over 2 years ago")));
  assert.ok(result.score < calculateLeadScore(candidate(), REFERENCE_DATE).score);
});

test("a missing website creates a larger opportunity signal than a healthy website", () => {
  const missing = calculateLeadScore(candidate({ website: null, websiteStatus: "NONE" }), REFERENCE_DATE);
  const healthy = calculateLeadScore(candidate({ websiteStatus: "HEALTHY" }), REFERENCE_DATE);

  assert.equal(missing.score - healthy.score, 21);
  assert.ok(missing.reasons.includes("+ No website found"));
});

test("a missing phone lowers the score", () => {
  const listed = calculateLeadScore(candidate(), REFERENCE_DATE);
  const missing = calculateLeadScore(candidate({ phone: null }), REFERENCE_DATE);

  assert.equal(listed.score - missing.score, 26);
  assert.ok(missing.reasons.includes("- No public phone found"));
});

test("priority band classification uses the documented boundaries", () => {
  assert.equal(getPriorityBand(100), "HIGH");
  assert.equal(getPriorityBand(80), "HIGH");
  assert.equal(getPriorityBand(79), "REVIEW");
  assert.equal(getPriorityBand(60), "REVIEW");
  assert.equal(getPriorityBand(59), "LOW");
  assert.equal(getPriorityBand(0), "LOW");
});
