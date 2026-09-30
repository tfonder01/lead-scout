import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type {
  SourceBusiness,
  WebsiteEnrichmentResult,
  WebsiteSignal,
  WebsiteStatus,
} from "../sources/types.ts";

export const WEBSITE_ENRICHMENT_TIMEOUT_MS = 7_000;
export const WEBSITE_ENRICHMENT_MAX_BYTES = 512 * 1024;
export const WEBSITE_ENRICHMENT_MAX_REDIRECTS = 3;
export const WEBSITE_ENRICHMENT_CONCURRENCY = 5;

type ResolvedAddress = { address: string; family: 4 | 6 };

type TransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array | string>;
};

export type WebsiteEnrichmentDependencies = {
  lookup?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: (
    url: URL,
    address: ResolvedAddress,
    timeoutMs: number,
  ) => Promise<TransportResponse>;
  now?: () => Date;
};

export type WebsiteEnrichedBusiness = SourceBusiness & {
  websiteEnrichment: WebsiteEnrichmentResult;
};

export type WebsiteEnrichmentMetrics = {
  checked: number;
  skipped: number;
  statusCounts: Record<WebsiteStatus, number>;
  durationMs: number;
};

class WebsiteSafetyError extends Error {}
class WebsiteResponseLimitError extends Error {}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Website request timed out"));
    }, Math.max(1, timeoutMs));
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return BLOCKED_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal");
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map(Number);
  return numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? numbers
    : null;
}

function isBlockedIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return true;
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 192 && b === 88 && parts[2] === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224;
}

