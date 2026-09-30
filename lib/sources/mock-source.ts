import type { BusinessSource } from "./business-source";
import type { SearchBusinessesInput, SourceBusiness } from "./types";
import { daysBetween } from "../utils/dates.ts";

export const MOCK_DATA_AS_OF = "2026-09-28";

const RAW_MOCK_BUSINESSES: Array<
  Omit<
    SourceBusiness,
    "provider" | "operationalStatus" | "primaryType" | "pureServiceAreaBusiness"
  >
> = [
  {
    id: "mock-tree-001",
    businessName: "Canopy Crew Tree Care",
    category: "Tree Service",
    address: "1427 Fern Creek Ave, Orlando, FL",
    phone: "(407) 555-0101",
    website: null,
    rating: 4.8,
    reviewCount: 84,
    latestReviewDate: "2026-09-23",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-TREE-001",
    sourceUrl: "https://example.com/mock-listings/MLD-TREE-001",
    websiteStatus: "NONE",
  },
  {
    id: "mock-tree-002",
    businessName: "Pine & Palm Arbor Works",
    category: "Tree Service",
    address: "608 Lake Underhill Rd, Orlando, FL",
    phone: "(407) 555-0102",
    website: "https://pinepalmarbor.example",
    rating: 4.6,
    reviewCount: 46,
    latestReviewDate: "2026-09-11",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-TREE-002",
    sourceUrl: "https://example.com/mock-listings/MLD-TREE-002",
    websiteStatus: "WEAK",
  },
  {
    id: "mock-tree-003",
    businessName: "Sunline Tree & Stump",
    category: "Tree Service",
    address: "3910 Edgewater Dr, Orlando, FL",
    phone: "(407) 555-0103",
    website: "https://sunlinetree.example",
    rating: 4.9,
    reviewCount: 211,
    latestReviewDate: "2026-09-27",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-TREE-003",
    sourceUrl: "https://example.com/mock-listings/MLD-TREE-003",
    websiteStatus: "HEALTHY",
  },
  {
    id: "mock-tree-004",
    businessName: "Old Mill Tree Removal",
    category: "Tree Service",
    address: "924 Mercy Dr, Orlando, FL",
    phone: null,
    website: "https://oldmilltree.example",
    rating: 3.3,
    reviewCount: 3,
    latestReviewDate: "2023-04-08",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-TREE-004",
    sourceUrl: "https://example.com/mock-listings/MLD-TREE-004",
    websiteStatus: "UNREACHABLE",
  },
  {
    id: "mock-paint-001",
    businessName: "Juniper House Painting",
    category: "Painting",
    address: "725 Fairbanks Ave, Winter Park, FL",
    phone: "(407) 555-0111",
    website: null,
    rating: 4.7,
    reviewCount: 37,
    latestReviewDate: "2026-09-19",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-PAINT-001",
    sourceUrl: "https://example.com/mock-listings/MLD-PAINT-001",
    websiteStatus: "NONE",
  },
  {
    id: "mock-paint-002",
    businessName: "Roller & Reed Painting Co.",
    category: "Painting",
    address: "1515 Lee Rd, Winter Park, FL",
    phone: "(407) 555-0112",
    website: "https://rollerreed.example",
    rating: 4.5,
    reviewCount: 118,
    latestReviewDate: "2026-08-14",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-PAINT-002",
    sourceUrl: "https://example.com/mock-listings/MLD-PAINT-002",
    websiteStatus: "HEALTHY",
  },
  {
    id: "mock-paint-003",
    businessName: "Citrus Coat Painters",
    category: "Painting",
    address: "2468 Curry Ford Rd, Orlando, FL",
    phone: "(407) 555-0113",
    website: "https://citruscoat.example",
    rating: 4.2,
    reviewCount: 16,
    latestReviewDate: "2026-09-03",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-PAINT-003",
    sourceUrl: "https://example.com/mock-listings/MLD-PAINT-003",
    websiteStatus: "WEAK",
  },
  {
    id: "mock-roof-001",
    businessName: "Copper Ridge Roofing",
    category: "Roofing",
    address: "410 E State Rd 434, Longwood, FL",
    phone: "(407) 555-0121",
    website: "https://copperridgeroofing.example",
    rating: 4.8,
    reviewCount: 164,
    latestReviewDate: "2026-09-25",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-ROOF-001",
    sourceUrl: "https://example.com/mock-listings/MLD-ROOF-001",
    websiteStatus: "WEAK",
  },
  {
    id: "mock-roof-002",
    businessName: "Blue Heron Roof Repair",
    category: "Roofing",
    address: "888 W Colonial Dr, Orlando, FL",
    phone: "(407) 555-0122",
    website: null,
    rating: 4.6,
    reviewCount: 29,
    latestReviewDate: "2026-09-17",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-ROOF-002",
    sourceUrl: "https://example.com/mock-listings/MLD-ROOF-002",
    websiteStatus: "NONE",
  },
  {
    id: "mock-roof-003",
    businessName: "Heritage Peak Exteriors",
    category: "Roofing",
    address: "320 Douglas Ave, Altamonte Springs, FL",
    phone: "(407) 555-0123",
    website: "https://heritagepeak.example",
    rating: 4.9,
    reviewCount: 386,
    latestReviewDate: "2026-09-26",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-ROOF-003",
    sourceUrl: "https://example.com/mock-listings/MLD-ROOF-003",
    websiteStatus: "HEALTHY",
  },
  {
    id: "mock-handyman-001",
    businessName: "Lake Eola Handyman Co.",
    category: "Handyman",
    address: "55 N Rosalind Ave, Orlando, FL",
    phone: "(407) 555-0131",
    website: null,
    rating: 4.8,
    reviewCount: 12,
    latestReviewDate: "2026-09-24",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-HANDY-001",
    sourceUrl: "https://example.com/mock-listings/MLD-HANDY-001",
    websiteStatus: "NONE",
  },
  {
    id: "mock-handyman-002",
    businessName: "Fixwell Home Services",
    category: "Handyman",
    address: "7300 Sand Lake Rd, Orlando, FL",
    phone: null,
    website: "https://fixwellhome.example",
    rating: 4.1,
    reviewCount: 8,
    latestReviewDate: "2026-04-20",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-HANDY-002",
    sourceUrl: "https://example.com/mock-listings/MLD-HANDY-002",
    websiteStatus: "UNKNOWN",
  },
  {
    id: "mock-land-001",
    businessName: "Mossline Landscape Works",
    category: "Landscaping",
    address: "1160 N Orange Ave, Winter Park, FL",
    phone: "(407) 555-0141",
    website: "https://mossline.example",
    rating: 4.7,
    reviewCount: 73,
    latestReviewDate: "2026-09-16",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-LAND-001",
    sourceUrl: "https://example.com/mock-listings/MLD-LAND-001",
    websiteStatus: "UNREACHABLE",
  },
  {
    id: "mock-land-002",
    businessName: "Green Current Lawn Co.",
    category: "Landscaping",
    address: "1021 Druid Rd, Maitland, FL",
    phone: "(407) 555-0142",
    website: "https://greencurrent.example",
    rating: 3.9,
    reviewCount: 22,
    latestReviewDate: "2025-11-07",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-LAND-002",
    sourceUrl: "https://example.com/mock-listings/MLD-LAND-002",
    websiteStatus: "WEAK",
  },
  {
    id: "mock-land-003",
    businessName: "Seminole Yard & Garden",
    category: "Landscaping",
    address: "441 Central Blvd, Sanford, FL",
    phone: "(407) 555-0143",
    website: null,
    rating: 4.4,
    reviewCount: 4,
    latestReviewDate: "2026-09-08",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-LAND-003",
    sourceUrl: "https://example.com/mock-listings/MLD-LAND-003",
    websiteStatus: "NONE",
  },
  {
    id: "mock-detail-001",
    businessName: "Gloss District Auto Detail",
    category: "Auto Detailing",
    address: "6400 University Blvd, Winter Park, FL",
    phone: "(407) 555-0151",
    website: "https://glossdistrict.example",
    rating: 4.9,
    reviewCount: 97,
    latestReviewDate: "2026-09-28",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-AUTO-001",
    sourceUrl: "https://example.com/mock-listings/MLD-AUTO-001",
    websiteStatus: "HEALTHY",
  },
  {
    id: "mock-detail-002",
    businessName: "Clean Lane Mobile Detailing",
    category: "Auto Detailing",
    address: "3900 S Orange Ave, Orlando, FL",
    phone: "(407) 555-0152",
    website: null,
    rating: 4.6,
    reviewCount: 41,
    latestReviewDate: "2026-09-21",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-AUTO-002",
    sourceUrl: "https://example.com/mock-listings/MLD-AUTO-002",
    websiteStatus: "NONE",
  },
  {
    id: "mock-detail-003",
    businessName: "Parkway Polish Garage",
    category: "Auto Detailing",
    address: "1220 E Altamonte Dr, Altamonte Springs, FL",
    phone: "(407) 555-0153",
    website: "https://parkwaypolish.example",
    rating: 3.4,
    reviewCount: 2,
    latestReviewDate: "2024-01-12",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-AUTO-003",
    sourceUrl: "https://example.com/mock-listings/MLD-AUTO-003",
    websiteStatus: "UNREACHABLE",
  },
  {
    id: "mock-pressure-001",
    businessName: "Brick & Bloom Pressure Washing",
    category: "Pressure Washing",
    address: "2601 Corrine Dr, Orlando, FL",
    phone: "(407) 555-0161",
    website: "https://brickbloom.example",
    rating: 4.7,
    reviewCount: 31,
    latestReviewDate: "2026-09-22",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-WASH-001",
    sourceUrl: "https://example.com/mock-listings/MLD-WASH-001",
    websiteStatus: "WEAK",
  },
  {
    id: "mock-fence-001",
    businessName: "Cypress Line Fence Co.",
    category: "Fencing",
    address: "1776 Aloma Ave, Winter Park, FL",
    phone: "(407) 555-0171",
    website: null,
    rating: 4.5,
    reviewCount: 19,
    latestReviewDate: "2026-08-31",
    source: "Mock Local Directory",
    sourceBusinessId: "MLD-FENCE-001",
    sourceUrl: "https://example.com/mock-listings/MLD-FENCE-001",
    websiteStatus: "NONE",
  },
];

