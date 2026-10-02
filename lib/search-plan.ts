import type { BusinessSource } from "./sources/business-source.ts";
import type {
  SearchBusinessesInput,
  SearchFilters,
  SearchRunMetrics,
  SourceBusiness,
} from "./sources/types.ts";

export const MAX_BATCH_LOCATIONS = 8;
export const MAX_BATCH_QUERY_VARIANTS = 4;
export const MAX_BATCH_REQUESTS = 12;
export const BATCH_CONFIRMATION_THRESHOLD = 4;
export const GOOGLE_SEARCH_CONCURRENCY = 3;

export type SearchPlanItem = { query: string; location: string };

export type SearchPlan = {
  mode: "single" | "batch";
  locations: string[];
  queries: string[];
  items: SearchPlanItem[];
};

export class SearchPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchPlanError";
  }
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeQueryVariants(value: string): string[] {
  return uniqueValues(value.split(/[\n,]+/).map(normalizeValue));
}

export function normalizeLocations(value: string): string[] {
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return [];

  if (/[\n;]/.test(normalized)) {
    return uniqueValues(normalized.split(/[\n;]+/).map(normalizeValue));
  }

  const parts = normalized.split(",").map(normalizeValue).filter(Boolean);
  const locations: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const next = parts[index + 1];
    if (next && /^[A-Za-z]{2}$/.test(next)) {
      locations.push(`${parts[index]}, ${next.toUpperCase()}`);
      index += 1;
    } else {
      locations.push(parts[index]);
    }
  }
  return uniqueValues(locations);
}

export function calculateRequestCount(locations: string[], queries: string[]): number {
  return locations.length * queries.length;
}

export function createSearchPlan(input: SearchBusinessesInput): SearchPlan {
  if (input.mode !== undefined && input.mode !== "single" && input.mode !== "batch") {
    throw new SearchPlanError("Search mode is invalid.");
  }
  if (typeof input.industry !== "string" || input.industry.length > 80) {
    throw new SearchPlanError("Industry or primary query must be 80 characters or fewer.");
  }
  const industry = normalizeValue(input.industry);
  const mode = input.mode === "batch" ? "batch" : "single";
  if (!industry) throw new SearchPlanError("Enter an industry or primary query.");

  if (mode === "single") {
    if (typeof input.location !== "string" || input.location.length > 80) {
      throw new SearchPlanError("Location must be 80 characters or fewer.");
    }
    const location = normalizeValue(input.location);
    if (!location) throw new SearchPlanError("Enter a location.");
    return {
      mode,
      locations: [location],
      queries: [industry],
      items: [{ query: industry, location }],
    };
  }

  const rawLocations = input.locations ?? input.location;
  const rawVariants = input.queryVariants ?? "";
  if (typeof rawLocations !== "string" || rawLocations.length > 720) {
    throw new SearchPlanError("Batch locations must be 720 characters or fewer.");
  }
  if (typeof rawVariants !== "string" || rawVariants.length > 360) {
    throw new SearchPlanError("Related queries must be 360 characters or fewer.");
  }
  const locations = normalizeLocations(rawLocations);
  const queries = uniqueValues([
    industry,
    ...normalizeQueryVariants(rawVariants),
  ]);
  if (locations.length === 0) throw new SearchPlanError("Enter at least one location.");
  if (locations.length > MAX_BATCH_LOCATIONS) {
    throw new SearchPlanError(`Batch search supports at most ${MAX_BATCH_LOCATIONS} locations.`);
  }
  if (queries.length > MAX_BATCH_QUERY_VARIANTS) {
    throw new SearchPlanError(`Batch search supports at most ${MAX_BATCH_QUERY_VARIANTS} query variants including the primary query.`);
  }
  if (locations.some((location) => location.length > 80) || queries.some((query) => query.length > 80)) {
    throw new SearchPlanError("Each location and query must be 80 characters or fewer.");
  }

  const requestCount = calculateRequestCount(locations, queries);
  if (requestCount > MAX_BATCH_REQUESTS) {
    throw new SearchPlanError(`Reduce this plan to ${MAX_BATCH_REQUESTS} Google Places requests or fewer.`);
  }
  if (requestCount > BATCH_CONFIRMATION_THRESHOLD && !input.batchConfirmed) {
    throw new SearchPlanError(`Confirm the ${requestCount}-request batch before searching.`);
  }

  return {
    mode,
    locations,
    queries,
    items: locations.flatMap((location) =>
      queries.map((query) => ({ query, location })),
    ),
  };
}

