const ConsumableService = require('../src/services/consumable.service');

jest.mock('../src/db/pool');

describe('Consumable Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { query: jest.fn() };
    jest.clearAllMocks();
  });

  test('getPlayerConsumables retrieves the stash only when asked', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await ConsumableService.getPlayerConsumables(mockClient, 1, true);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship IS NULL'),
      [1]
    );
  });

  test('getShipInventory lists consumables assigned to a ship', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, assigned_to_ship: 5 }] });

    const result = await ConsumableService.getShipInventory(mockClient, 5);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_ship = $1'),
      [5]
    );
    expect(result).toEqual([{ id: 1, assigned_to_ship: 5 }]);
  });

  describe('countShipInventoryEffect', () => {
    test('returns the summed quantity for the matching effect', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ total: 3 }] });

      const result = await ConsumableService.countShipInventoryEffect(mockClient, 5, 'HEAL');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE assigned_to_ship = $1 AND effect = $2'),
        [5, 'HEAL']
      );
      expect(result).toBe(3);
    });

    test('returns 0 when nothing matches', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ total: 0 }] });

      const result = await ConsumableService.countShipInventoryEffect(mockClient, 5, 'HEAL');

      expect(result).toBe(0);
    });
  });

  describe('addToStash', () => {
    test('creates a new row when no stack exists yet', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // lookup existing stack
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Agility Stimpack', quantity: 1 }] }); // insert

      const result = await ConsumableService.addToStash(mockClient, 1, {
        name: 'Agility Stimpack', description: 'desc', rarity: 'uncommon', price: 400,
        effect: 'ATTRIBUTE_BOOST', effectData: { attribute: 'agility', advantage: 1 },
      });

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO consumables'),
        expect.any(Array)
      );
      expect(result.name).toBe('Agility Stimpack');
    });

    test('merges into an existing stack instead of duplicating', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 7, quantity: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 7, quantity: 3 }] });

      const result = await ConsumableService.addToStash(mockClient, 1, {
        name: 'Overdrive Injector', rarity: 'uncommon', price: 1200, effect: 'SPEED_BOOST', quantity: 1,
      });

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE consumables SET quantity = quantity + $1'),
        [1, 7]
      );
      expect(result.quantity).toBe(3);
    });
  });

  describe('assignToShip / unassignFromShip', () => {
    test('moves a full stack from the stash onto a ship', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, player_id: 1, name: 'Trauma Nanites', quantity: 1, assigned_to_ship: null }] }) // getConsumable
        .mockResolvedValueOnce({ rows: [] }) // DELETE (quantity === requested)
        .mockResolvedValueOnce({ rows: [] }) // lookup existing ship stack
        .mockResolvedValueOnce({ rows: [{ id: 2, assigned_to_ship: 9, quantity: 1 }] }); // insert onto ship

      const result = await ConsumableService.assignToShip(mockClient, 1, 1, 9, 1);

      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('DELETE FROM consumables'), [1]);
      expect(result.assigned_to_ship).toBe(9);
    });

    test('refuses to move more than is available', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, player_id: 1, quantity: 1 }] });

      const result = await ConsumableService.assignToShip(mockClient, 1, 1, 9, 5);

      expect(result).toBeNull();
    });

    test('refuses to move a consumable belonging to another player', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, player_id: 2, quantity: 1 }] });

      const result = await ConsumableService.assignToShip(mockClient, 1, 1, 9, 1);

      expect(result).toBeNull();
    });

    test('unassignFromShip moves a stack back to the stash (assigned_to_ship IS NULL)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, player_id: 1, name: 'Trauma Nanites', quantity: 1, assigned_to_ship: 9 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 3, assigned_to_ship: null, quantity: 1 }] });

      const result = await ConsumableService.unassignFromShip(mockClient, 1, 1, 1);

      expect(mockClient.query).toHaveBeenNthCalledWith(3,
        expect.stringContaining('assigned_to_ship IS NULL'), [1, 'Trauma Nanites']);
      expect(result.assigned_to_ship).toBeNull();
    });
  });

  describe('consumeFromShipInventory', () => {
    test('returns null when nothing matches', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await ConsumableService.consumeFromShipInventory(mockClient, 9, 'HEAL');

      expect(result).toBeNull();
    });

    test('decrements quantity when more than one remains', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, effect: 'HEAL', quantity: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ConsumableService.consumeFromShipInventory(mockClient, 9, 'HEAL');

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('SET quantity = quantity - 1'), [1]);
      expect(result.id).toBe(1);
    });

    test('deletes the row once the last unit is consumed', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, effect: 'REPAIR', quantity: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await ConsumableService.consumeFromShipInventory(mockClient, 9, 'REPAIR');

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('DELETE FROM consumables'), [1]);
    });

    test('filters candidates by effect_data when a matcher is given', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { id: 1, effect: 'ATTRIBUTE_BOOST', effect_data: { attribute: 'might' }, quantity: 1 },
          { id: 2, effect: 'ATTRIBUTE_BOOST', effect_data: { attribute: 'agility' }, quantity: 1 },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await ConsumableService.consumeFromShipInventory(
        mockClient, 9, 'ATTRIBUTE_BOOST', data => data.attribute === 'agility'
      );

      expect(result.id).toBe(2);
    });
  });
});
