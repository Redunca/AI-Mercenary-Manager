const ShipService = require('../src/services/ship.service');
const { createStarterShip, generateGalacticId } = require('../src/domain/ship');

jest.mock('../src/db/pool');

describe('Ship Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };
    jest.clearAllMocks();
  });

  test('getShips queries database correctly', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    
    await ShipService.getShips(mockClient, 1);
    
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM ships'),
      [1]
    );
  });

  test('createShip creates a new ship', async () => {
    const shipData = {
      id: 1,
      name: 'Vanguard',
      rarity: 'common',
      stats: { speed: 100, capacity: 1, inventory_space: 0, durability: 10, price: 0 }
    };

    mockClient.query.mockResolvedValue({ rows: [{ id: 1, ...shipData }] });

    await ShipService.createShip(mockClient, 1, shipData);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ships'),
      expect.any(Array)
    );
  });

  test('assignCrewToShip updates crew array', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, crew: [1, 2] }] });

    await ShipService.assignCrewToShip(mockClient, 1, 1, [1, 2]);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ships'),
      expect.arrayContaining([[1, 2], 1, 1])
    );
  });

  test('updateShipStatus changes ship status', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, status: 'in_mission' }] });

    await ShipService.updateShipStatus(mockClient, 1, 1, 'in_mission');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ships'),
      ['in_mission', 1, 1]
    );
  });

  test('destroyShip soft-deletes ship', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, status: 'destroyed', deleted_at: new Date() }] });

    await ShipService.destroyShip(mockClient, 1, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('destroyed'),
      [1, 1]
    );
  });

  test('createHangar creates player hangar', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ player_id: 1, max_ships: 5 }] });

    await ShipService.createHangar(mockClient, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO hangars'),
      [1, 5]
    );
  });

  test('createDockingStation creates station with capacity', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, capacity: 5 }] });

    await ShipService.createDockingStation(mockClient, 1, 5);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO docking_stations'),
      [1, 5]
    );
  });
});