// Refresh cycles (mission board batch, shop rotation) run on a fixed
// wall-clock boundary on the server (see currentIntervalBoundary() in
// server/src/utils/refreshWindow.js: floor(now/interval), not "N ms after
// whenever it last happened"). The next refresh is therefore always the
// next multiple of intervalMs after `now` — no server-side timestamp
// needs to round-trip to the client to display a countdown to it.
export function msUntilNextRefresh(intervalMs: number, now: number = Date.now()): number {
  if (!intervalMs || intervalMs <= 0) return 0;
  return Math.ceil(now / intervalMs) * intervalMs - now;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
