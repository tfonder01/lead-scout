import type { CandidateBusiness, WebsiteStatus } from "@/lib/sources/types";

export type AddLeadResult =
  | { status: "CREATED" | "ALREADY_EXISTS"; leadId: string; leadUrl: string | null }
  | { status: "ERROR"; message: string };

type ImportPayload = {
  businessName: string;
  phone: string | null;
  website: string | null;
  sourceUrl: string | null;
  sourceBusinessId: string;
  provider: "GOOGLE_PLACES";
  industry: string;
  address: string;
  leadScore: number;
  websiteStatus: WebsiteStatus;
  matchedLocations: string[];
  matchedQueries: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEBSITE_STATUSES = new Set<WebsiteStatus>(["NONE", "HEALTHY", "WEAK", "UNREACHABLE", "UNKNOWN"]);

export async function addCandidateToSentryPoint(input: unknown): Promise<AddLeadResult> {
  const payload = validateCandidate(input);
  if (!payload) return { status: "ERROR", message: "This result cannot be added. Refresh the search and try again." };
  const config = integrationConfig();
  if (!config) return { status: "ERROR", message: "SentryPoint Leads integration is not configured." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/internal/lead-scout/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "ERROR", message: safeFailureMessage(response.status) };
    const body = await response.json() as { result?: unknown; leadId?: unknown };
    if ((body.result !== "CREATED" && body.result !== "ALREADY_EXISTS")
      || typeof body.leadId !== "string" || !UUID.test(body.leadId)) {
      return { status: "ERROR", message: "SentryPoint returned an unexpected response." };
    }
    return {
      status: body.result,
      leadId: body.leadId,
      leadUrl: config.crmBaseUrl
        ? `${config.crmBaseUrl}/admin/leads?lead=${encodeURIComponent(body.leadId)}`
        : null,
    };
  } catch {
    return { status: "ERROR", message: "SentryPoint Leads is temporarily unavailable." };
  } finally {
    clearTimeout(timeout);
  }
}

function validateCandidate(input: unknown): ImportPayload | null {
  if (!input || typeof input !== "object") return null;
  const item = input as Partial<CandidateBusiness>;
  const businessName = bounded(item.businessName, 150);
  const phone = optional(item.phone, 50);
  const website = optional(item.website, 2048);
  const sourceUrl = optional(item.sourceUrl, 2048);
  const sourceBusinessId = bounded(item.sourceBusinessId, 255);
  const industry = bounded(item.category, 150);
  const address = bounded(item.address, 500);
  if (item.provider !== "GOOGLE_PLACES" || !businessName || phone === undefined || website === undefined
    || sourceUrl === undefined || !sourceBusinessId || !industry || !address
    || !Number.isInteger(item.leadScore) || item.leadScore! < 0 || item.leadScore! > 100
    || !WEBSITE_STATUSES.has(item.websiteStatus as WebsiteStatus)
    || (sourceUrl !== null && !safeHttpUrl(sourceUrl)) || (website !== null && !safeHttpUrl(website))) return null;
  const matchedLocations = boundedList(item.matchedLocations);
  const matchedQueries = boundedList(item.matchedQueries);
  if (!matchedLocations || !matchedQueries) return null;
  return {
    businessName, phone, website, sourceUrl, sourceBusinessId,
    provider: "GOOGLE_PLACES", industry, address, leadScore: item.leadScore!,
    websiteStatus: item.websiteStatus as WebsiteStatus, matchedLocations, matchedQueries,
  };
}

function integrationConfig(): { apiBaseUrl: string; crmBaseUrl: string | null; token: string } | null {
  const token = process.env.LEAD_SCOUT_API_TOKEN?.trim();
  const apiBaseUrl = baseUrl(process.env.SENTRYPOINT_API_BASE_URL);
  const crmBaseUrl = baseUrl(process.env.SENTRYPOINT_CRM_BASE_URL);
  return token && apiBaseUrl ? { token, apiBaseUrl, crmBaseUrl } : null;
}

function baseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!safeHttpUrl(value) || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function bounded(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum && !/[\u0000-\u001f\u007f]/.test(trimmed) ? trimmed : null;
}

function optional(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return bounded(value, maximum) ?? undefined;
}

function boundedList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) return null;
  const cleaned = value.map((item) => bounded(item, 200));
  return cleaned.some((item) => !item) ? null : [...new Set(cleaned as string[])];
}

function safeFailureMessage(status: number): string {
  if (status === 400) return "SentryPoint rejected this result. Refresh the search and try again.";
  if (status === 401 || status === 403) return "SentryPoint Leads integration is not authorized.";
  return "SentryPoint Leads is temporarily unavailable.";
}
