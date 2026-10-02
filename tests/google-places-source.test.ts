import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_PLACES_ENDPOINT,
  GOOGLE_PLACES_FIELD_MASK,
  GooglePlacesBusinessSource,
  GooglePlacesSourceError,
  normalizeGooglePlace,
} from "../lib/sources/google-places-source.ts";

const GOOGLE_PLACE = {
  id: "ChIJ-test-place",
  displayName: { text: "Canopy Tree Care" },
  formattedAddress: "100 Oak St, Orlando, FL 32801, USA",
  nationalPhoneNumber: "(407) 555-0199",
  websiteUri: "https://canopy.example/services",
  rating: 4.8,
  userRatingCount: 73,
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=123",
  primaryType: "tree_service",
  primaryTypeDisplayName: { text: "Tree service" },
  pureServiceAreaBusiness: false,
};

test("normalizes requested Google fields into provider-neutral data", () => {
  const result = normalizeGooglePlace(GOOGLE_PLACE, "Tree Service");

  assert.ok(result);
  assert.equal(result.sourceBusinessId, "ChIJ-test-place");
  assert.equal(result.businessName, "Canopy Tree Care");
  assert.equal(result.rating, 4.8);
  assert.equal(result.reviewCount, 73);
  assert.equal(result.operationalStatus, "OPERATIONAL");
  assert.equal(result.primaryType, "tree_service");
  assert.equal(result.provider, "GOOGLE_PLACES");
  assert.equal(result.latestReviewDate, null);
  assert.equal(result.website, "https://canopy.example/services");
});

test("keeps missing Google values nullable and does not invent website health", () => {
  const result = normalizeGooglePlace(
    {
      id: "no-contact",
      displayName: { text: "Service Area Co" },
      pureServiceAreaBusiness: true,
    },
    "Handyman",
  );

  assert.ok(result);
  assert.equal(result.address, "Service area business");
  assert.equal(result.phone, null);
  assert.equal(result.website, null);
  assert.equal(result.rating, null);
  assert.equal(result.reviewCount, null);
  assert.equal(result.latestReviewDate, null);
  assert.equal(result.operationalStatus, "UNKNOWN");
  assert.equal(result.pureServiceAreaBusiness, true);
});

test("rejects non-http provider URLs before they reach the UI", () => {
  const result = normalizeGooglePlace(
    {
      ...GOOGLE_PLACE,
      websiteUri: "javascript:alert(1)",
      googleMapsUri: "file:///internal/path",
    },
    "Tree Service",
  );

  assert.ok(result);
  assert.equal(result.website, null);
  assert.equal(result.sourceUrl, undefined);
});

test("rejects provider URLs with embedded credentials", () => {
  const result = normalizeGooglePlace(
    {
      ...GOOGLE_PLACE,
      websiteUri: "https://user:password@example.com",
    },
    "Tree Service",
  );

  assert.ok(result);
  assert.equal(result.website, null);
});

test("sends one bounded Text Search request with the explicit field mask", async () => {
  let callCount = 0;
  const source = new GooglePlacesBusinessSource("test-key", async (input, init) => {
    callCount += 1;
    assert.equal(input, GOOGLE_PLACES_ENDPOINT);
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("X-Goog-Api-Key"), "test-key");
    assert.equal(new Headers(init?.headers).get("X-Goog-FieldMask"), GOOGLE_PLACES_FIELD_MASK);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      textQuery: "Tree Service in Orlando, FL",
      includePureServiceAreaBusinesses: true,
    });
    assert.equal("pageToken" in body, false);
    assert.equal(String(input).includes("details"), false);
    return Response.json({ places: [GOOGLE_PLACE] });
  });

  const results = await source.searchBusinesses({
    industry: "Tree Service",
    location: "Orlando, FL",
  });

  assert.equal(callCount, 1);
  assert.equal(results.length, 1);
});

test("fails clearly without an API key and never calls fetch", async () => {
  const source = new GooglePlacesBusinessSource(undefined, async () => {
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    source.searchBusinesses({ industry: "Roofing", location: "Orlando, FL" }),
    (error: unknown) =>
      error instanceof GooglePlacesSourceError &&
      error.code === "MISSING_API_KEY" &&
      error.message === "Google Places API key is not configured.",
  );
});

test("maps Google errors and malformed payloads to safe provider errors", async (context) => {
  await context.test("4xx response", async () => {
    const source = new GooglePlacesBusinessSource(
      "test-key",
      async () => new Response("upstream details", { status: 403 }),
    );
    await assert.rejects(
      source.searchBusinesses({ industry: "Painting", location: "Orlando, FL" }),
      (error: unknown) =>
        error instanceof GooglePlacesSourceError &&
        error.code === "UPSTREAM_REJECTED" &&
        !error.message.includes("upstream details"),
    );
  });

  await context.test("5xx response", async () => {
    const source = new GooglePlacesBusinessSource(
      "test-key",
      async () => new Response(null, { status: 503 }),
    );
    await assert.rejects(
      source.searchBusinesses({ industry: "Painting", location: "Orlando, FL" }),
      (error: unknown) =>
        error instanceof GooglePlacesSourceError && error.code === "UPSTREAM_UNAVAILABLE",
    );
  });

  await context.test("malformed response", async () => {
    const source = new GooglePlacesBusinessSource(
      "test-key",
      async () => Response.json({ places: "not-an-array" }),
    );
    await assert.rejects(
      source.searchBusinesses({ industry: "Painting", location: "Orlando, FL" }),
      (error: unknown) =>
        error instanceof GooglePlacesSourceError && error.code === "MALFORMED_RESPONSE",
    );
  });

  await context.test("network failure", async () => {
    const source = new GooglePlacesBusinessSource("test-key", async () => {
      throw new TypeError("network details");
    });
    await assert.rejects(
      source.searchBusinesses({ industry: "Painting", location: "Orlando, FL" }),
      (error: unknown) =>
        error instanceof GooglePlacesSourceError &&
        error.code === "UPSTREAM_UNAVAILABLE" &&
        !error.message.includes("network details"),
    );
  });
});
