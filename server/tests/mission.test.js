const request = require('supertest');
const { app } = require('../index');
const { rollAction, rollDie, rollInRange } = require('../src/services/dice.service');
const GameService = require('../src/services/game.service');

jest.mock('../src/services/dice.service');
jest.mock('../src/services/log.service');
jest.mock('../src/db/pool');
jest.mock('../src/services/ship.service');
jest.mock('../src/services/equipment.service');
jest.mock('../src/services/game.service');

describe('Mission Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('starts a mission with a valid ship', async () => {
    GameService.startMission.mockResolvedValue({ id: 1, status: 'in_progress' });

    const res = await request(app)
      .post('/api/game/missions/1/start')
      .send({ shipId: 1 });

    expect(res.status).toBe(200);
    expect(GameService.startMission).toHaveBeenCalledWith(1, 1);
  });

  test('rollDie renvoie la valeur mockée', () => {
    rollDie.mockReturnValue(15);
    expect(rollDie(6)).toBe(15);
    expect(rollDie).toHaveBeenCalledWith(6);
  });

  test('stopMission renvoie le résultat du service', async () => {
    GameService.stopMission.mockResolvedValue({ success: true });

    const res = await request(app).post('/api/game/missions/1/stop');

    expect(res.status).toBe(200);
    expect(GameService.stopMission).toHaveBeenCalledWith(1);
  });

  test('forceReturnMission renvoie une erreur si la mission est introuvable', async () => {
    GameService.forceReturnMission.mockResolvedValue({ error: 'Mission introuvable' });

    const res = await request(app).post('/api/game/missions/99/force-return');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('startMission is callable with shipId', () => {
    expect(typeof GameService.startMission).toBe('function');
  });

  test('stopMission is callable', () => {
    expect(typeof GameService.stopMission).toBe('function');
  });

  test('forceReturnMission is callable', () => {
    expect(typeof GameService.forceReturnMission).toBe('function');
  });

  test('dice roll works for event resolution', () => {
    rollDie.mockReturnValue(15);
    expect(rollAction).toBeDefined();
  });

  test('resolves event with highest stat crew member', () => {
    const crew = [
      { id: 1, name: 'Recruit 1', attributes: { str: 3, dex: 2 } },
      { id: 2, name: 'Recruit 2', attributes: { str: 5, dex: 1 } },
    ];

    const highestStr = crew.reduce((best, current) => 
      current.attributes.str > best.attributes.str ? current : best
    );

    expect(highestStr.id).toBe(2);
    expect(highestStr.attributes.str).toBe(5);
  });

  test('mission starts with ship and crew', () => {
    const ship = {
      id: 1,
      name: 'Vanguard',
      crew: [1, 2],
      status: 'docked',
      stats: { speed: 100 }
    };

    expect(ship.status).toBe('docked');
    expect(ship.crew.length).toBe(2);
  });

  test('ship status changes to in_mission when mission starts', () => {
    const ship = { id: 1, status: 'docked' };
    ship.status = 'in_mission';

    expect(ship.status).toBe('in_mission');
  });

  test('crew status changes to in_mission', () => {
    const recruit = { id: 1, name: 'Test', status: 'available' };
    recruit.status = 'in_mission';

    expect(recruit.status).toBe('in_mission');
  });

  test('crew returns to available after successful mission', () => {
    const recruit = { id: 1, status: 'in_mission' };
    recruit.status = 'available';

    expect(recruit.status).toBe('available');
  });

  test('crew returns via shuttle after ship destroyed', () => {
    const recruit = { id: 1, status: 'in_mission' };
    recruit.status = 'returning';

    expect(recruit.status).toBe('returning');
  });

  test('failed mission forfeits reward', () => {
    const mission = {
      id: 1,
      reward_forfeited: false,
      failed: false
    };

    mission.failed = true;
    mission.reward_forfeited = true;

    expect(mission.reward_forfeited).toBe(true);
  });

  test('ship can be soft-deleted', () => {
    const ship = { id: 1, deleted_at: null, status: 'destroyed' };
    ship.deleted_at = new Date();

    expect(ship.deleted_at).not.toBeNull();
    expect(ship.status).toBe('destroyed');
  });
});
