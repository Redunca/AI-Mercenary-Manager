const request = require('supertest');
const app = require('../../server/index'); // Express app
const GameService = require('../../server/src/services/game.service');
const DiceService = require('../../server/src/services/dice.service');
const LogService = require('../../server/src/services/log.service');

jest.mock('../../server/src/services/dice.service');
jest.mock('../../server/src/services/log.service');

describe('Mission Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('starts a mission with a valid recruit', async () => {
    const recruit = { id: 'r1', name: 'Test Recruit', stats: { str: 3 } };
    GameService.recruits = [recruit];

    const mission = {
      id: 'm1',
      name: 'Test Mission',
      events: []
    };
    GameService.missions = [mission];

    const res = await request(app)
      .post('/game/start-mission')
      .send({ recruitId: 'r1', missionId: 'm1' });

    expect(res.status).toBe(200);
    expect(GameService.activeMissions['m1']).toBeDefined();
    expect(LogService.log).toHaveBeenCalled();
  });

  test('resolves a mission event using dice roll', async () => {
    DiceService.roll.mockReturnValue(15);

    const recruit = { id: 'r1', name: 'Test Recruit', stats: { str: 3 } };
    const mission = {
      id: 'm1',
      name: 'Test Mission',
      events: [{ type: 'strength', difficulty: 10 }]
    };

    GameService.recruits = [recruit];
    GameService.missions = [mission];
    GameService.activeMissions['m1'] = { recruit, mission, currentEvent: 0 };

    const result = await GameService.resolveEvent('m1');

    expect(result.success).toBe(true);
    expect(DiceService.roll).toHaveBeenCalled();
    expect(LogService.log).toHaveBeenCalled();
  });

  test('completes mission and credits AI account', async () => {
    GameService.aiAccount = 0;

    const recruit = { id: 'r1', name: 'Test Recruit', stats: { str: 3 } };
    const mission = {
      id: 'm1',
      name: 'Test Mission',
      reward: 100,
      events: []
    };

    GameService.recruits = [recruit];
    GameService.missions = [mission];
    GameService.activeMissions['m1'] = { recruit, mission, currentEvent: 0 };

    const result = await GameService.completeMission('m1');

    expect(GameService.aiAccount).toBe(100);
    expect(LogService.log).toHaveBeenCalled();
  });

  test('handles crew death and mission failure', async () => {
    DiceService.roll.mockReturnValue(1);

    const recruit = { id: 'r1', name: 'Test Recruit', stats: { str: 3 } };
    const mission = {
      id: 'm1',
      name: 'Test Mission',
      events: [{ type: 'strength', difficulty: 20 }]
    };

    GameService.recruits = [recruit];
    GameService.missions = [mission];
    GameService.activeMissions['m1'] = { recruit, mission, currentEvent: 0 };

    const result = await GameService.resolveEvent('m1');

    expect(result.success).toBe(false);
    expect(recruit.dead).toBe(true);
    expect(LogService.log).toHaveBeenCalled();
  });
});
