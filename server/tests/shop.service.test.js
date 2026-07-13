const shop = require('../src/services/shop.service');
const ShipService = require('../src/services/ship.service');
const EquipmentService = require('../src/services/equipment.service');

jest.mock('../src/db/pool');
jest.mock('../src/services/ship.service');
jest.mock('../src/services/equipment.service');

describe('Shop Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { query: jest.fn() };
    jest.clearAllMocks();
  });

  describe('getShopItems', () => {
    test('returns the available items', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      await shop.getShopItems(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE available = TRUE'),
      );
    });
  });

  describe('getShopItem', () => {
    test('returns null if the item cannot be found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await shop.getShopItem(mockClient, 999);
      expect(result).toBeNull();
    });

    test('returns the item if it exists', async () => {
      const item = { id: 1, name: 'Corsair', type: 'ship', price: 5000 };
      mockClient.query.mockResolvedValue({ rows: [item] });
      const result = await shop.getShopItem(mockClient, 1);
      expect(result).toEqual(item);
    });
  });

  describe('getPlayerWallet', () => {
    test('returns the player balance', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ wallet: 8000 }] });
      const result = await shop.getPlayerWallet(mockClient, 1);
      expect(result).toBe(8000);
    });

    test('returns 0 if the player cannot be found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await shop.getPlayerWallet(mockClient, 99);
      expect(result).toBe(0);
    });
  });

  describe('buyShip', () => {
    test('returns an error if the ship cannot be found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [] });                  // getShopItem → not found

      const result = await shop.buyShip(mockClient, 1, 99);
      expect(result.error).toBeDefined();
    });

    test('returns an error if credit is insufficient', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: {} };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 100 }] })   // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] });              // getShopItem

      const result = await shop.buyShip(mockClient, 1, 1);
      expect(result.error).toBe('Insufficient credit');
    });

    test('buys a ship successfully and deducts the price from the wallet', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: { speed: 120 } };
      const createdShip = { id: 2, name: 'Corsair' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })       // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })                     // getShopItem
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 2 }] })     // SELECT next_ship_id
        .mockResolvedValue({ rows: [] });                            // UPDATE + INSERT purchase_history

      ShipService.createShip.mockResolvedValue({});
      ShipService.getShip.mockResolvedValue(createdShip);

      const result = await shop.buyShip(mockClient, 1, 1);
      expect(result.success).toBe(true);
      expect(result.wallet).toBe(5000);
      expect(result.ship).toEqual(createdShip);
    });

    test('calls createShip with the correct data', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: { speed: 120 } };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 3 }] })
        .mockResolvedValue({ rows: [] });

      ShipService.createShip.mockResolvedValue({});
      ShipService.getShip.mockResolvedValue({ id: 3 });

      await shop.buyShip(mockClient, 1, 1);

      expect(ShipService.createShip).toHaveBeenCalledWith(
        mockClient,
        1,
        expect.objectContaining({ id: 3, name: 'Corsair', rarity: 'common' }),
      );
    });
  });

  describe('buyEquipment', () => {
    test('returns an error if the equipment cannot be found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [] }); // getShopItem → not found

      const result = await shop.buyEquipment(mockClient, 1, 99);
      expect(result.error).toBeDefined();
    });

    test('returns an error if credit is insufficient', async () => {
      const item = { id: 2, type: 'equipment', price: 1000, name: 'Reinforced Armor', rarity: 'common', effect: 'DURABILITY_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 100 }] })
        .mockResolvedValueOnce({ rows: [item] });

      const result = await shop.buyEquipment(mockClient, 1, 2);
      expect(result.error).toBe('Insufficient credit');
    });

    test('creates new equipment when the player does not own any', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Reinforced Armor', rarity: 'common', effect: 'DURABILITY_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })              // getShopItem
        .mockResolvedValueOnce({ rows: [] })                  // SELECT existing equipment → none
        .mockResolvedValue({ rows: [] });                     // INSERT equipment + UPDATE wallet + INSERT purchase

      EquipmentService.getPlayerEquipment.mockResolvedValue([]);

      const result = await shop.buyEquipment(mockClient, 1, 2);
      expect(result.success).toBe(true);
      expect(result.wallet).toBe(9500);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO equipment'),
        expect.any(Array),
      );
    });

    test('increments the quantity if the equipment already exists', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Reinforced Armor', rarity: 'common', effect: 'DURABILITY_BOOST' };
      const existing = { id: 10, name: 'Reinforced Armor', quantity: 1 };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })              // getShopItem
        .mockResolvedValueOnce({ rows: [existing] })          // SELECT existing equipment → found
        .mockResolvedValue({ rows: [] });                     // UPDATE quantity + UPDATE wallet + INSERT purchase

      const result = await shop.buyEquipment(mockClient, 1, 2);
      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE equipment SET quantity'),
        expect.any(Array),
      );
    });

    test('honors the requested quantity for the total cost', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Reinforced Armor', rarity: 'common', effect: 'DURABILITY_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] });

      EquipmentService.getPlayerEquipment.mockResolvedValue([]);

      const result = await shop.buyEquipment(mockClient, 1, 2, 3);
      expect(result.wallet).toBe(8500); // 10000 - (500 * 3)
    });
  });

  describe('seedShopItems', () => {
    test('inserts the 3 default ships and 3 default equipment items from the catalog', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await shop.seedShopItems(mockClient);

      expect(mockClient.query).toHaveBeenCalledTimes(6);
      const shipCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('stats, available'));
      const equipmentCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('effect, available'));
      expect(shipCalls).toHaveLength(3);
      expect(equipmentCalls).toHaveLength(3);
    });

    test('uses ON CONFLICT DO NOTHING to remain idempotent', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await shop.seedShopItems(mockClient);

      for (const [sql] of mockClient.query.mock.calls) {
        expect(sql).toContain('ON CONFLICT DO NOTHING');
      }
    });
  });
});
