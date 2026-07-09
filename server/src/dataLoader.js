'use strict';

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

let cache = null;

function loadData() {
  if (cache) return cache;

  cache = {
    entityNames: require(path.join(DATA_DIR, 'entity-names.json')),
    planets: require(path.join(DATA_DIR, 'planets.json')),
    missionTypes: require(path.join(DATA_DIR, 'mission-types.json')),
    events: require(path.join(DATA_DIR, 'events.json')),
    missionNames: require(path.join(DATA_DIR, 'mission-names.json')),
    missionDescriptions: require(path.join(DATA_DIR, 'mission-descriptions.json')),
    difficultyTables: require(path.join(DATA_DIR, 'difficulty-tables.json')),
  };

  return cache;
}

module.exports = { loadData, DATA_DIR };
