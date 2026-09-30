import { getPriorityBand } from "@/lib/scoring/lead-score";
import type { CandidateBusiness, PriorityBand } from "@/lib/sources/types";
import { formatReviewActivity } from "@/lib/utils/dates";

const BAND_LABELS: Record<PriorityBand, string> = {
  HIGH: "High Priority",
  REVIEW: "Worth Reviewing",
  LOW: "Low Priority",
};

const WEBSITE_LABELS: Record<CandidateBusiness["websiteStatus"], string> = {
  NONE: "No website",
  HEALTHY: "Healthy website",
  WEAK: "Weak website",
  UNREACHABLE: "Website unreachable",
  UNKNOWN: "Website unknown",
};

export function LeadResultCard({ business, referenceDate }: { business: CandidateBusiness; referenceDate: string }) {
  const band = getPriorityBand(business.leadScore);
  const ratingLabel = business.rating === null ? "Not available" : `${business.rating.toFixed(1)} / 5`;
  const reviewCountLabel = business.reviewCount === null
    ? "Review count unavailable"
    : `${business.reviewCount} reviews`;

  return (
    <article className="lead-card">
      <div className="lead-card-heading">
        <div>
          <div className="category-line">{business.category}</div>
          <h3>{business.businessName}</h3>
          <p className="address">{business.address}</p>
        </div>
        <div className={`score-block score-${band.toLowerCase()}`}>
          <strong>{business.leadScore}</strong>
          <span>{BAND_LABELS[band]}</span>
        </div>
      </div>

      <div className="lead-facts">
        <div><span className="fact-label">Rating</span><strong>{ratingLabel}</strong><small>{reviewCountLabel}</small></div>
        <div><span className="fact-label">Latest review</span><strong>{formatReviewActivity(business.latestReviewDate, referenceDate)}</strong><small>{business.latestReviewDate ?? "Not provided by source"}</small></div>
        <div>
          <span className="fact-label">Phone</span>
          {business.phone ? <a href={`tel:${business.phone.replace(/\D/g, "")}`}>{business.phone}</a> : <strong className="muted-value">Not found</strong>}
          <small>Public listing</small>
        </div>
        <div><span className="fact-label">Website</span><strong>{WEBSITE_LABELS[business.websiteStatus]}</strong><small>{business.provider === "MOCK" ? "Mock status" : "Presence only"}</small></div>
      </div>

      <div className="score-explanation">
        <span className="fact-label">Why it scored this way</span>
        <ul>
          {business.scoreReasons.map((reason) => (
            <li className={reason.startsWith("+") ? "positive" : "negative"} key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="lead-actions">
        {business.website && <a href={business.website} target="_blank" rel="noreferrer">Open website <span aria-hidden="true">↗</span></a>}
        {business.sourceUrl && <a href={business.sourceUrl} target="_blank" rel="noreferrer">Open source listing <span aria-hidden="true">↗</span></a>}
        <button type="button" disabled title="CRM integration is planned for the next phase">Add to SentryPoint Leads <span>Coming next</span></button>
      </div>
    </article>
  );
}
