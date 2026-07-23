'use strict'

/**
 * Returns the timestamp (ms since epoch) of the most recent wall-clock
 * boundary at or before `now`, for a given interval. E.g. with a 15-minute
 * interval, this floors to :00/:15/:30/:45 — not "N minutes after whenever
 * the last refresh happened".
 */
function currentIntervalBoundary(now, intervalMs) {
  const ms = now instanceof Date ? now.getTime() : now
  return Math.floor(ms / intervalMs) * intervalMs
}

/**
 * True if a refresh is due: either nothing has ever been refreshed
 * (`lastRefreshAt` is null/undefined), or the wall-clock boundary has moved
 * on since the last recorded refresh (i.e. we've crossed into a new
 * 15-minute — or whatever interval — window).
 */
function isRefreshDue(lastRefreshAt, now, intervalMs) {
  if (lastRefreshAt === null || lastRefreshAt === undefined) return true
  const lastMs =
    lastRefreshAt instanceof Date ? lastRefreshAt.getTime() : new Date(lastRefreshAt).getTime()
  return currentIntervalBoundary(now, intervalMs) > currentIntervalBoundary(lastMs, intervalMs)
}

module.exports = { currentIntervalBoundary, isRefreshDue }
