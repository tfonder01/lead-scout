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

export const OPERATIONAL_STATUSES = [
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
  "UNKNOWN",
] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export type BusinessProvider = "MOCK" | "GOOGLE_PLACES";

export type SourceBusiness = {
  id: string;
  businessName: string;
  category: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  latestReviewDate: string | null;
  source: string;
  provider: BusinessProvider;
  sourceBusinessId: string;
  sourceUrl?: string;
  websiteStatus: WebsiteStatus;
  operationalStatus: OperationalStatus;
  primaryType: string | null;
  pureServiceAreaBusiness: boolean | null;
};

export type CandidateBusiness = SourceBusiness & {
  leadScore: number;
  scoreReasons: string[];
};

export type PriorityBand = "HIGH" | "REVIEW" | "LOW";

export type SearchBusinessesResult = {
  businesses: CandidateBusiness[];
  provider: BusinessProvider;
  providerLabel: string;
  referenceDate: string;
  supportsReviewRecency: boolean;
  requestCount: number;
  hasSearched: boolean;
  error: string | null;
};
