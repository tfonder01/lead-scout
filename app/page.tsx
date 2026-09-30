import type { SearchBusinessesInput } from "@/lib/sources/types";
import { getInitialSearchResult } from "./actions";
import { LeadScout } from "./components/lead-scout";

const INITIAL_QUERY: SearchBusinessesInput = {
  industry: "Tree Service",
  location: "Orlando, FL",
  filters: { minimumRating: 0, minimumReviewCount: 0, recentReviewActivity: false },
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialResult = await getInitialSearchResult(INITIAL_QUERY);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="SentryPoint Lead Scout">
          <div className="brand-mark" aria-hidden="true">SP</div>
          <div><strong>SentryPoint</strong><span>Lead Scout</span></div>
        </div>
        <div className="environment-label">Internal tool · Phase 2</div>
      </header>

      <div className="workspace">
        <section className="intro">
          <div><span className="eyebrow">Business prospecting</span><h1>Find the next local business worth calling.</h1></div>
          <p>Search local businesses, compare reliable lead signals, and focus the day&apos;s outreach without touching the CRM.</p>
        </section>
        <LeadScout initialQuery={INITIAL_QUERY} initialResult={initialResult} />
      </div>
    </main>
  );
}
