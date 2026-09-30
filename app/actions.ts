"use server";

import { sortBusinesses } from "../lib/results.ts";
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
import type {
  SearchBusinessesInput,
  SearchBusinessesResult,
} from "../lib/sources/types.ts";

function cleanSearchValue(value: string): string {
  return value.trim().slice(0, 80);
}

export async function searchBusinesses(
  input: SearchBusinessesInput,
): Promise<SearchBusinessesResult> {
  const industry = cleanSearchValue(input.industry);
  const location = cleanSearchValue(input.location);

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
      hasSearched: true,
      error: "Lead Scout provider configuration is invalid.",
    };
  }

  const referenceDate = selected.provider === "MOCK"
    ? MOCK_DATA_AS_OF
    : new Date().toISOString().slice(0, 10);

  const emptyResult = (error: string | null): SearchBusinessesResult => ({
    businesses: [],
    provider: selected.provider,
    providerLabel: selected.providerLabel,
    referenceDate,
    supportsReviewRecency: selected.supportsReviewRecency,
    requestCount: 0,
    hasSearched: true,
    error,
  });

  if (!industry || !location) return emptyResult(null);

  try {
    const businesses = await selected.source.searchBusinesses({
      industry,
      location,
      filters: {
        minimumRating: Math.max(0, Math.min(5, input.filters?.minimumRating ?? 0)),
        minimumReviewCount: Math.max(0, input.filters?.minimumReviewCount ?? 0),
        recentReviewActivity:
          selected.supportsReviewRecency &&
          Boolean(input.filters?.recentReviewActivity),
      },
    });

    const enrichment = await enrichBusinessWebsites(
      businesses,
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

    return {
      ...emptyResult(null),
      businesses: sortBusinesses(
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
      ),
      requestCount: selected.provider === "GOOGLE_PLACES" ? 1 : 0,
    };
  } catch (error) {
    if (error instanceof GooglePlacesSourceError) {
      console.warn("Lead Scout provider failure", {
        provider: "google",
        code: error.code,
      });
      return emptyResult(error.message);
    }

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
        hasSearched: false,
        error: null,
      };
    }
  } catch {
    // searchBusinesses returns the safe configuration error contract.
  }

  return searchBusinesses(input);
}
