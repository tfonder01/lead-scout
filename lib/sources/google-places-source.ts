import type { BusinessSource } from "./business-source";
import type {
  OperationalStatus,
  SearchBusinessesInput,
  SourceBusiness,
} from "./types";

export const GOOGLE_PLACES_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchText";

export const GOOGLE_PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.pureServiceAreaBusiness",
].join(",");

const REQUEST_TIMEOUT_MS = 8_000;

type GoogleLocalizedText = { text?: unknown };

type GooglePlace = {
  id?: unknown;
  displayName?: GoogleLocalizedText;
  formattedAddress?: unknown;
  nationalPhoneNumber?: unknown;
  websiteUri?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  businessStatus?: unknown;
  googleMapsUri?: unknown;
  primaryType?: unknown;
  primaryTypeDisplayName?: GoogleLocalizedText;
  pureServiceAreaBusiness?: unknown;
};

type GooglePlacesResponse = { places?: unknown };

export class GooglePlacesSourceError extends Error {
  readonly code:
    | "MISSING_API_KEY"
    | "UPSTREAM_UNAVAILABLE"
    | "UPSTREAM_REJECTED"
    | "MALFORMED_RESPONSE";

  constructor(
    message: string,
    code:
      | "MISSING_API_KEY"
      | "UPSTREAM_UNAVAILABLE"
      | "UPSTREAM_REJECTED"
      | "MALFORMED_RESPONSE",
  ) {
    super(message);
    this.name = "GooglePlacesSourceError";
    this.code = code;
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalRating(value: unknown): number | null {
  const rating = optionalNumber(value);
  return rating !== null && rating >= 0 && rating <= 5 ? rating : null;
}

function optionalReviewCount(value: unknown): number | null {
  const count = optionalNumber(value);
  return count !== null && Number.isInteger(count) && count >= 0 ? count : null;
}

function safeExternalUrl(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function normalizeOperationalStatus(value: unknown): OperationalStatus {
  if (value === "OPERATIONAL") return "OPERATIONAL";
  if (value === "CLOSED_TEMPORARILY") return "CLOSED_TEMPORARILY";
  if (value === "CLOSED_PERMANENTLY") return "CLOSED_PERMANENTLY";
  return "UNKNOWN";
}

export function normalizeGooglePlace(
  place: GooglePlace,
  requestedIndustry: string,
): SourceBusiness | null {
  const sourceBusinessId = optionalString(place.id);
  const businessName = optionalString(place.displayName?.text);
  if (!sourceBusinessId || !businessName) return null;

  const website = safeExternalUrl(place.websiteUri);
  const sourceUrl = safeExternalUrl(place.googleMapsUri);
  const primaryType = optionalString(place.primaryType);
  const primaryTypeDisplayName = optionalString(place.primaryTypeDisplayName?.text);

  return {
    id: `google-${sourceBusinessId}`,
    businessName,
    category: primaryTypeDisplayName ?? requestedIndustry,
    address: optionalString(place.formattedAddress) ?? "Service area business",
    phone: optionalString(place.nationalPhoneNumber),
    website,
    rating: optionalRating(place.rating),
    reviewCount: optionalReviewCount(place.userRatingCount),
    latestReviewDate: null,
    source: "Google Maps",
    provider: "GOOGLE_PLACES",
    sourceBusinessId,
    ...(sourceUrl ? { sourceUrl } : {}),
    operationalStatus: normalizeOperationalStatus(place.businessStatus),
    primaryType,
    pureServiceAreaBusiness:
      typeof place.pureServiceAreaBusiness === "boolean"
        ? place.pureServiceAreaBusiness
        : null,
  };
}

export class GooglePlacesBusinessSource implements BusinessSource {
  readonly name = "Google Places";
  private readonly apiKey: string | undefined;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    apiKey = process.env.GOOGLE_PLACES_API_KEY,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
  }

  async searchBusinesses({
    industry,
    location,
    filters = {},
  }: SearchBusinessesInput): Promise<SourceBusiness[]> {
    if (!this.apiKey) {
      throw new GooglePlacesSourceError(
        "Google Places API key is not configured.",
        "MISSING_API_KEY",
      );
    }

    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImplementation(GOOGLE_PLACES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: `${industry} in ${location}`,
          includePureServiceAreaBusinesses: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const code = response.status >= 500 || response.status === 429
          ? "UPSTREAM_UNAVAILABLE"
          : "UPSTREAM_REJECTED";
        throw new GooglePlacesSourceError(
          "Google Places search is temporarily unavailable.",
          code,
        );
      }

      let payload: GooglePlacesResponse;
      try {
        const value: unknown = await response.json();
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw new Error("Invalid response shape");
        }
        payload = value as GooglePlacesResponse;
      } catch {
        throw new GooglePlacesSourceError(
          "Google Places returned an invalid response.",
          "MALFORMED_RESPONSE",
        );
      }

      if (payload.places !== undefined && !Array.isArray(payload.places)) {
        throw new GooglePlacesSourceError(
          "Google Places returned an invalid response.",
          "MALFORMED_RESPONSE",
        );
      }

      const places = (payload.places ?? []) as GooglePlace[];
      const normalized = places
        .map((place) =>
          typeof place === "object" && place !== null
            ? normalizeGooglePlace(place, industry)
            : null,
        )
        .filter((place): place is SourceBusiness => place !== null);

      if (places.length > 0 && normalized.length === 0) {
        throw new GooglePlacesSourceError(
          "Google Places returned an invalid response.",
          "MALFORMED_RESPONSE",
        );
      }

      const filtered = normalized.filter((business) => {
        const ratingMatches =
          !filters.minimumRating ||
          (business.rating !== null && business.rating >= filters.minimumRating);
        const reviewCountMatches =
          !filters.minimumReviewCount ||
          (business.reviewCount !== null &&
            business.reviewCount >= filters.minimumReviewCount);
        return ratingMatches && reviewCountMatches;
      });

      console.info("Lead Scout provider request", {
        provider: "google",
        requestCount: 1,
        resultCount: filtered.length,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return filtered;
    } catch (error) {
      if (error instanceof GooglePlacesSourceError) throw error;
      throw new GooglePlacesSourceError(
        "Google Places search is temporarily unavailable.",
        "UPSTREAM_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
