import type { SearchBusinessesInput, SourceBusiness } from "./types";

export interface BusinessSource {
  readonly name: string;
  searchBusinesses(input: SearchBusinessesInput): Promise<SourceBusiness[]>;
}