const MOCK_BUSINESSES: SourceBusiness[] = RAW_MOCK_BUSINESSES.map((business) => ({
  ...business,
  provider: "MOCK",
  operationalStatus: "UNKNOWN",
  primaryType: null,
  pureServiceAreaBusiness: null,
}));

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export class MockBusinessSource implements BusinessSource {
  readonly name = "Mock Local Directory";

  async searchBusinesses({
    industry,
    location,
    filters = {},
  }: SearchBusinessesInput): Promise<SourceBusiness[]> {
    const normalizedIndustry = normalize(industry);
    const normalizedLocation = normalize(location);

    return MOCK_BUSINESSES.filter((business) => {
      const industryMatches =
        !normalizedIndustry ||
        normalize(business.category).includes(normalizedIndustry) ||
        normalize(business.businessName).includes(normalizedIndustry);
      const locationMatches =
        !normalizedLocation || normalize(business.address).includes(normalizedLocation);
      const ratingMatches = (business.rating ?? 0) >= (filters.minimumRating ?? 0);
      const reviewCountMatches =
        (business.reviewCount ?? 0) >= (filters.minimumReviewCount ?? 0);
      const recentMatches =
        !filters.recentReviewActivity ||
        (business.latestReviewDate !== null &&
          daysBetween(business.latestReviewDate, MOCK_DATA_AS_OF) <= 30);

      return (
        industryMatches &&
        locationMatches &&
        ratingMatches &&
        reviewCountMatches &&
        recentMatches
      );
    }).map((business) => ({ ...business }));
  }
}

export const mockBusinessSource = new MockBusinessSource();
