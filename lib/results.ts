import type { CandidateBusiness } from "./sources/types";
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
      return daysBetween(business.latestReviewDate, referenceDate) <= 30;
    }
    return true;
  });
}

export function sortBusinesses(
  businesses: CandidateBusiness[],
  sort: ResultSort,
): CandidateBusiness[] {
  return [...businesses].sort((a, b) => {
    if (sort === "reviews") return b.reviewCount - a.reviewCount;
    if (sort === "newest") {
      return Date.parse(b.latestReviewDate) - Date.parse(a.latestReviewDate);
    }
    return b.leadScore - a.leadScore || b.reviewCount - a.reviewCount;
  });
}
