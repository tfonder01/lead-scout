import type { BusinessSource } from "./business-source";
import { GooglePlacesBusinessSource } from "./google-places-source.ts";
import { mockBusinessSource } from "./mock-source.ts";
import type { BusinessProvider } from "./types";

export type SelectedBusinessSource = {
  source: BusinessSource;
  provider: BusinessProvider;
  providerLabel: string;
  supportsReviewRecency: boolean;
};

export function selectBusinessSource(
  configuredProvider = process.env.LEAD_SCOUT_PROVIDER,
): SelectedBusinessSource {
  const provider = configuredProvider?.trim().toLowerCase() || "mock";

  if (provider === "mock") {
    return {
      source: mockBusinessSource,
      provider: "MOCK",
      providerLabel: "Mock data",
      supportsReviewRecency: true,
    };
  }

  if (provider === "google") {
    return {
      source: new GooglePlacesBusinessSource(),
      provider: "GOOGLE_PLACES",
      providerLabel: "Google Places",
      supportsReviewRecency: false,
    };
  }

  throw new Error("LEAD_SCOUT_PROVIDER must be either mock or google.");
}
