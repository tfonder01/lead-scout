import { MOCK_DATA_AS_OF } from "@/lib/sources/mock-source";
import type { SearchBusinessesInput } from "@/lib/sources/types";
import { searchBusinesses } from "./actions";
import { LeadScout } from "./components/lead-scout";

const INITIAL_QUERY: SearchBusinessesInput = {
  industry: "Tree Service",
  location: "Orlando, FL",
  filters: { minimumRating: 0, minimumReviewCount: 0, recentReviewActivity: false },
};

export default async function Home() {
  const initialResults = await searchBusinesses(INITIAL_QUERY);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="SentryPoint Lead Scout">
          <div className="brand-mark" aria-hidden="true">SP</div>
          <div><strong>SentryPoint</strong><span>Lead Scout</span></div>
        </div>
        <div className="environment-label">Internal tool · V1 mock mode</div>
      </header>

      <div className="workspace">
        <section className="intro">
          <div><span className="eyebrow">Business prospecting</span><h1>Find the next local business worth calling.</h1></div>
          <p>Search a deterministic set of synthetic businesses, compare lead signals, and focus the day&apos;s outreach without touching the CRM.</p>
        </section>
        <LeadScout initialQuery={INITIAL_QUERY} initialResults={initialResults} referenceDate={MOCK_DATA_AS_OF} />
      </div>
    </main>
  );
}
