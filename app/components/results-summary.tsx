import type { BusinessProvider, CandidateBusiness, SearchRunMetrics } from "@/lib/sources/types";

export function ResultsSummary({
  businesses,
  provider,
  metrics,
  shownCount,
}: {
  businesses: CandidateBusiness[];
  provider: BusinessProvider;
  metrics: SearchRunMetrics;
  shownCount: number;
}) {
  const stats = [
    [metrics.completedRequests + metrics.failedRequests, provider === "GOOGLE_PLACES" ? "Google requests" : "search requests"],
    [metrics.rawResultCount, "raw businesses"],
    [metrics.uniqueResultCount, "unique businesses"],
    [shownCount, "top prospects shown"],
    [businesses.filter((business) => business.websiteStatus === "NONE").length, "no website"],
    [businesses.filter((business) => business.websiteStatus === "WEAK" || business.websiteStatus === "UNREACHABLE").length, "weak / unreachable"],
  ] as const;

  return (
    <section className="summary-grid" aria-label="Search result summary">
      {stats.map(([value, label]) => (
        <div className="summary-stat" key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}
