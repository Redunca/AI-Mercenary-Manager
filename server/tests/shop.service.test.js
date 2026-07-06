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
    test('retourne les articles disponibles', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      await shop.getShopItems(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE available = TRUE'),
      );
    });
  });

  describe('getShopItem', () => {
    test('retourne null si l\'article est introuvable', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await shop.getShopItem(mockClient, 999);
      expect(result).toBeNull();
    });

    test('retourne l\'article s\'il existe', async () => {
      const item = { id: 1, name: 'Corsaire', type: 'ship', price: 5000 };
      mockClient.query.mockResolvedValue({ rows: [item] });
      const result = await shop.getShopItem(mockClient, 1);
      expect(result).toEqual(item);
    });
  });

  describe('getPlayerWallet', () => {
    test('retourne le solde du joueur', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ wallet: 8000 }] });
      const result = await shop.getPlayerWallet(mockClient, 1);
      expect(result).toBe(8000);
    });

    test('retourne 0 si le joueur est introuvable', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await shop.getPlayerWallet(mockClient, 99);
      expect(result).toBe(0);
    });
  });

  describe('buyShip', () => {
    test('retourne une erreur si le navire est introuvable', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [] });                  // getShopItem → not found

      const result = await shop.buyShip(mockClient, 1, 99);
      expect(result.error).toBeDefined();
    });

    test('retourne une erreur si les crédits sont insuffisants', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsaire', rarity: 'common', stats: {} };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 100 }] })   // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] });              // getShopItem

      const result = await shop.buyShip(mockClient, 1, 1);
      expect(result.error).toBe('Crédit insuffisant');
    });

    test('achète un navire avec succès et déduit le prix du portefeuille', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsaire', rarity: 'common', stats: { speed: 120 } };
      const createdShip = { id: 2, name: 'Corsaire' };
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

    test('appelle createShip avec les bonnes données', async () => {
      const item = { id: 1, type: 'ship', price: 5000, name: 'Corsaire', rarity: 'common', stats: { speed: 120 } };
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
        expect.objectContaining({ id: 3, name: 'Corsaire', rarity: 'common' }),
      );
    });
  });

  describe('buyEquipment', () => {
    test('retourne une erreur si l\'équipement est introuvable', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] })
        .mockResolvedValueOnce({ rows: [] }); // getShopItem → not found

      const result = await shop.buyEquipment(mockClient, 1, 99);
      expect(result.error).toBeDefined();
    });

    test('retourne une erreur si les crédits sont insuffisants', async () => {
      const item = { id: 2, type: 'equipment', price: 1000, name: 'Blindage Renforcé', rarity: 'common', effect: 'DURABILITY_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 100 }] })
        .mockResolvedValueOnce({ rows: [item] });

      const result = await shop.buyEquipment(mockClient, 1, 2);
      expect(result.error).toBe('Crédit insuffisant');
    });

    test('crée un nouvel équipement quand le joueur n\'en possède pas', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Blindage Renforcé', rarity: 'common', effect: 'DURABILITY_BOOST' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })              // getShopItem
        .mockResolvedValueOnce({ rows: [] })                  // SELECT existing equipment → aucun
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

    test('incrémente la quantité si l\'équipement existe déjà', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Blindage Renforcé', rarity: 'common', effect: 'DURABILITY_BOOST' };
      const existing = { id: 10, name: 'Blindage Renforcé', quantity: 1 };
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ wallet: 10000 }] }) // SELECT wallet FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] })              // getShopItem
        .mockResolvedValueOnce({ rows: [existing] })          // SELECT existing equipment → trouvé
        .mockResolvedValue({ rows: [] });                     // UPDATE quantity + UPDATE wallet + INSERT purchase

      const result = await shop.buyEquipment(mockClient, 1, 2);
      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE equipment SET quantity'),
        expect.any(Array),
      );
    });

    test('respecte la quantité demandée pour le coût total', async () => {
      const item = { id: 2, type: 'equipment', price: 500, name: 'Blindage Renforcé', rarity: 'common', effect: 'DURABILITY_BOOST' };
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
});
