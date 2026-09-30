const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function daysBetween(earlierDate: string, laterDate: string): number {
  const earlier = Date.parse(`${earlierDate}T00:00:00Z`);
  const later = Date.parse(`${laterDate}T00:00:00Z`);

  if (Number.isNaN(earlier) || Number.isNaN(later)) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }

  return Math.max(0, Math.floor((later - earlier) / DAY_IN_MS));
}

export function formatReviewActivity(
  latestReviewDate: string | null,
  referenceDate: string,
): string {
  if (!latestReviewDate) return "Not available";
  const days = daysBetween(latestReviewDate, referenceDate);

  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
