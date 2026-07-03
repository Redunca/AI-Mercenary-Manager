const GameService = require('../src/services/game.service');

jest.mock('../src/db/pool', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('../src/services/dice.service');
jest.mock('../src/services/log.service');

describe('Game Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('game service exports required functions', () => {
    expect(typeof GameService.initGame).toBe('function');
    expect(typeof GameService.syncGame).toBe('function');
    expect(typeof GameService.getGameState).toBe('function');
  });

  test('hireCandidate is callable', () => {
    expect(typeof GameService.hireCandidate).toBe('function');
  });

  test('startMission is callable', () => {
    expect(typeof GameService.startMission).toBe('function');
  });

  test('stopMission is callable', () => {
    expect(typeof GameService.stopMission).toBe('function');
  });

  test('forceReturnMission is callable', () => {
    expect(typeof GameService.forceReturnMission).toBe('function');
  });

  test('refreshCandidates is callable', () => {
    expect(typeof GameService.refreshCandidates).toBe('function');
  });

  test('renameRecruit is callable', () => {
    expect(typeof GameService.renameRecruit).toBe('function');
  });

  test('getMissionLogs is callable', () => {
    expect(typeof GameService.getMissionLogs).toBe('function');
  });
});
