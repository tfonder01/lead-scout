import { getPriorityBand } from "@/lib/scoring/lead-score";
import type { CandidateBusiness } from "@/lib/sources/types";
import { daysBetween } from "@/lib/utils/dates";

export function ResultsSummary({ businesses, referenceDate }: { businesses: CandidateBusiness[]; referenceDate: string }) {
  const stats = [
    [businesses.length, "businesses found"],
    [businesses.filter((business) => getPriorityBand(business.leadScore) === "HIGH").length, "high-priority"],
    [businesses.filter((business) => business.websiteStatus === "NONE").length, "no website"],
    [businesses.filter((business) => daysBetween(business.latestReviewDate, referenceDate) > 365).length, "inactive-looking"],
  ] as const;

  return (
    <section className="summary-grid" aria-label="Search result summary">
      {stats.map(([value, label]) => (
        <div className="summary-stat" key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}

