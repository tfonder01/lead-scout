"use server";

import { calculateLeadScore } from "@/lib/scoring/lead-score";
import {
  MOCK_DATA_AS_OF,
  mockBusinessSource,
} from "@/lib/sources/mock-source";
import type {
  CandidateBusiness,
  SearchBusinessesInput,
} from "@/lib/sources/types";
import { sortBusinesses } from "@/lib/results";

function cleanSearchValue(value: string): string {
  return value.trim().slice(0, 80);
}

export async function searchBusinesses(
  input: SearchBusinessesInput,
): Promise<CandidateBusiness[]> {
  const industry = cleanSearchValue(input.industry);
  const location = cleanSearchValue(input.location);

  if (!industry || !location) return [];

  const businesses = await mockBusinessSource.searchBusinesses({
    industry,
    location,
    filters: {
      minimumRating: Math.max(0, Math.min(5, input.filters?.minimumRating ?? 0)),
      minimumReviewCount: Math.max(0, input.filters?.minimumReviewCount ?? 0),
      recentReviewActivity: Boolean(input.filters?.recentReviewActivity),
    },
  });

  return sortBusinesses(
    businesses.map((business) => {
      const score = calculateLeadScore(business, MOCK_DATA_AS_OF);
      return {
        ...business,
        leadScore: score.score,
        scoreReasons: score.reasons,
      };
    }),
    "score",
  );
}

