"use client";

import { useState } from "react";
import type { SearchBusinessesInput } from "@/lib/sources/types";

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
};

export function SearchForm({ initialQuery, isPending, onSearch }: SearchFormProps) {
  const [industry, setIndustry] = useState(initialQuery.industry);
  const [location, setLocation] = useState(initialQuery.location);
  const [minimumRating, setMinimumRating] = useState(String(initialQuery.filters?.minimumRating ?? 0));
  const [minimumReviewCount, setMinimumReviewCount] = useState(String(initialQuery.filters?.minimumReviewCount ?? 0));
  const [recentOnly, setRecentOnly] = useState(initialQuery.filters?.recentReviewActivity ?? false);

  return (
    <form
      className="search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch({
          industry,
          location,
          filters: {
            minimumRating: Number(minimumRating),
            minimumReviewCount: Number(minimumReviewCount),
            recentReviewActivity: recentOnly,
          },
        });
      }}
    >
      <div className="search-primary-fields">
        <label className="field-group">
          <span>Industry</span>
          <input list="industry-options" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Select or enter a service" maxLength={80} required />
          <datalist id="industry-options">
            {INDUSTRIES.map((option) => <option key={option} value={option} />)}
          </datalist>
        </label>
        <label className="field-group">
          <span>Location</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Orlando, FL" maxLength={80} required />
        </label>
        <button className="primary-button" type="submit" disabled={isPending}>
          {isPending ? "Searching…" : "Search businesses"}
        </button>
      </div>

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
        <label className="checkbox-field">
          <input type="checkbox" checked={recentOnly} onChange={(event) => setRecentOnly(event.target.checked)} />
          <span>Review in last 30 days</span>
        </label>
      </div>
    </form>
  );
}

