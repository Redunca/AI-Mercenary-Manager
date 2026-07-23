export interface LogEntry {
  tag: string; // '[SYS]', '[IA]', '[BOB]', '[VEX→KADE]' (banter), etc.
  message: string;
  missionId?: number; // absent = global entry only
}

// Banter tags use the '[NAME_A→NAME_B]' format (see server's log.service.js buildBanterLog),
// which is the only tag shape containing the '→' separator — [SYS]/[IA]/[NAME] never do.
export function isBanterTag(tag: string): boolean {
  return tag.includes('→');
}
