"use client";

import { useState } from "react";
import {
  BATCH_CONFIRMATION_THRESHOLD,
  createSearchPlan,
} from "@/lib/search-plan";
import type { BusinessProvider, SearchBusinessesInput } from "@/lib/sources/types";

const INDUSTRIES = [
  "Tree Service",
  "Painting",
  "Roofing",
  "Handyman",
  "Landscaping",
  "Auto Detailing",
];

type SearchFormProps = {
  initialQuery: SearchBusinessesInput;
  isPending: boolean;
  onSearch: (query: SearchBusinessesInput) => void;
  supportsReviewRecency: boolean;
  provider: BusinessProvider;
};

export function SearchForm({ initialQuery, isPending, onSearch, supportsReviewRecency, provider }: SearchFormProps) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [industry, setIndustry] = useState(initialQuery.industry);
  const [location, setLocation] = useState(initialQuery.location);
  const [locations, setLocations] = useState(initialQuery.location);
  const [queryVariants, setQueryVariants] = useState("");
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [resultLimit, setResultLimit] = useState<10 | 25 | 50>(25);
  const [minimumRating, setMinimumRating] = useState(String(initialQuery.filters?.minimumRating ?? 0));
  const [minimumReviewCount, setMinimumReviewCount] = useState(String(initialQuery.filters?.minimumReviewCount ?? 0));
  const [recentOnly, setRecentOnly] = useState(initialQuery.filters?.recentReviewActivity ?? false);

  let planPreview: ReturnType<typeof createSearchPlan> | null = null;
  let planError: string | null = null;
  if (mode === "batch") {
    try {
      planPreview = createSearchPlan({
        industry,
        location,
        mode,
        locations,
        queryVariants,
        batchConfirmed: true,
      });
    } catch (error) {
      planError = error instanceof Error ? error.message : "Search plan is invalid.";
    }
  }
  const requiresConfirmation = (planPreview?.items.length ?? 0) > BATCH_CONFIRMATION_THRESHOLD;

  return (
    <form
      className="search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch({
          industry,
          location,
          mode,
          locations: mode === "batch" ? locations : undefined,
          queryVariants: mode === "batch" ? queryVariants : undefined,
          batchConfirmed: mode === "batch" ? batchConfirmed : undefined,
          resultLimit,
          filters: {
            minimumRating: Number(minimumRating),
            minimumReviewCount: Number(minimumReviewCount),
            recentReviewActivity: recentOnly,
          },
        });
      }}
    >
      <fieldset className="search-mode" disabled={isPending}>
        <legend>Search mode</legend>
        <label><input type="radio" name="search-mode" checked={mode === "single"} onChange={() => { setMode("single"); setBatchConfirmed(false); }} /> Single Search</label>
        <label><input type="radio" name="search-mode" checked={mode === "batch"} onChange={() => setMode("batch")} /> Batch Search</label>
      </fieldset>

      <div className={`search-primary-fields ${mode === "batch" ? "is-batch" : ""}`}>
        <label className="field-group">
          <span>Industry / primary query</span>
          <input list="industry-options" value={industry} onChange={(event) => { setIndustry(event.target.value); setBatchConfirmed(false); }} placeholder="Select or enter a service" maxLength={80} required />
          <datalist id="industry-options">
            {INDUSTRIES.map((option) => <option key={option} value={option} />)}
          </datalist>
        </label>
        {mode === "single" ? (
          <label className="field-group">
            <span>Location</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Orlando, FL" maxLength={80} required />
          </label>
        ) : (
          <>
            <label className="field-group batch-field">
              <span>Locations <small>Up to 8, one per line</small></span>
              <textarea value={locations} onChange={(event) => { setLocations(event.target.value); setBatchConfirmed(false); }} placeholder={"Orlando, FL\nWinter Park, FL"} rows={3} maxLength={720} required />
            </label>
            <label className="field-group batch-field">
              <span>Related queries <small>Optional, up to 4 total</small></span>
              <textarea value={queryVariants} onChange={(event) => { setQueryVariants(event.target.value); setBatchConfirmed(false); }} placeholder={"tree removal\nstump grinding"} rows={3} maxLength={360} />
            </label>
          </>
        )}
        <button className="primary-button" type="submit" disabled={isPending || Boolean(planError) || (requiresConfirmation && !batchConfirmed)}>
          {isPending ? "Searching…" : "Search businesses"}
        </button>
      </div>

      {mode === "batch" && (
        <div className="request-plan" aria-live="polite">
          {planPreview ? (
            <>
              <div><span>Locations</span><strong>{planPreview.locations.length}</strong></div>
              <div><span>Query variants</span><strong>{planPreview.queries.length}</strong></div>
              <div><span>{provider === "GOOGLE_PLACES" ? "Google requests" : "Search requests (mock)"}</span><strong>{planPreview.items.length}</strong></div>
              {requiresConfirmation && (
                <label className="checkbox-field request-confirmation">
                  <input type="checkbox" checked={batchConfirmed} onChange={(event) => setBatchConfirmed(event.target.checked)} />
                  <span>Confirm this {planPreview.items.length}-request batch</span>
                </label>
              )}
            </>
          ) : <p className="plan-error">{planError}</p>}
        </div>
      )}

      <div className="optional-filters" aria-label="Optional search filters">
        <span className="filter-label">Optional filters</span>
        <label>
          <span>Minimum rating</span>
          <select value={minimumRating} onChange={(event) => setMinimumRating(event.target.value)}>
            <option value="0">Any rating</option>
            <option value="4">4.0+</option>
            <option value="4.5">4.5+</option>
            <option value="4.7">4.7+</option>
          </select>
        </label>
        <label>
          <span>Minimum reviews</span>
          <select value={minimumReviewCount} onChange={(event) => setMinimumReviewCount(event.target.value)}>
            <option value="0">Any count</option>
            <option value="10">10+</option>
            <option value="25">25+</option>
            <option value="50">50+</option>
            <option value="100">100+</option>
          </select>
        </label>
        {supportsReviewRecency && (
          <label className="checkbox-field">
            <input type="checkbox" checked={recentOnly} onChange={(event) => setRecentOnly(event.target.checked)} />
            <span>Review in last 30 days</span>
          </label>
        )}
        <label>
          <span>Results shown</span>
          <select value={resultLimit} onChange={(event) => setResultLimit(Number(event.target.value) as 10 | 25 | 50)}>
            <option value="10">Top 10</option>
            <option value="25">Top 25</option>
            <option value="50">Top 50</option>
          </select>
        </label>
      </div>
    </form>
  );
}
