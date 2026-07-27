export interface LogEntry {
  tag: string; // '[SYS]', '[AI]', '[BOB]', '[VEX→KADE]' (banter), etc.
  message: string;
  missionId?: number; // absent = global entry only
}

// Banter tags use the '[NAME_A→NAME_B]' format (see server's log.service.js buildBanterLog),
// which is the only tag shape containing the '→' separator — [SYS]/[AI]/[NAME] never do.
export function isBanterTag(tag: string): boolean {
  return tag.includes('→');
}

// Relationship-shift tags use '[NAME_A⇄NAME_B]' (see server's log.service.js
// buildRelationshipShiftLog) — '⇄' instead of banter's '→' so the two tag
// families stay distinguishable, and so this one never matches the server's
// banter-cooldown query (`tag LIKE '%→%'`).
export function isRelationshipShiftTag(tag: string): boolean {
  return tag.includes('⇄');
}
