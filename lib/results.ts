import type { CandidateBusiness, ResultLimit } from "./sources/types";
import { getPriorityBand } from "./scoring/lead-score.ts";
import { daysBetween } from "./utils/dates.ts";

export type ResultSort = "score" | "reviews" | "newest";
export type ResultFilter = "all" | "high" | "none" | "weak" | "recent";

export function filterBusinesses(
  businesses: CandidateBusiness[],
  filter: ResultFilter,
  referenceDate: string,
): CandidateBusiness[] {
  return businesses.filter((business) => {
    if (filter === "high") return getPriorityBand(business.leadScore) === "HIGH";
    if (filter === "none") return business.websiteStatus === "NONE";
    if (filter === "weak") return business.websiteStatus === "WEAK";
    if (filter === "recent") {
      return business.latestReviewDate !== null &&
        daysBetween(business.latestReviewDate, referenceDate) <= 30;
    }
    return true;
  });
}

export function sortBusinesses(
  businesses: CandidateBusiness[],
  sort: ResultSort,
): CandidateBusiness[] {
  return [...businesses].sort((a, b) => {
    if (sort === "reviews") return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
    if (sort === "newest") {
      return (b.latestReviewDate ? Date.parse(b.latestReviewDate) : 0) -
        (a.latestReviewDate ? Date.parse(a.latestReviewDate) : 0);
    }
    return b.leadScore - a.leadScore ||
      (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
  });
}

export function limitBusinesses(
  businesses: CandidateBusiness[],
  limit: ResultLimit,
): CandidateBusiness[] {
  return businesses.slice(0, limit);
}
