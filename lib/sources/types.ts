export const WEBSITE_STATUSES = [
  "NONE",
  "HEALTHY",
  "WEAK",
  "UNREACHABLE",
  "UNKNOWN",
] as const;

export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export type SearchFilters = {
  minimumRating?: number;
  minimumReviewCount?: number;
  recentReviewActivity?: boolean;
};

export type SearchBusinessesInput = {
  industry: string;
  location: string;
  filters?: SearchFilters;
};

export type SourceBusiness = {
  id: string;
  businessName: string;
  category: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number;
  reviewCount: number;
  latestReviewDate: string;
  source: string;
  sourceBusinessId: string;
  sourceUrl?: string;
  websiteStatus: WebsiteStatus;
};

export type CandidateBusiness = SourceBusiness & {
  leadScore: number;
  scoreReasons: string[];
};

export type PriorityBand = "HIGH" | "REVIEW" | "LOW";

