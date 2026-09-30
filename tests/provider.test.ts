import assert from "node:assert/strict";
import test from "node:test";
import { GooglePlacesBusinessSource } from "../lib/sources/google-places-source.ts";
import { MockBusinessSource } from "../lib/sources/mock-source.ts";
import { selectBusinessSource } from "../lib/sources/provider.ts";

test("provider selection defaults to mock and supports explicit modes", () => {
  const defaultSelection = selectBusinessSource(undefined);
  const mockSelection = selectBusinessSource("mock");
  const googleSelection = selectBusinessSource("google");

  assert.ok(defaultSelection.source instanceof MockBusinessSource);
  assert.ok(mockSelection.source instanceof MockBusinessSource);
  assert.equal(mockSelection.supportsReviewRecency, true);
  assert.ok(googleSelection.source instanceof GooglePlacesBusinessSource);
  assert.equal(googleSelection.provider, "GOOGLE_PLACES");
  assert.equal(googleSelection.supportsReviewRecency, false);
});

test("provider selection rejects ambiguous configuration", () => {
  assert.throws(
    () => selectBusinessSource("other"),
    /must be either mock or google/,
  );
});
