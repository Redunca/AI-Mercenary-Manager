// Mirrors opera-forge/server/src/domain/tags.js -- the {tagName} placeholder
// vocabulary the main game's mission generation engine resolves and
// interpolates into flavor text (server/src/engine/planetGenerator.js,
// missionGenerator.js, server/src/utils/template.js). Hand-copied rather than
// fetched-only so the node editor can offer an "Insert tag" picker without
// waiting on a request; the server remains the source of truth and is still
// fetched via GraphApiService.getTagCatalog() for anything that should stay
// in sync with server-side validation (see models/graph.ts's own header
// comment for why client/server are hand-mirrored rather than shared).

export interface TagDefinition {
  name: string;
  example: string;
  description: string;
}

export interface TagCategory {
  category: string;
  tags: TagDefinition[];
}

export const TAG_CATALOG: TagCategory[] = [
  {
    category: 'Planet',
    tags: [
      { name: 'planetName', example: 'W466875-2 "Kestrel\'s Rest"', description: 'Display name of the mission/opera\'s planet.' },
      { name: 'planetIdentifier', example: 'W466875-2', description: 'System id + orbital position, no nickname.' },
      { name: 'planetNickname', example: 'Kestrel\'s Rest', description: 'Generated nickname (only exists for populous, advanced planets).' },
      { name: 'climate', example: 'arid', description: 'Planet template\'s climate descriptor.' },
      { name: 'colonizationLevel', example: 'frontier outpost', description: 'Planet template\'s settlement descriptor.' },
      { name: 'faction', example: 'the Void Brotherhood', description: 'Group in control of the planet.' },
      { name: 'distance', example: 'at the edge of the sector, several jump-days out', description: 'Planet template\'s distance flavor phrase.' },
    ],
  },
  {
    category: 'Mission',
    tags: [
      { name: 'difficulty', example: 'STANDARD', description: 'ROUTINE / STANDARD / HARD / PERILOUS / EPIC.' },
      { name: 'missionType', example: 'ESCORT', description: 'Mission type identifier (ESCORT, HEIST, SABOTAGE, RECON, DIPLOMACY, EXTRACTION_OP).' },
      { name: 'clientName', example: 'Kael Voss', description: 'Person who hired the crew.' },
      { name: 'targetName', example: 'Ambassador Tolven', description: 'Person the mission is centered on (escort/diplomacy/extraction).' },
      { name: 'targetCorpName', example: 'the Halden Consortium', description: 'Corporation targeted by a heist/sabotage.' },
      { name: 'enemyGroupName', example: 'the Red Dogs', description: 'Hostile group opposing the crew.' },
      { name: 'securityGroupName', example: 'the Wolves of Kethar', description: 'Security force guarding a heist target.' },
    ],
  },
];

export function allTagNames(): string[] {
  return TAG_CATALOG.flatMap(group => group.tags.map(t => t.name));
}

export function exampleTagValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const group of TAG_CATALOG) {
    for (const tag of group.tags) values[tag.name] = tag.example;
  }
  return values;
}

/** Extracts the set of {placeholder} names referenced by a template string. */
export function extractPlaceholders(template: string | undefined): string[] {
  if (typeof template !== 'string') return [];
  const matches = template.matchAll(/\{(\w+)\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}
