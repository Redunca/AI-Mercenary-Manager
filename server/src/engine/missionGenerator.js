'use strict';

const { pickOne, sampleWithCoverage } = require('../utils/random');
const { render } = require('../utils/template');
const TagContext = require('./context');
const { generatePlanet } = require('./planetGenerator');
const { resolveProvideValue } = require('./nameGenerator');
const { generateEvent } = require('./eventGenerator');
const { pickWeightedDifficulty } = require('../utils/missionDifficulty');

const DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC'];
const BEAT_ORDER = { INFILTRATION: 1, EXECUTION: 2, EXTRACTION: 3 };

/** Picks a template entry, preferring ones tagged for the current difficulty. */
function pickFlavorTemplate(pool, difficulty) {
  const tagged = pool.filter((entry) => entry.tags.includes(difficulty));
  const candidates = tagged.length > 0 ? tagged : pool.filter((e) => e.tags.length === 0);
  return pickOne(candidates.length > 0 ? candidates : pool);
}

/**
 * Generates one mission.
 *
 * @param {object} data - output of dataLoader.loadData()
 * @param {object} options
 * @param {string} [options.difficulty] - one of DIFFICULTIES; random if omitted
 * @param {string} [options.missionType] - restrict to a specific mission type
 * @param {string[]} [options.planetTags] - preferred planet tags, e.g. ["arid","frontier"]
 */
function generateMission(data, options = {}) {
  const { entityNames, planets, missionTypes, events, missionNames, missionDescriptions, difficultyTables } = data;

  const difficulty = options.difficulty || pickWeightedDifficulty();
  if (!difficultyTables[difficulty]) {
    throw new Error(`Unknown difficulty "${difficulty}". Expected one of: ${DIFFICULTIES.join(', ')}`);
  }
  const difficultyTable = difficultyTables[difficulty];

  const context = new TagContext();
  context.set('difficulty', difficulty);

  // --- Stage 1: planet publishes climate/colonizationLevel/faction/planetName ---
  const planet = generatePlanet(planets, entityNames, context, { tags: options.planetTags || [] });

  // --- Stage 2: mission type, filtered by planet compatibility, publishes cast names ---
  let typeCandidates = missionTypes.filter(
    (mt) =>
      (!mt.requiresPlanetTags || mt.requiresPlanetTags.length === 0 ||
        mt.requiresPlanetTags.every((t) => planet.tags.includes(t))) &&
      (!options.missionType || mt.type === options.missionType)
  );
  if (typeCandidates.length === 0) typeCandidates = missionTypes;
  const missionType = pickOne(typeCandidates);
  context.set('missionType', missionType.type);

  // Track names already handed out so distinct roles (client vs target vs
  // antagonist) don't accidentally resolve to the same person/faction.
  const usedNames = [context.get('planetName')];
  if (context.has('faction')) usedNames.push(context.get('faction'));

  for (const [key, spec] of Object.entries(missionType.provides)) {
    const value = resolveProvideValue(entityNames, spec, usedNames);
    context.set(key, value);
    usedNames.push(value);
  }

  // --- Stage 3: events, sampled from the mission type's archetype pool.
  // sampleWithCoverage guarantees every beat (Infiltration/Execution/
  // Extraction) shows up at least once before any archetype repeats. ---
  const archetypePool = events.filter((e) => missionType.eventPool.includes(e.id));
  const chosenArchetypes = sampleWithCoverage(archetypePool, difficultyTable.eventCount).sort(
    (a, b) => BEAT_ORDER[a.beat] - BEAT_ORDER[b.beat]
  );
  const generatedEvents = chosenArchetypes.map((arch) => generateEvent(arch, context, difficultyTable));

  // --- Stage 4: assemble beats: Approach -> [event beats] -> Aftermath ---
  const approachDescription = render(pickOne(planet.approachTemplates), context.getAll());
  const aftermathDescription = render(pickOne(planet.aftermathTemplates), context.getAll());

  const beats = [
    { beat: 'APPROACH', description: approachDescription },
    ...generatedEvents.map((ev) => ({
      beat: ev.beat,
      description: ev.description,
      event: {
        id: ev.id,
        type: ev.type,
        attribute: ev.attribute,
        dc: ev.dc,
        reward: ev.reward,
        failureConsequence: ev.failureConsequence,
      },
    })),
    { beat: 'AFTERMATH', description: aftermathDescription },
  ];

  // --- Stage 5: mission name & description, pulled from tagged pools ---
  const nameEntry = pickFlavorTemplate(missionNames[missionType.type], difficulty);
  const descriptionEntry = pickFlavorTemplate(missionDescriptions[missionType.type], difficulty);

  const name = render(nameEntry.template, context.getAll());
  const description = render(descriptionEntry.template, context.getAll());

  return {
    name,
    description,
    difficulty,
    missionType: missionType.type,
    planet: {
      id: planet.id,
      name: planet.name,
      identifier: planet.identifier,
      nickname: planet.nickname,
      systemId: planet.systemId,
      position: planet.position,
      habitability: planet.habitability,
      population: planet.population,
      technology: planet.technology,
      tags: planet.tags,
    },
    tags: context.getAll(),
    beats,
    events: generatedEvents,
  };
}

module.exports = { generateMission, DIFFICULTIES };
