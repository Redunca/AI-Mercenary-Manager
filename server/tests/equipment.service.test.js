const EquipmentService = require('../src/services/equipment.service');

jest.mock('../src/db/pool');

describe('Equipment Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };
    jest.clearAllMocks();
  });

  test('getPlayerEquipment retrieves unassigned equipment', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await EquipmentService.getPlayerEquipment(mockClient, 1, true);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship IS NULL'),
      [1]
    );
  });

  test('createEquipment inserts new equipment', async () => {
    const equipmentData = {
      name: 'Armor Plating',
      description: 'Reinforced hull armor',
      rarity: 'common',
      price: 100,
      effect: 'DAMAGE_REDUCTION',
      quantity: 3
    };

    mockClient.query.mockResolvedValue({ rows: [{ id: 1, ...equipmentData }] });

    await EquipmentService.createEquipment(mockClient, 1, equipmentData);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO equipment'),
      expect.any(Array)
    );
  });

  test('assignEquipmentToShip assigns equipment to ship', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, assigned_to_ship: 1 }] });

    await EquipmentService.assignEquipmentToShip(mockClient, 1, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship'),
      [1, 1]
    );
  });

  test('consumeEquipment decreases quantity', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, quantity: 2 }] });

    await EquipmentService.consumeEquipment(mockClient, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('quantity - 1'),
      [1]
    );
  });

  test('getShipEquipment retrieves equipment assigned to ship', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await EquipmentService.getShipEquipment(mockClient, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship'),
      [1]
    );
  });

  test('getPlayerEquipment retrieves all equipment when unassignedOnly is not requested', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await EquipmentService.getPlayerEquipment(mockClient, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.not.stringContaining('assigned_to_ship IS NULL'),
      [1]
    );
  });

  test('getEquipment retrieves a single equipment item by id', async () => {
    const equipment = { id: 5, name: 'Blindage Renforcé' };
    mockClient.query.mockResolvedValue({ rows: [equipment] });

    const result = await EquipmentService.getEquipment(mockClient, 5);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM equipment WHERE id = $1'),
      [5]
    );
    expect(result).toEqual(equipment);
  });

  test('unassignEquipmentFromShip clears the assigned ship', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, assigned_to_ship: null }] });

    await EquipmentService.unassignEquipmentFromShip(mockClient, 1);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship = NULL'),
      [1]
    );
  });
});