function fallbackKey(business: SourceBusiness): string | null {
  const name = normalizeValue(business.businessName).toLocaleLowerCase();
  const phone = business.phone?.replace(/\D/g, "") ?? "";
  return name && phone ? `name-phone:${name}:${phone}` : null;
}

export function deduplicateBusinesses(
  results: Array<{ business: SourceBusiness; query: string; location: string }>,
): SourceBusiness[] {
  const deduplicated = new Map<string, SourceBusiness>();

  results.forEach(({ business, query, location }, index) => {
    const sourceId = normalizeValue(business.sourceBusinessId);
    const fallback = sourceId ? null : fallbackKey(business);
    const key = sourceId
      ? `source:${business.provider}:${sourceId}`
      : fallback ?? `unmatched:${business.provider}:${business.id}:${index}`;
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, {
        ...business,
        matchedLocations: [location],
        matchedQueries: [query],
        ...(sourceId
          ? { deduplicationMethod: "SOURCE_BUSINESS_ID" as const }
          : fallback
            ? { deduplicationMethod: "NAME_PHONE_FALLBACK" as const }
            : {}),
      });
      return;
    }

    if (!existing.phone && business.phone) existing.phone = business.phone;
    if (!existing.website && business.website) existing.website = business.website;
    if (existing.rating === null && business.rating !== null) existing.rating = business.rating;
    if (existing.reviewCount === null && business.reviewCount !== null) existing.reviewCount = business.reviewCount;
    if (!existing.sourceUrl && business.sourceUrl) existing.sourceUrl = business.sourceUrl;
    if (!existing.primaryType && business.primaryType) existing.primaryType = business.primaryType;
    if (existing.operationalStatus === "UNKNOWN" && business.operationalStatus !== "UNKNOWN") {
      existing.operationalStatus = business.operationalStatus;
    }
    if (!existing.matchedLocations?.some((value) => value.toLocaleLowerCase() === location.toLocaleLowerCase())) {
      existing.matchedLocations = [...(existing.matchedLocations ?? []), location];
    }
    if (!existing.matchedQueries?.some((value) => value.toLocaleLowerCase() === query.toLocaleLowerCase())) {
      existing.matchedQueries = [...(existing.matchedQueries ?? []), query];
    }
  });

  return [...deduplicated.values()];
}

export type SearchPlanExecution = {
  businesses: SourceBusiness[];
  metrics: SearchRunMetrics;
  executedRequestCount: number;
  firstFailure: unknown;
};

export async function executeSearchPlan(
  plan: SearchPlan,
  source: BusinessSource,
  filters: SearchFilters,
): Promise<SearchPlanExecution> {
  const startedAt = performance.now();
  const found: Array<{ business: SourceBusiness; query: string; location: string; planIndex: number; resultIndex: number }> = [];
  let nextIndex = 0;
  let completedRequests = 0;
  let failedRequests = 0;
  let executedRequestCount = 0;
  let firstFailure: unknown = null;

  async function worker(): Promise<void> {
    while (nextIndex < plan.items.length) {
      const planIndex = nextIndex++;
      const item = plan.items[planIndex];
      try {
        const businesses = await source.searchBusinesses({
          industry: item.query,
          location: item.location,
          filters,
        });
        executedRequestCount += 1;
        completedRequests += 1;
        businesses.forEach((business, resultIndex) => {
          found.push({ business, ...item, planIndex, resultIndex });
        });
      } catch (error) {
        failedRequests += 1;
        firstFailure ??= error;
        if (!(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "MISSING_API_KEY"
        )) executedRequestCount += 1;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(GOOGLE_SEARCH_CONCURRENCY, plan.items.length) },
      () => worker(),
    ),
  );
  found.sort((a, b) => a.planIndex - b.planIndex || a.resultIndex - b.resultIndex);
  const businesses = deduplicateBusinesses(found);
  return {
    businesses,
    executedRequestCount,
    firstFailure,
    metrics: {
      plannedRequests: plan.items.length,
      completedRequests,
      failedRequests,
      rawResultCount: found.length,
      uniqueResultCount: businesses.length,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}
