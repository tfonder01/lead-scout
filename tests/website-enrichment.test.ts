import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichBusinessWebsites,
  inspectBusinessWebsite,
  WEBSITE_ENRICHMENT_CONCURRENCY,
  WEBSITE_ENRICHMENT_MAX_BYTES,
} from "../lib/enrichment/website-enrichment.ts";
import type { SourceBusiness } from "../lib/sources/types.ts";

const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 as const };

async function* body(value: string | Buffer): AsyncGenerator<Buffer> {
  yield Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function response(
  status: number,
  value: string | Buffer = "",
  headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" },
) {
  return { status, headers, body: body(value) };
}

const healthyHtml = `<!doctype html><html><head><title>Canopy Tree Care</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body><h1>Professional tree care in Orlando</h1>
  <p>${"Licensed tree trimming, removal, and storm cleanup services for local homes and businesses. ".repeat(4)}</p>
  <a href="/contact">Request an estimate</a></body></html>`;

const weakHtml = `<!doctype html><html><head><title>Example Service</title></head>
  <body><h1>Example Service</h1><p>${"Local service information. ".repeat(10)}</p></body></html>`;

const fixedNow = () => new Date("2026-09-29T12:00:00.000Z");
const publicLookup = async () => [PUBLIC_ADDRESS];

test("no website produces NONE without resolving or requesting", async () => {
  let called = false;
  const result = await inspectBusinessWebsite(
    { website: null },
    {
      lookup: async () => {
        called = true;
        return [PUBLIC_ADDRESS];
      },
      request: async () => {
        called = true;
        return response(200, healthyHtml);
      },
      now: fixedNow,
    },
  );

  assert.equal(result.websiteStatus, "NONE");
  assert.equal(called, false);
  assert.equal(result.checkedAt, "2026-09-29T12:00:00.000Z");
});

test("reachable HTML with core sales-fit signals is HEALTHY", async () => {
  const result = await inspectBusinessWebsite(
    { website: "https://example.com" },
    { lookup: publicLookup, request: async () => response(200, healthyHtml), now: fixedNow },
  );

  assert.equal(result.websiteStatus, "HEALTHY");
  assert.equal(result.finalUrl, "https://example.com/");
  assert.equal(result.httpStatus, 200);
  assert.ok(result.signals.includes("HTTPS"));
  assert.ok(result.signals.includes("MOBILE_VIEWPORT"));
  assert.ok(result.signals.includes("CONTACT_CTA"));
});

test("missing viewport and contact signals produce evidence-based WEAK", async () => {
  const result = await inspectBusinessWebsite(
    { website: "https://example.com" },
    { lookup: publicLookup, request: async () => response(200, weakHtml) },
  );

  assert.equal(result.websiteStatus, "WEAK");
  assert.ok(result.signals.includes("VIEWPORT_MISSING"));
  assert.ok(result.signals.includes("CONTACT_SIGNAL_MISSING"));
});

test("placeholder landing page is WEAK", async () => {
  const html = `<html><head><title>Coming soon</title><meta name="viewport" content="width=device-width"></head>
    <body><h1>Our website is coming soon</h1><p>${"Please check back for updates. ".repeat(12)}</p><a href="tel:+14075550199">Call</a></body></html>`;
  const result = await inspectBusinessWebsite(
    { website: "https://example.com" },
    { lookup: publicLookup, request: async () => response(200, html) },
  );

  assert.equal(result.websiteStatus, "WEAK");
  assert.ok(result.signals.includes("PLACEHOLDER_MARKER"));
});

test("network failures and timeouts are UNREACHABLE", async (context) => {
  for (const message of ["connection refused", "request timed out"]) {
    await context.test(message, async () => {
      const result = await inspectBusinessWebsite(
        { website: "https://example.com" },
        { lookup: publicLookup, request: async () => { throw new Error(message); } },
      );
      assert.equal(result.websiteStatus, "UNREACHABLE");
      assert.equal(result.finalUrl, null);
    });
  }
});

test("access-denied and rate-limited pages remain UNKNOWN rather than becoming false opportunities", async (context) => {
  for (const status of [401, 403, 429]) {
    await context.test(String(status), async () => {
      const result = await inspectBusinessWebsite(
        { website: "https://example.com" },
        { lookup: publicLookup, request: async () => response(status) },
      );
      assert.equal(result.websiteStatus, "UNKNOWN");
      assert.equal(result.httpStatus, status);
    });
  }
});

test("not-found and server-error pages are UNREACHABLE", async (context) => {
  for (const status of [404, 500, 503]) {
    await context.test(String(status), async () => {
      const result = await inspectBusinessWebsite(
        { website: "https://example.com" },
        { lookup: publicLookup, request: async () => response(status) },
      );
      assert.equal(result.websiteStatus, "UNREACHABLE");
    });
  }
});

test("safe redirects are followed and each destination is resolved", async () => {
  const requested: string[] = [];
  const resolved: string[] = [];
  const result = await inspectBusinessWebsite(
    { website: "http://example.com/start" },
    {
      lookup: async (hostname) => {
        resolved.push(hostname);
        return [PUBLIC_ADDRESS];
      },
      request: async (url) => {
        requested.push(url.href);
        return requested.length === 1
          ? response(302, "", { location: "https://www.example.com/home" })
          : response(200, healthyHtml);
      },
    },
  );

  assert.equal(result.websiteStatus, "HEALTHY");
  assert.equal(result.finalUrl, "https://www.example.com/home");
  assert.deepEqual(resolved, ["example.com", "www.example.com"]);
  assert.equal(requested.length, 2);
});

test("redirects to private destinations are refused before a second request", async () => {
  let requestCount = 0;
  const result = await inspectBusinessWebsite(
    { website: "https://example.com" },
    {
      lookup: async () => [PUBLIC_ADDRESS],
      request: async () => {
        requestCount += 1;
        return response(302, "", { location: "http://127.0.0.1/admin" });
      },
    },
  );

  assert.equal(result.websiteStatus, "UNKNOWN");
  assert.equal(requestCount, 1);
});

test("private DNS answers and embedded credentials are refused", async (context) => {
  await context.test("private DNS answer", async () => {
    let requested = false;
    const result = await inspectBusinessWebsite(
      { website: "https://example.com" },
      {
        lookup: async () => [{ address: "169.254.169.254", family: 4 }],
        request: async () => {
          requested = true;
          return response(200, healthyHtml);
        },
      },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
    assert.equal(requested, false);
  });

  await context.test("credentials", async () => {
    const result = await inspectBusinessWebsite(
      { website: "https://user:password@example.com" },
      { lookup: publicLookup, request: async () => response(200, healthyHtml) },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
  });

  await context.test("IPv6 loopback", async () => {
    const result = await inspectBusinessWebsite(
      { website: "https://[::1]" },
      { request: async () => response(200, healthyHtml) },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
  });
});

test("oversized and non-HTML responses are UNKNOWN", async (context) => {
  await context.test("oversized body", async () => {
    const result = await inspectBusinessWebsite(
      { website: "https://example.com" },
      {
        lookup: publicLookup,
        request: async () => response(
          200,
          Buffer.alloc(WEBSITE_ENRICHMENT_MAX_BYTES + 1, "a"),
        ),
      },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
  });

  await context.test("non-HTML", async () => {
    const result = await inspectBusinessWebsite(
      { website: "https://example.com/file.pdf" },
      {
        lookup: publicLookup,
        request: async () => response(200, "%PDF", { "content-type": "application/pdf" }),
      },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
    assert.deepEqual(result.signals, []);
  });

  await context.test("unexpected content encoding", async () => {
    const result = await inspectBusinessWebsite(
      { website: "https://example.com" },
      {
        lookup: publicLookup,
        request: async () => response(200, healthyHtml, {
          "content-type": "text/html",
          "content-encoding": "gzip",
        }),
      },
    );
    assert.equal(result.websiteStatus, "UNKNOWN");
  });
});

test("HTTP-only landing pages are WEAK even with otherwise healthy signals", async () => {
  const result = await inspectBusinessWebsite(
    { website: "http://example.com" },
    { lookup: publicLookup, request: async () => response(200, healthyHtml) },
  );

  assert.equal(result.websiteStatus, "WEAK");
  assert.ok(result.signals.includes("HTTP_ONLY"));
});

test("batch enrichment never exceeds the configured concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const businesses = Array.from({ length: 12 }, (_, index): SourceBusiness => ({
    id: `business-${index}`,
    businessName: `Business ${index}`,
    category: "Tree Service",
    address: "Orlando, FL",
    phone: null,
    website: `https://example-${index}.com`,
    rating: null,
    reviewCount: null,
    latestReviewDate: null,
    source: "Test",
    provider: "MOCK",
    sourceBusinessId: String(index),
    operationalStatus: "UNKNOWN",
    primaryType: null,
    pureServiceAreaBusiness: null,
  }));

  const result = await enrichBusinessWebsites(businesses, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return {
      websiteStatus: "WEAK",
      finalUrl: "https://example.com/",
      httpStatus: 200,
      responseTimeMs: 1,
      signals: ["PAGE_REACHABLE"],
      checkedAt: "2026-09-29T12:00:00.000Z",
    };
  });

  assert.equal(result.businesses.length, 12);
  assert.equal(maximumActive, WEBSITE_ENRICHMENT_CONCURRENCY);
  assert.equal(result.metrics.checked, 12);
});
