"use server";

import { limitBusinesses, sortBusinesses } from "../lib/results.ts";
import {
  createSearchPlan,
  executeSearchPlan,
  SearchPlanError,
} from "../lib/search-plan.ts";
import {
  createMockWebsiteEnrichment,
  enrichBusinessWebsites,
} from "../lib/enrichment/website-enrichment.ts";
import { calculateLeadScore } from "../lib/scoring/lead-score.ts";
import { GooglePlacesSourceError } from "../lib/sources/google-places-source.ts";
import {
  getMockWebsiteStatus,
  MOCK_DATA_AS_OF,
} from "../lib/sources/mock-source.ts";
import { selectBusinessSource } from "../lib/sources/provider.ts";
import { addCandidateToSentryPoint, type AddLeadResult } from "../lib/sentrypoint-leads.ts";
import type { CandidateBusiness } from "../lib/sources/types.ts";

export async function addToSentryPointLeads(business: CandidateBusiness): Promise<AddLeadResult> {
  return addCandidateToSentryPoint(business);
}
import type {
  SearchBusinessesInput,
  SearchBusinessesResult,
} from "../lib/sources/types.ts";

const EMPTY_METRICS = {
  plannedRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  rawResultCount: 0,
  uniqueResultCount: 0,
  durationMs: 0,
} as const;

export async function searchBusinesses(
  input: SearchBusinessesInput,
): Promise<SearchBusinessesResult> {
  let selected;
  try {
    selected = selectBusinessSource();
  } catch {
    return {
      businesses: [],
      provider: "MOCK",
      providerLabel: "Configuration error",
      referenceDate: MOCK_DATA_AS_OF,
      supportsReviewRecency: false,
      requestCount: 0,
      metrics: EMPTY_METRICS,
      resultLimit: 25,
      hasSearched: true,
      warning: null,
      error: "Lead Scout provider configuration is invalid.",
    };
  }

  const referenceDate = selected.provider === "MOCK"
    ? MOCK_DATA_AS_OF
    : new Date().toISOString().slice(0, 10);

  const resultLimit = input.resultLimit === 10 || input.resultLimit === 50
    ? input.resultLimit
    : 25;
  const emptyResult = (error: string | null): SearchBusinessesResult => ({
    businesses: [],
    provider: selected.provider,
    providerLabel: selected.providerLabel,
    referenceDate,
    supportsReviewRecency: selected.supportsReviewRecency,
    requestCount: 0,
    metrics: EMPTY_METRICS,
    resultLimit,
    hasSearched: true,
    warning: null,
    error,
  });

  let plan;
  try {
    plan = createSearchPlan(input);
  } catch (error) {
    return emptyResult(
      error instanceof SearchPlanError ? error.message : "Search plan is invalid.",
    );
  }

  try {
    const minimumRating = input.filters?.minimumRating;
    const minimumReviewCount = input.filters?.minimumReviewCount;
    const execution = await executeSearchPlan(plan, selected.source, {
      minimumRating: typeof minimumRating === "number" && Number.isFinite(minimumRating)
        ? Math.max(0, Math.min(5, minimumRating))
        : 0,
      minimumReviewCount:
        typeof minimumReviewCount === "number" && Number.isFinite(minimumReviewCount)
          ? Math.max(0, minimumReviewCount)
          : 0,
      recentReviewActivity:
        selected.supportsReviewRecency &&
        Boolean(input.filters?.recentReviewActivity),
    });

    if (execution.metrics.completedRequests === 0) {
      if (execution.firstFailure instanceof GooglePlacesSourceError) {
        console.warn("Lead Scout provider failure", {
          provider: "google",
          code: execution.firstFailure.code,
          plannedRequests: execution.metrics.plannedRequests,
          failedRequests: execution.metrics.failedRequests,
        });
        return {
          ...emptyResult(execution.firstFailure.message),
          requestCount: selected.provider === "GOOGLE_PLACES"
            ? execution.executedRequestCount
            : 0,
          metrics: execution.metrics,
        };
      }
      return {
        ...emptyResult("Lead Scout search is temporarily unavailable."),
        requestCount: selected.provider === "GOOGLE_PLACES"
          ? execution.executedRequestCount
          : 0,
        metrics: execution.metrics,
      };
    }

    const enrichment = await enrichBusinessWebsites(
      execution.businesses,
      selected.provider === "MOCK"
        ? async (business) => createMockWebsiteEnrichment(
            business,
            getMockWebsiteStatus(business.id),
            `${referenceDate}T00:00:00.000Z`,
          )
        : undefined,
    );

    console.info("Lead Scout website enrichment", {
      provider: selected.provider.toLowerCase(),
      checked: enrichment.metrics.checked,
      skipped: enrichment.metrics.skipped,
      statusCounts: enrichment.metrics.statusCounts,
      durationMs: enrichment.metrics.durationMs,
    });

    console.info("Lead Scout search run", {
      provider: selected.provider.toLowerCase(),
      plannedRequests: execution.metrics.plannedRequests,
      completedRequests: execution.metrics.completedRequests,
      failedRequests: execution.metrics.failedRequests,
      rawResultCount: execution.metrics.rawResultCount,
      uniqueResultCount: execution.metrics.uniqueResultCount,
      durationMs: execution.metrics.durationMs,
    });

    const ranked = sortBusinesses(
      enrichment.businesses.map((business) => {
        const score = calculateLeadScore(business, referenceDate);
        const { websiteEnrichment, ...providerBusiness } = business;
        return {
          ...providerBusiness,
          website: websiteEnrichment.finalUrl,
          websiteStatus: websiteEnrichment.websiteStatus,
          websiteSignals: websiteEnrichment.signals,
          leadScore: score.score,
          scoreReasons: score.reasons,
        };
      }),
      "score",
    );

    return {
      ...emptyResult(null),
      businesses: limitBusinesses(ranked, resultLimit),
      requestCount: selected.provider === "GOOGLE_PLACES"
        ? execution.executedRequestCount
        : 0,
      metrics: execution.metrics,
      warning: execution.metrics.failedRequests > 0
        ? `${execution.metrics.failedRequests} search request${execution.metrics.failedRequests === 1 ? "" : "s"} failed. Successful results are shown.`
        : null,
    };
  } catch {
    console.error("Lead Scout search failed", { provider: selected.provider });
    return emptyResult("Lead Scout search is temporarily unavailable.");
  }
}

export async function getInitialSearchResult(
  input: SearchBusinessesInput,
): Promise<SearchBusinessesResult> {
  try {
    const selected = selectBusinessSource();
    if (selected.provider === "GOOGLE_PLACES") {
      return {
        businesses: [],
        provider: selected.provider,
        providerLabel: selected.providerLabel,
        referenceDate: new Date().toISOString().slice(0, 10),
        supportsReviewRecency: false,
        requestCount: 0,
        metrics: EMPTY_METRICS,
        resultLimit: input.resultLimit ?? 25,
        hasSearched: false,
        warning: null,
        error: null,
      };
    }
  } catch {
    // searchBusinesses returns the safe configuration error contract.
  }

  return searchBusinesses(input);
}
