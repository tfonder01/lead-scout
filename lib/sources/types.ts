export const WEBSITE_STATUSES = [
  "NONE",
  "HEALTHY",
  "WEAK",
  "UNREACHABLE",
  "UNKNOWN",
] as const;

export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const WEBSITE_SIGNALS = [
  "HTTPS",
  "PAGE_REACHABLE",
  "TITLE_PRESENT",
  "MOBILE_VIEWPORT",
  "CONTACT_LINK",
  "CONTACT_CTA",
  "FORM_FOUND",
  "PLACEHOLDER_MARKER",
  "BROKEN_PAGE_MARKER",
  "THIN_CONTENT",
  "HTTP_ONLY",
  "TITLE_MISSING",
  "VIEWPORT_MISSING",
  "CONTACT_SIGNAL_MISSING",
  "RESPONSE_FAST",
  "RESPONSE_MODERATE",
  "RESPONSE_SLOW",
] as const;

export type WebsiteSignal = (typeof WEBSITE_SIGNALS)[number];

export type WebsiteEnrichmentResult = {
  websiteStatus: WebsiteStatus;
  finalUrl: string | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  signals: WebsiteSignal[];
  checkedAt: string;
};

export type SearchFilters = {
  minimumRating?: number;
  minimumReviewCount?: number;
  recentReviewActivity?: boolean;
};

export type SearchMode = "single" | "batch";
export type ResultLimit = 10 | 25 | 50;

export type SearchBusinessesInput = {
  industry: string;
  location: string;
  mode?: SearchMode;
  locations?: string;
  queryVariants?: string;
  batchConfirmed?: boolean;
  resultLimit?: ResultLimit;
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
  operationalStatus: OperationalStatus;
  primaryType: string | null;
  pureServiceAreaBusiness: boolean | null;
  matchedLocations?: string[];
  matchedQueries?: string[];
  deduplicationMethod?: "SOURCE_BUSINESS_ID" | "NAME_PHONE_FALLBACK";
};

export type CandidateBusiness = SourceBusiness & {
  websiteStatus: WebsiteStatus;
  websiteSignals: WebsiteSignal[];
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
  metrics: SearchRunMetrics;
  resultLimit: ResultLimit;
  hasSearched: boolean;
  warning: string | null;
  error: string | null;
};

export type SearchRunMetrics = {
  plannedRequests: number;
  completedRequests: number;
  failedRequests: number;
  rawResultCount: number;
  uniqueResultCount: number;
  durationMs: number;
};
