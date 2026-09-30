"use client";

import { useMemo, useState, useTransition } from "react";
import { searchBusinesses } from "@/app/actions";
import { filterBusinesses, sortBusinesses, type ResultFilter, type ResultSort } from "@/lib/results";
import type { SearchBusinessesInput, SearchBusinessesResult } from "@/lib/sources/types";
import { LeadResultCard } from "./lead-result-card";
import { ResultsFilters } from "./results-filters";
import { ResultsSummary } from "./results-summary";
import { SearchForm } from "./search-form";

export function LeadScout({ initialQuery, initialResult }: {
  initialQuery: SearchBusinessesInput;
  initialResult: SearchBusinessesResult;
}) {
  const [searchResult, setSearchResult] = useState(initialResult);
  const [lastQuery, setLastQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<ResultFilter>("all");
  const [sort, setSort] = useState<ResultSort>("score");
  const [isPending, startTransition] = useTransition();

  const visibleResults = useMemo(() => {
    const filtered = filterBusinesses(
      searchResult.businesses,
      activeFilter,
      searchResult.referenceDate,
    );
    return sortBusinesses(filtered, sort);
  }, [activeFilter, searchResult, sort]);

  function handleSearch(query: SearchBusinessesInput) {
    startTransition(async () => {
      try {
        const nextResult = await searchBusinesses(query);
        setSearchResult(nextResult);
        setLastQuery(query);
        setActiveFilter("all");
        setSort("score");
      } catch {
        setSearchResult((current) => ({
          ...current,
          businesses: [],
          hasSearched: true,
          error: "Lead Scout search is temporarily unavailable.",
        }));
      }
    });
  }

  const isGoogle = searchResult.provider === "GOOGLE_PLACES";

  return (
    <>
      <SearchForm
        initialQuery={initialQuery}
        isPending={isPending}
        onSearch={handleSearch}
        supportsReviewRecency={searchResult.supportsReviewRecency}
      />
      <div className="dataset-note">
        <span className="status-dot" aria-hidden="true" />
        {searchResult.providerLabel}
        {searchResult.supportsReviewRecency && ` · activity measured as of ${searchResult.referenceDate}`}
        {isGoogle && searchResult.requestCount > 0 && " · 1 provider request"}
      </div>

      {searchResult.error ? (
        <div className="state-panel" role="alert"><strong>Search unavailable</strong><p>{searchResult.error}</p></div>
      ) : !searchResult.hasSearched ? (
        <div className="state-panel" aria-live="polite">
          <strong>Ready to search Google Places</strong>
          <p>Choose an industry and location, then search when you are ready.</p>
        </div>
      ) : searchResult.businesses.length === 0 ? (
        <div className="state-panel" aria-live="polite">
          <strong>No businesses matched this search</strong>
          <p>Try a different industry, location, or optional filter.</p>
        </div>
      ) : (
        <section className="results-section" aria-busy={isPending}>
          <div className="results-heading">
            <div>
              <span className="eyebrow">Prioritized results</span>
              <h2>Who should I call today?</h2>
              <p>{lastQuery.industry} near {lastQuery.location}. Scores are prioritization guidance, not an objective measure of business quality.</p>
            </div>
          </div>
          <ResultsSummary
            businesses={searchResult.businesses}
            referenceDate={searchResult.referenceDate}
            supportsReviewRecency={searchResult.supportsReviewRecency}
          />
          <ResultsFilters
            activeFilter={activeFilter}
            sort={sort}
            onFilterChange={setActiveFilter}
            onSortChange={setSort}
            supportsReviewRecency={searchResult.supportsReviewRecency}
          />
          {visibleResults.length === 0 ? (
            <div className="state-panel compact" aria-live="polite"><strong>No results in this view</strong><p>Choose another result filter to see the matching businesses.</p></div>
          ) : (
            <div className="lead-list">
              {visibleResults.map((business) => (
                <LeadResultCard
                  key={business.id}
                  business={business}
                  referenceDate={searchResult.referenceDate}
                />
              ))}
            </div>
          )}
          {isGoogle && <div className="google-attribution">Google Maps</div>}
        </section>
      )}
    </>
  );
}