function expandIpv6(address: string): number[] | null {
  const withoutZone = address.toLowerCase().split("%")[0];
  const ipv4Match = withoutZone.match(/(\d+\.\d+\.\d+\.\d+)$/);
  let normalized = withoutZone;
  if (ipv4Match) {
    const ipv4 = parseIpv4(ipv4Match[1]);
    if (!ipv4) return null;
    const first = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const second = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = normalized.slice(0, -ipv4Match[1].length) + `${first}:${second}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

function isBlockedIpv6(address: string): boolean {
  const parts = expandIpv6(address);
  if (!parts) return true;
  const allZero = parts.every((part) => part === 0);
  const loopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
  if (allZero || loopback) return true;
  if ((parts[0] & 0xfe00) === 0xfc00) return true;
  if ((parts[0] & 0xffc0) === 0xfe80) return true;
  if ((parts[0] & 0xffc0) === 0xfec0) return true;
  if ((parts[0] & 0xff00) === 0xff00) return true;
  if (parts[0] === 0x2001 && (parts[1] === 0 || parts[1] === 0x0db8)) return true;
  if (parts[0] === 0x0064 && parts[1] === 0xff9b && parts[2] === 1) return true;

  const mappedIpv4 = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  const compatibleIpv4 = parts.slice(0, 6).every((part) => part === 0);
  const nat64Ipv4 = parts[0] === 0x0064 && parts[1] === 0xff9b &&
    parts.slice(2, 6).every((part) => part === 0);
  const sixToFour = parts[0] === 0x2002;
  if (mappedIpv4 || compatibleIpv4 || nat64Ipv4 || sixToFour) {
    const offset = sixToFour ? 1 : 6;
    const ipv4 = `${parts[offset] >> 8}.${parts[offset] & 255}.${parts[offset + 1] >> 8}.${parts[offset + 1] & 255}`;
    return isBlockedIpv4(ipv4);
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) return isBlockedIpv6(normalized);
  return true;
}

async function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses
    .filter((entry): entry is ResolvedAddress => entry.family === 4 || entry.family === 6)
    .map(({ address, family }) => ({ address, family }));
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function defaultRequest(
  url: URL,
  address: ResolvedAddress,
  timeoutMs: number,
): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "Accept-Encoding": "identity",
          Connection: "close",
          Host: url.host,
          "User-Agent": "SentryPoint-Lead-Scout/2.0 website-opportunity-check",
        },
        ...(url.protocol === "https:"
          ? { servername: url.hostname.replace(/^\[|\]$/g, ""), rejectUnauthorized: true }
          : {}),
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Website request timed out")));
    request.once("error", reject);
    request.end();
  });
}

async function validateAndResolveUrl(
  value: string | URL,
  lookup: (hostname: string) => Promise<ResolvedAddress[]>,
): Promise<{ url: URL; address: ResolvedAddress }> {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new WebsiteSafetyError("Malformed website URL");
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new WebsiteSafetyError("Website URL is not allowed");
  }
  if (!url.hostname || isBlockedHostname(url.hostname)) {
    throw new WebsiteSafetyError("Website destination is not allowed");
  }

  const literalHostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(literalHostname);
  const addresses = literalFamily
    ? [{ address: literalHostname, family: literalFamily as 4 | 6 }]
    : await lookup(literalHostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new WebsiteSafetyError("Website destination is not allowed");
  }
  return { url, address: addresses[0] };
}

async function readBoundedBody(body: TransportResponse["body"]): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > WEBSITE_ENRICHMENT_MAX_BYTES) {
      const destroy = (body as { destroy?: () => void }).destroy;
      destroy?.call(body);
      throw new WebsiteResponseLimitError("Website response exceeded the size limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function closeBody(body: TransportResponse["body"]): void {
  const destroy = (body as { destroy?: () => void }).destroy;
  destroy?.call(body);
}

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, " ")
    .replace(/&#(?:x[0-9a-f]+|\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMetaViewport(html: string): boolean {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) =>
    /\bname\s*=\s*(?:["']viewport["']|viewport(?:\s|>|\/))/i.test(tag),
  );
}

function responseSignal(responseTimeMs: number): WebsiteSignal {
  if (responseTimeMs < 1_000) return "RESPONSE_FAST";
  if (responseTimeMs < 3_000) return "RESPONSE_MODERATE";
  return "RESPONSE_SLOW";
}

export function classifyWebsiteHtml(
  html: string,
  finalUrl: URL,
  responseTimeMs: number,
): { websiteStatus: WebsiteStatus; signals: WebsiteSignal[] } {
  const text = visibleText(html);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .trim();
  const titlePresent = Boolean(title);
  const viewportPresent = hasMetaViewport(html);
  const contactLink = /href\s*=\s*["'](?:tel:|[^"']*(?:contact|quote|estimate|book|appointment)[^"']*)["']/i.test(html);
  const contactCta = /<(?:a|button)\b[^>]*>[\s\S]{0,180}?(?:contact|estimate|request (?:a )?quote|get (?:a )?quote|book (?:now|online|an appointment)|schedule)[\s\S]{0,80}?<\/(?:a|button)>/i.test(html);
  const formFound = /<form\b/i.test(html);
  const placeholder = /\b(?:coming soon|under construction|domain (?:is )?(?:parked|for sale)|website (?:is )?(?:coming soon|expired))\b/i.test(text);
  const broken = /\b(?:404 (?:error|not found)|page not found|site unavailable|account suspended|error establishing a database connection)\b/i.test(text);
  const thin = text.length < 200;
  const httpsFinal = finalUrl.protocol === "https:";
  const hasConversionSignal = contactLink || contactCta || formFound;

  const signals: WebsiteSignal[] = ["PAGE_REACHABLE", responseSignal(responseTimeMs)];
  signals.push(httpsFinal ? "HTTPS" : "HTTP_ONLY");
  signals.push(titlePresent ? "TITLE_PRESENT" : "TITLE_MISSING");
  signals.push(viewportPresent ? "MOBILE_VIEWPORT" : "VIEWPORT_MISSING");
  if (contactLink) signals.push("CONTACT_LINK");
  if (contactCta) signals.push("CONTACT_CTA");
  if (formFound) signals.push("FORM_FOUND");
  if (!hasConversionSignal) signals.push("CONTACT_SIGNAL_MISSING");
  if (placeholder) signals.push("PLACEHOLDER_MARKER");
  if (broken) signals.push("BROKEN_PAGE_MARKER");
  if (thin) signals.push("THIN_CONTENT");

  const healthy = httpsFinal && titlePresent && viewportPresent && !thin &&
    !placeholder && !broken && hasConversionSignal;
  return { websiteStatus: healthy ? "HEALTHY" : "WEAK", signals };
}

function emptyResult(
  websiteStatus: WebsiteStatus,
  checkedAt: string,
): WebsiteEnrichmentResult {
  return {
    websiteStatus,
    finalUrl: null,
    httpStatus: null,
    responseTimeMs: null,
    signals: [],
    checkedAt,
  };
}

export async function inspectBusinessWebsite(
  business: Pick<SourceBusiness, "website">,
  dependencies: WebsiteEnrichmentDependencies = {},
): Promise<WebsiteEnrichmentResult> {
  const checkedAt = (dependencies.now?.() ?? new Date()).toISOString();
  if (!business.website) return emptyResult("NONE", checkedAt);

  const lookup = dependencies.lookup ?? defaultLookup;
  const request = dependencies.request ?? defaultRequest;
  const startedAt = performance.now();
  const deadline = startedAt + WEBSITE_ENRICHMENT_TIMEOUT_MS;
  let currentUrl: string | URL = business.website;
  let redirects = 0;
  let lastStatus: number | null = null;

  try {
    while (true) {
      const remainingMs = Math.ceil(deadline - performance.now());
      if (remainingMs <= 0) throw new Error("Website request timed out");
      const { url, address } = await validateAndResolveUrl(
        currentUrl,
        (hostname) => withTimeout(lookup(hostname), remainingMs),
      );
      const requestTimeMs = Math.ceil(deadline - performance.now());
      if (requestTimeMs <= 0) throw new Error("Website request timed out");
      const response = await withTimeout(request(url, address, requestTimeMs), requestTimeMs);
      lastStatus = response.status;

      if (response.status >= 300 && response.status < 400) {
        const location = headerValue(response.headers, "location");
        if (!location || redirects >= WEBSITE_ENRICHMENT_MAX_REDIRECTS) {
          closeBody(response.body);
          return {
            ...emptyResult("UNREACHABLE", checkedAt),
            finalUrl: url.href,
            httpStatus: response.status,
            responseTimeMs: Math.round(performance.now() - startedAt),
          };
        }
        closeBody(response.body);
        redirects += 1;
        currentUrl = new URL(location, url);
        continue;
      }

      const responseTimeMs = Math.round(performance.now() - startedAt);
      if (response.status < 200 || response.status >= 300) {
        closeBody(response.body);
        const websiteStatus = response.status === 401 ||
          response.status === 403 ||
          response.status === 429
          ? "UNKNOWN"
          : "UNREACHABLE";
        return {
          ...emptyResult(websiteStatus, checkedAt),
          finalUrl: url.href,
          httpStatus: response.status,
          responseTimeMs,
        };
      }

      const contentLength = Number(headerValue(response.headers, "content-length"));
      if (Number.isFinite(contentLength) && contentLength > WEBSITE_ENRICHMENT_MAX_BYTES) {
        closeBody(response.body);
        throw new WebsiteResponseLimitError("Website response exceeded the size limit");
      }
      const contentType = headerValue(response.headers, "content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        closeBody(response.body);
        return {
          ...emptyResult("UNKNOWN", checkedAt),
          finalUrl: url.href,
          httpStatus: response.status,
          responseTimeMs,
        };
      }
      const contentEncoding = headerValue(response.headers, "content-encoding")?.toLowerCase();
      if (contentEncoding && contentEncoding !== "identity") {
        closeBody(response.body);
        return {
          ...emptyResult("UNKNOWN", checkedAt),
          finalUrl: url.href,
          httpStatus: response.status,
          responseTimeMs,
        };
      }

      const bodyTimeMs = Math.ceil(deadline - performance.now());
      if (bodyTimeMs <= 0) throw new Error("Website request timed out");
      const html = await withTimeout(
        readBoundedBody(response.body),
        bodyTimeMs,
        () => closeBody(response.body),
      );
      const classification = classifyWebsiteHtml(html, url, responseTimeMs);
      return {
        ...classification,
        finalUrl: url.href,
        httpStatus: response.status,
        responseTimeMs,
        checkedAt,
      };
    }
  } catch (error) {
    const websiteStatus = error instanceof WebsiteSafetyError ||
      error instanceof WebsiteResponseLimitError
      ? "UNKNOWN"
      : "UNREACHABLE";
    return {
      ...emptyResult(websiteStatus, checkedAt),
      httpStatus: lastStatus,
      responseTimeMs: Math.round(performance.now() - startedAt),
    };
  }
}

export function createMockWebsiteEnrichment(
  business: Pick<SourceBusiness, "website">,
  websiteStatus: WebsiteStatus,
  checkedAt: string,
): WebsiteEnrichmentResult {
  const signalsByStatus: Record<WebsiteStatus, WebsiteSignal[]> = {
    NONE: [],
    HEALTHY: ["HTTPS", "PAGE_REACHABLE", "MOBILE_VIEWPORT", "CONTACT_CTA"],
    WEAK: ["PAGE_REACHABLE", "VIEWPORT_MISSING", "CONTACT_SIGNAL_MISSING"],
    UNREACHABLE: [],
    UNKNOWN: [],
  };
  return {
    websiteStatus,
    finalUrl: business.website,
    httpStatus: websiteStatus === "HEALTHY" || websiteStatus === "WEAK" ? 200 : null,
    responseTimeMs: null,
    signals: signalsByStatus[websiteStatus],
    checkedAt,
  };
}

export async function enrichBusinessWebsites(
  businesses: SourceBusiness[],
  inspect: (business: SourceBusiness) => Promise<WebsiteEnrichmentResult> = inspectBusinessWebsite,
): Promise<{ businesses: WebsiteEnrichedBusiness[]; metrics: WebsiteEnrichmentMetrics }> {
  const startedAt = performance.now();
  const enriched = new Array<WebsiteEnrichedBusiness>(businesses.length);
  let nextIndex = 0;
  const workerCount = Math.min(WEBSITE_ENRICHMENT_CONCURRENCY, businesses.length);

  async function worker(): Promise<void> {
    while (nextIndex < businesses.length) {
      const index = nextIndex++;
      const business = businesses[index];
      enriched[index] = { ...business, websiteEnrichment: await inspect(business) };
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const statusCounts: Record<WebsiteStatus, number> = {
    NONE: 0,
    HEALTHY: 0,
    WEAK: 0,
    UNREACHABLE: 0,
    UNKNOWN: 0,
  };
  for (const business of enriched) statusCounts[business.websiteEnrichment.websiteStatus] += 1;

  return {
    businesses: enriched,
    metrics: {
      checked: businesses.filter(({ website }) => website !== null).length,
      skipped: businesses.filter(({ website }) => website === null).length,
      statusCounts,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}
