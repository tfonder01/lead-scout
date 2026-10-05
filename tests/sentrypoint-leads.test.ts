import assert from "node:assert/strict";
import test from "node:test";
import { addCandidateToSentryPoint } from "../lib/sentrypoint-leads.ts";
import type { CandidateBusiness } from "../lib/sources/types.ts";

const candidate: CandidateBusiness = {
  id: "place-1", businessName: "Acme Painting", category: "Painting",
  address: "100 Main St, Maitland, FL", phone: "(407) 555-0100",
  website: "https://acme.example", rating: 4.8, reviewCount: 20,
  latestReviewDate: null, source: "Google Places", provider: "GOOGLE_PLACES",
  sourceBusinessId: "ChIJ-acme", sourceUrl: "https://maps.google.com/?cid=123",
  operationalStatus: "OPERATIONAL", primaryType: "painter", pureServiceAreaBusiness: false,
  matchedLocations: ["Maitland, FL"], matchedQueries: ["Painting"],
  websiteStatus: "WEAK", websiteSignals: [], leadScore: 91, scoreReasons: [],
};

async function configured(run: () => Promise<void>) {
  const values = ["SENTRYPOINT_API_BASE_URL", "SENTRYPOINT_CRM_BASE_URL", "LEAD_SCOUT_API_TOKEN"] as const;
  const before = Object.fromEntries(values.map((key) => [key, process.env[key]]));
  process.env.SENTRYPOINT_API_BASE_URL = "http://localhost:8081";
  process.env.SENTRYPOINT_CRM_BASE_URL = "http://localhost:3000";
  process.env.LEAD_SCOUT_API_TOKEN = "server-secret";
  try { await run(); } finally {
    for (const key of values) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test("maps a selected Google prospect and keeps the credential in the request header", async () => {
  await configured(async () => {
    let request: RequestInit | undefined;
    globalThis.fetch = async (_url, init) => {
      request = init;
      return new Response(JSON.stringify({ result: "CREATED", leadId: "123e4567-e89b-42d3-a456-426614174000" }), { status: 201 });
    };
    const result = await addCandidateToSentryPoint(candidate);
    assert.equal(result.status, "CREATED");
    assert.deepEqual(JSON.parse(String(request?.body)), {
      businessName: "Acme Painting", phone: "(407) 555-0100", website: "https://acme.example",
      sourceUrl: "https://maps.google.com/?cid=123", sourceBusinessId: "ChIJ-acme",
      provider: "GOOGLE_PLACES", industry: "Painting", address: "100 Main St, Maitland, FL",
      leadScore: 91, websiteStatus: "WEAK", matchedLocations: ["Maitland, FL"], matchedQueries: ["Painting"],
    });
    assert.equal((request?.headers as Record<string, string>).Authorization, "Bearer server-secret");
    assert.ok(!JSON.stringify(result).includes("server-secret"));
  });
});

test("returns an existing lead cleanly for an idempotent retry", async () => {
  await configured(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      result: "ALREADY_EXISTS", leadId: "123e4567-e89b-42d3-a456-426614174000",
    }), { status: 200 });
    assert.deepEqual(await addCandidateToSentryPoint(candidate), {
      status: "ALREADY_EXISTS", leadId: "123e4567-e89b-42d3-a456-426614174000",
      leadUrl: "http://localhost:3000/admin/leads?lead=123e4567-e89b-42d3-a456-426614174000",
    });
  });
});

test("rejects malformed, mock, and credential-bearing selected values before fetch", async () => {
  await configured(async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error("unexpected"); };
    assert.equal((await addCandidateToSentryPoint({ ...candidate, provider: "MOCK" })).status, "ERROR");
    assert.equal((await addCandidateToSentryPoint({ ...candidate, sourceUrl: "https://user:pass@example.com" })).status, "ERROR");
    assert.equal((await addCandidateToSentryPoint({ ...candidate, leadScore: 101 })).status, "ERROR");
    assert.equal(called, false);
  });
});

test("fails closed when server-only integration configuration is absent", async () => {
  const previous = process.env.LEAD_SCOUT_API_TOKEN;
  delete process.env.LEAD_SCOUT_API_TOKEN;
  try {
    assert.deepEqual(await addCandidateToSentryPoint(candidate), {
      status: "ERROR", message: "SentryPoint Leads integration is not configured.",
    });
  } finally {
    if (previous !== undefined) process.env.LEAD_SCOUT_API_TOKEN = previous;
  }
});
