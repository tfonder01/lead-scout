import { getPriorityBand } from "@/lib/scoring/lead-score";
import type { CandidateBusiness } from "@/lib/sources/types";
import { daysBetween } from "@/lib/utils/dates";

export function ResultsSummary({
  businesses,
  referenceDate,
  supportsReviewRecency,
}: {
  businesses: CandidateBusiness[];
  referenceDate: string;
  supportsReviewRecency: boolean;
}) {
  const contextualStat: readonly [number, string] = supportsReviewRecency
    ? [
        businesses.filter(
          (business) =>
            business.latestReviewDate !== null &&
            daysBetween(business.latestReviewDate, referenceDate) > 365,
        ).length,
        "inactive-looking",
      ]
    : [businesses.filter((business) => business.phone !== null).length, "with phone"];
  const stats = [
    [businesses.length, "businesses found"],
    [businesses.filter((business) => getPriorityBand(business.leadScore) === "HIGH").length, "high-priority"],
    [businesses.filter((business) => business.websiteStatus === "NONE").length, "no website"],
    contextualStat,
  ] as const;

  return (
    <section className="summary-grid" aria-label="Search result summary">
      {stats.map(([value, label]) => (
        <div className="summary-stat" key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}
