const shop = require('../src/services/shop.service');
const ShipService = require('../src/services/ship.service');
const ConsumableService = require('../src/services/consumable.service');

jest.mock('../src/db/pool');
jest.mock('../src/services/ship.service');
jest.mock('../src/services/consumable.service');

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
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: { speed: 120, durability: 8 } };
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

    test('calls createShip with the correct data, filling in max_durability', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: { speed: 120, durability: 8 } };
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
        expect.objectContaining({
          id: 3, name: 'Corsair', rarity: 'common',
          stats: expect.objectContaining({ durability: 8, max_durability: 8 }),
        }),
      );
    });

    test('keeps an explicit max_durability from the shop listing instead of overwriting it', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsair', rarity: 'common', stats: { durability: 8, max_durability: 20 } };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 3 }] })
        .mockResolvedValue({ rows: [] });

      ShipService.createShip.mockResolvedValue({});
      ShipService.getShip.mockResolvedValue({ id: 3 });

      await shop.buyShip(mockClient, 1, 1);

      expect(ShipService.createShip).toHaveBeenCalledWith(
        mockClient, 1, expect.objectContaining({ stats: expect.objectContaining({ max_durability: 20 }) }),
      );
    });
  });

  describe('buyConsumable', () => {
    test('returns an error if the consumable cannot be found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [] }); // getShopItem → not found

      const result = await shop.buyConsumable(mockClient, 1, 99);
      expect(result.error).toBeDefined();
    });

    test('returns an error if credit is insufficient', async () => {
      const item = { id: 2, type: 'consumable', price: 1000, name: 'Hull Auto-Patch', rarity: 'rare', effect: 'REPAIR' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 100 }] })
        .mockResolvedValueOnce({ rows: [item] });

      const result = await shop.buyConsumable(mockClient, 1, 2);
      expect(result.error).toBe('Insufficient credit');
    });

    test('adds the consumable to the player stash and deducts the wallet', async () => {
      const item = { id: 2, type: 'consumable', price: 500, name: 'Agility Stimpack', rarity: 'uncommon', effect: 'ATTRIBUTE_BOOST', effect_data: { attribute: 'agility', advantage: 1 } };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })              // getShopItem
        .mockResolvedValue({ rows: [] });                     // UPDATE wallet + INSERT purchase

      ConsumableService.addToStash.mockResolvedValue({ id: 10, name: 'Agility Stimpack', quantity: 1 });

      const result = await shop.buyConsumable(mockClient, 1, 2);

      expect(result.success).toBe(true);
      expect(result.wallet).toBe(9500);
      expect(ConsumableService.addToStash).toHaveBeenCalledWith(
        mockClient, 1, expect.objectContaining({ name: 'Agility Stimpack', effect: 'ATTRIBUTE_BOOST' }),
      );
    });

    test('honors the requested quantity for the total cost', async () => {
      const item = { id: 2, type: 'consumable', price: 500, name: 'Agility Stimpack', rarity: 'uncommon', effect: 'ATTRIBUTE_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValue({ rows: [] });

      ConsumableService.addToStash.mockResolvedValue({ id: 10, quantity: 3 });

      const result = await shop.buyConsumable(mockClient, 1, 2, 3);
      expect(result.wallet).toBe(8500); // 10000 - (500 * 3)
    });
  });

  describe('seedShopItems', () => {
    test('inserts the 4 default ships and 13 default consumable items from the catalog', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await shop.seedShopItems(mockClient);

      const shipCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('stats, available'));
      const consumableCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('effect, effect_data, available'));
      expect(shipCalls).toHaveLength(3);
      expect(consumableCalls).toHaveLength(13); // 10 attribute boosts + HEAL + REPAIR + SPEED_BOOST
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
