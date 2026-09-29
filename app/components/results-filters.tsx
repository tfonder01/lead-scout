"use client";

import type { ResultFilter, ResultSort } from "@/lib/results";

const FILTERS: Array<{ value: ResultFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High Priority" },
  { value: "none", label: "No Website" },
  { value: "weak", label: "Weak Website" },
  { value: "recent", label: "Recently Active" },
];

export function ResultsFilters({ activeFilter, sort, onFilterChange, onSortChange }: {
  activeFilter: ResultFilter;
  sort: ResultSort;
  onFilterChange: (filter: ResultFilter) => void;
  onSortChange: (sort: ResultSort) => void;
}) {
  return (
    <div className="results-toolbar">
      <div className="filter-tabs" aria-label="Filter results">
        {FILTERS.map((filter) => (
          <button key={filter.value} type="button" className={activeFilter === filter.value ? "is-active" : undefined} aria-pressed={activeFilter === filter.value} onClick={() => onFilterChange(filter.value)}>
            {filter.label}
          </button>
        ))}
      </div>
      <label className="sort-field">
        <span>Sort by</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as ResultSort)}>
          <option value="score">Lead score</option>
          <option value="reviews">Review count</option>
          <option value="newest">Newest review</option>
        </select>
      </label>
    </div>
  );
}
