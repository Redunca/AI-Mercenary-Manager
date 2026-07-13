const DURATION_PER_EVENT_MS = 15_000

function phaseFromProgress(progress) {
  if (progress <= 33) return 'EN_ROUTE'
  if (progress <= 66) return 'EVENT'
  if (progress < 100) return 'RETURN'
  return 'COMPLETED'
}

function progressFromElapsed(eventCount, elapsedMs) {
  const durationMs = eventCount * DURATION_PER_EVENT_MS
  if (durationMs <= 0) return 100
  return Math.min(100, Math.round((elapsedMs / durationMs) * 100))
}

module.exports = {
  DURATION_PER_EVENT_MS,
  phaseFromProgress,
  progressFromElapsed,
}
