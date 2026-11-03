const WORKLIST = 'docs/TENANT-SESSION-WORKLIST.md#1-catalog-re-extraction-route-a';

/** Advisory only. Dates must be calendar-valid UTC ISO timestamps or dates. */
export function catalogFreshness(extractedAt, now) {
  const extractionMs = typeof extractedAt === 'string' ? Date.parse(extractedAt) : NaN;
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  const canonical = Number.isFinite(extractionMs) ? new Date(extractionMs).toISOString() : null;
  const valid = canonical !== null && (extractedAt === canonical
    || (/^\d{4}-\d{2}-\d{2}$/u.test(extractedAt) && extractedAt === canonical.slice(0, 10)));
  if (!valid || !Number.isFinite(nowMs) || extractionMs > nowMs) {
    return `WARN catalog-freshness: artifact extraction date or current clock is missing, invalid or in the future; catalog age is unknown; see ${WORKLIST}.`;
  }
  if (nowMs - extractionMs > 90 * 86_400_000) {
    return `WARN catalog-freshness: artifact catalog extracted ${extractedAt} is older than 90 days; see ${WORKLIST}.`;
  }
  return null;
}
