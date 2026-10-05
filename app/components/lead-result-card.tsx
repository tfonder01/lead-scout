"use client";

import { useState, useTransition } from "react";
import { addToSentryPointLeads } from "@/app/actions";
import { getPriorityBand } from "@/lib/scoring/lead-score";
import type {
  CandidateBusiness,
  PriorityBand,
  WebsiteSignal,
} from "@/lib/sources/types";
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

const WEBSITE_SIGNAL_LABELS: Record<WebsiteSignal, string> = {
  HTTPS: "HTTPS",
  PAGE_REACHABLE: "Page reachable",
  TITLE_PRESENT: "Title present",
  MOBILE_VIEWPORT: "Mobile viewport",
  CONTACT_LINK: "Contact link found",
  CONTACT_CTA: "Contact CTA found",
  FORM_FOUND: "Form found",
  PLACEHOLDER_MARKER: "Placeholder marker",
  BROKEN_PAGE_MARKER: "Broken-page marker",
  THIN_CONTENT: "Thin content",
  HTTP_ONLY: "HTTP only",
  TITLE_MISSING: "No page title",
  VIEWPORT_MISSING: "No mobile viewport",
  CONTACT_SIGNAL_MISSING: "No contact or estimate CTA",
  RESPONSE_FAST: "Fast response",
  RESPONSE_MODERATE: "Moderate response",
  RESPONSE_SLOW: "Slow response",
};

function websiteEvidence(business: CandidateBusiness): string {
  if (business.websiteStatus === "NONE") return "No provider website URL";
  if (business.websiteStatus === "UNREACHABLE") return "Landing page did not respond";
  if (business.websiteStatus === "UNKNOWN") return "Inspection inconclusive";

  const priorities: WebsiteSignal[] = business.websiteStatus === "WEAK"
    ? ["VIEWPORT_MISSING", "CONTACT_SIGNAL_MISSING", "HTTP_ONLY", "THIN_CONTENT", "PLACEHOLDER_MARKER", "TITLE_MISSING", "BROKEN_PAGE_MARKER"]
    : ["HTTPS", "MOBILE_VIEWPORT", "CONTACT_CTA", "CONTACT_LINK", "FORM_FOUND", "TITLE_PRESENT"];
  const labels = priorities
    .filter((signal) => business.websiteSignals.includes(signal))
    .slice(0, 2)
    .map((signal) => WEBSITE_SIGNAL_LABELS[signal]);
  return labels.length > 0 ? labels.join(" · ") : "Landing page inspected";
}

export function LeadResultCard({ business, referenceDate }: { business: CandidateBusiness; referenceDate: string }) {
  const [addResult, setAddResult] = useState<Awaited<ReturnType<typeof addToSentryPointLeads>> | null>(null);
  const [isAdding, startAdding] = useTransition();
  const band = getPriorityBand(business.leadScore);
  const ratingLabel = business.rating === null ? "Not available" : `${business.rating.toFixed(1)} / 5`;
  const reviewCountLabel = business.reviewCount === null
    ? "Review count unavailable"
    : `${business.reviewCount} reviews`;
  const completed = addResult?.status === "CREATED" || addResult?.status === "ALREADY_EXISTS";

  function addLead() {
    setAddResult(null);
    startAdding(async () => setAddResult(await addToSentryPointLeads(business)));
  }

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
        <div><span className="fact-label">Website</span><strong>{WEBSITE_LABELS[business.websiteStatus]}</strong><small>{business.provider === "MOCK" ? `Mock signal · ${websiteEvidence(business)}` : websiteEvidence(business)}</small></div>
      </div>

      <div className="score-explanation">
        <span className="fact-label">Why it scored this way</span>
        <ul>
          {business.scoreReasons.map((reason) => (
            <li className={reason.startsWith("+") ? "positive" : "negative"} key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      {(business.matchedLocations?.length || business.matchedQueries?.length) && (
        <div className="result-provenance">
          {business.matchedLocations?.length ? <span><strong>Found in:</strong> {business.matchedLocations.join(", ")}</span> : null}
          {business.matchedQueries?.length ? <span><strong>Matched:</strong> {business.matchedQueries.join(", ")}</span> : null}
        </div>
      )}

      <div className="lead-actions">
        {business.website && <a href={business.website} target="_blank" rel="noreferrer">Open website <span aria-hidden="true">↗</span></a>}
        {business.sourceUrl && <a href={business.sourceUrl} target="_blank" rel="noreferrer">Open source listing <span aria-hidden="true">↗</span></a>}
        <button
          type="button"
          onClick={addLead}
          disabled={isAdding || completed || business.provider !== "GOOGLE_PLACES"}
          title={business.provider !== "GOOGLE_PLACES" ? "Only Google Places results can be added" : undefined}
        >
          {isAdding ? "Adding..." : addResult?.status === "CREATED" ? "Added to SentryPoint"
            : addResult?.status === "ALREADY_EXISTS" ? "Already in SentryPoint"
              : addResult?.status === "ERROR" ? "Retry" : "Add to SentryPoint Leads"}
        </button>
        {completed && addResult.leadUrl ? <a href={addResult.leadUrl} target="_blank" rel="noreferrer">Open lead <span aria-hidden="true">↗</span></a> : null}
        {addResult?.status === "ERROR" ? <small className="lead-action-error" role="alert">{addResult.message}</small> : null}
      </div>
    </article>
  );
}
