"use client";

import { useMemo, useState, useTransition } from "react";
import { searchBusinesses } from "@/app/actions";
import { filterBusinesses, sortBusinesses, type ResultFilter, type ResultSort } from "@/lib/results";
import type { CandidateBusiness, SearchBusinessesInput } from "@/lib/sources/types";
import { LeadResultCard } from "./lead-result-card";
import { ResultsFilters } from "./results-filters";
import { ResultsSummary } from "./results-summary";
import { SearchForm } from "./search-form";

export function LeadScout({ initialQuery, initialResults, referenceDate }: {
  initialQuery: SearchBusinessesInput;
  initialResults: CandidateBusiness[];
  referenceDate: string;
}) {
  const [results, setResults] = useState(initialResults);
  const [lastQuery, setLastQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<ResultFilter>("all");
  const [sort, setSort] = useState<ResultSort>("score");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleResults = useMemo(() => {
    const filtered = filterBusinesses(results, activeFilter, referenceDate);
    return sortBusinesses(filtered, sort);
  }, [activeFilter, referenceDate, results, sort]);

  function handleSearch(query: SearchBusinessesInput) {
    setError(null);
    startTransition(async () => {
      try {
        const nextResults = await searchBusinesses(query);
        setResults(nextResults);
        setLastQuery(query);
        setActiveFilter("all");
        setSort("score");
      } catch {
        setError("The mock search could not be completed. Please try again.");
      }
    });
  }

  return (
    <>
      <SearchForm initialQuery={initialQuery} isPending={isPending} onSearch={handleSearch} />
      <div className="dataset-note"><span className="status-dot" aria-hidden="true" />Deterministic mock dataset · activity measured as of {referenceDate}</div>

      {error ? (
        <div className="state-panel" role="alert"><strong>Search unavailable</strong><p>{error}</p></div>
      ) : results.length === 0 ? (
        <div className="state-panel" aria-live="polite"><strong>No mock businesses matched this search</strong><p>Try another supported service or a Central Florida location such as Orlando, FL or Winter Park, FL.</p></div>
      ) : (
        <section className="results-section" aria-busy={isPending}>
          <div className="results-heading">
            <div>
              <span className="eyebrow">Prioritized results</span>
              <h2>Who should I call today?</h2>
              <p>{lastQuery.industry} near {lastQuery.location}. Scores are prioritization guidance, not an objective measure of business quality.</p>
            </div>
          </div>
          <ResultsSummary businesses={results} referenceDate={referenceDate} />
          <ResultsFilters activeFilter={activeFilter} sort={sort} onFilterChange={setActiveFilter} onSortChange={setSort} />
          {visibleResults.length === 0 ? (
            <div className="state-panel compact" aria-live="polite"><strong>No results in this view</strong><p>Choose another result filter to see the matching businesses.</p></div>
          ) : (
            <div className="lead-list">
              {visibleResults.map((business) => <LeadResultCard key={business.id} business={business} referenceDate={referenceDate} />)}
            </div>
          )}
        </section>
      )}
    </>
  );
}
