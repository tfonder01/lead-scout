import type { PriorityBand } from "../sources/types";
import type { WebsiteEnrichedBusiness } from "../enrichment/website-enrichment.ts";
import { daysBetween } from "../utils/dates.ts";

export const LEAD_SCORE_WEIGHTS = {
  base: 30,
  reviewWithin14Days: 10,
  reviewWithin30Days: 6,
  reviewWithin90Days: 2,
  reviewOlderThanOneYear: -8,
  reviewNotRecent: -3,
  operational: 6,
  temporarilyClosed: -30,
  permanentlyClosed: -70,
  reviews100Plus: 8,
  reviews25Plus: 7,
  reviews10Plus: 4,
  reviewsUnder5: -8,
  rating47Plus: 8,
  rating44Plus: 6,
  rating40Plus: 3,
  ratingUnder35: -12,
  ratingBelow4: -4,
  noWebsite: 30,
  unreachableWebsite: 25,
  weakWebsite: 25,
  unknownWebsite: 0,
  healthyWebsite: -20,
  publicPhone: 10,
  missingPhone: -20,
  highValueIndustry: 4,
  likelyInactive: -15,
} as const;

const HIGH_VALUE_CATEGORIES = new Set([
  "Tree Service",
  "Roofing",
  "Painting",
  "Landscaping",
]);

export type LeadScoreResult = {
  score: number;
  reasons: string[];
};

export function calculateLeadScore(
  business: WebsiteEnrichedBusiness,
  referenceDate: string,
): LeadScoreResult {
  let score = LEAD_SCORE_WEIGHTS.base;
  const reasons: string[] = [];
  const reviewAge = business.latestReviewDate
    ? daysBetween(business.latestReviewDate, referenceDate)
    : null;

  if (reviewAge !== null && reviewAge <= 14) {
    score += LEAD_SCORE_WEIGHTS.reviewWithin14Days;
    reasons.push(`+ Recent review ${reviewAge === 0 ? "today" : `${reviewAge} days ago`}`);
  } else if (reviewAge !== null && reviewAge <= 30) {
    score += LEAD_SCORE_WEIGHTS.reviewWithin30Days;
    reasons.push(`+ Review within 30 days (${reviewAge} days ago)`);
  } else if (reviewAge !== null && reviewAge <= 90) {
    score += LEAD_SCORE_WEIGHTS.reviewWithin90Days;
    reasons.push(`+ Review activity ${reviewAge} days ago`);
  } else if (reviewAge !== null && reviewAge > 365) {
    score += LEAD_SCORE_WEIGHTS.reviewOlderThanOneYear;
    reasons.push(`- Latest review over ${Math.floor(reviewAge / 365)} year${reviewAge >= 730 ? "s" : ""} ago`);
  } else if (reviewAge !== null) {
    score += LEAD_SCORE_WEIGHTS.reviewNotRecent;
    reasons.push("- No review activity in the last 90 days");
  }

  if (business.reviewCount !== null && business.reviewCount >= 100) {
    score += LEAD_SCORE_WEIGHTS.reviews100Plus;
    reasons.push(`+ ${business.reviewCount} reviews`);
  } else if (business.reviewCount !== null && business.reviewCount >= 25) {
    score += LEAD_SCORE_WEIGHTS.reviews25Plus;
    reasons.push(`+ ${business.reviewCount} reviews`);
  } else if (business.reviewCount !== null && business.reviewCount >= 10) {
    score += LEAD_SCORE_WEIGHTS.reviews10Plus;
    reasons.push(`+ ${business.reviewCount} reviews`);
  } else if (business.reviewCount !== null && business.reviewCount < 5) {
    score += LEAD_SCORE_WEIGHTS.reviewsUnder5;
    reasons.push(`- Only ${business.reviewCount} review${business.reviewCount === 1 ? "" : "s"}`);
  }

  if (business.rating !== null && business.rating >= 4.7) {
    score += LEAD_SCORE_WEIGHTS.rating47Plus;
    reasons.push(`+ Strong ${business.rating.toFixed(1)} rating`);
  } else if (business.rating !== null && business.rating >= 4.4) {
    score += LEAD_SCORE_WEIGHTS.rating44Plus;
    reasons.push(`+ Solid ${business.rating.toFixed(1)} rating`);
  } else if (business.rating !== null && business.rating >= 4) {
    score += LEAD_SCORE_WEIGHTS.rating40Plus;
    reasons.push(`+ ${business.rating.toFixed(1)} rating`);
  } else if (business.rating !== null && business.rating < 3.5) {
    score += LEAD_SCORE_WEIGHTS.ratingUnder35;
    reasons.push(`- Poor ${business.rating.toFixed(1)} rating`);
  } else if (business.rating !== null) {
    score += LEAD_SCORE_WEIGHTS.ratingBelow4;
    reasons.push(`- Average ${business.rating.toFixed(1)} rating`);
  }

  const websiteStatus = business.websiteEnrichment.websiteStatus;
  const websiteReason: Record<typeof websiteStatus, [number, string]> = {
    NONE: [LEAD_SCORE_WEIGHTS.noWebsite, "+ No website listed"],
    UNREACHABLE: [LEAD_SCORE_WEIGHTS.unreachableWebsite, "+ Website landing page was unreachable"],
    WEAK: [LEAD_SCORE_WEIGHTS.weakWebsite, "+ Website has basic opportunity signals"],
    UNKNOWN: [LEAD_SCORE_WEIGHTS.unknownWebsite, "- Website opportunity could not be classified"],
    HEALTHY: [LEAD_SCORE_WEIGHTS.healthyWebsite, "- Website has healthy sales-fit signals"],
  };
  score += websiteReason[websiteStatus][0];
  reasons.push(websiteReason[websiteStatus][1]);

  if (business.phone) {
    score += LEAD_SCORE_WEIGHTS.publicPhone;
    reasons.push("+ Public phone available");
  } else {
    score += LEAD_SCORE_WEIGHTS.missingPhone;
    reasons.push("- No public phone found");
  }

  if (HIGH_VALUE_CATEGORIES.has(business.category)) {
    score += LEAD_SCORE_WEIGHTS.highValueIndustry;
    reasons.push("+ High-value service category");
  }

  if (business.operationalStatus === "OPERATIONAL") {
    score += LEAD_SCORE_WEIGHTS.operational;
    reasons.push("+ Listed as operational");
  } else if (business.operationalStatus === "CLOSED_TEMPORARILY") {
    score += LEAD_SCORE_WEIGHTS.temporarilyClosed;
    reasons.push("- Listed as temporarily closed");
  } else if (business.operationalStatus === "CLOSED_PERMANENTLY") {
    score += LEAD_SCORE_WEIGHTS.permanentlyClosed;
    reasons.push("- Listed as permanently closed");
  }

  if (
    reviewAge !== null &&
    reviewAge > 730 &&
    (!business.phone || websiteStatus === "UNREACHABLE")
  ) {
    score += LEAD_SCORE_WEIGHTS.likelyInactive;
    reasons.push("- Multiple signs suggest the business may be inactive");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function getPriorityBand(score: number): PriorityBand {
  if (score >= 80) return "HIGH";
  if (score >= 60) return "REVIEW";
  return "LOW";
}
