-- Tokens are a second mission-reward currency alongside wallet (credits),
-- awarded on mission completion based on how many of the mission's events
-- succeeded (see server/src/utils/tokenReward.js). Like wallet, this is a
-- flat running counter rather than a ledger table: there is no need to
-- reconstruct a history of individual token grants/spends, only the
-- current balance, so a single INT column on players is sufficient (mirrors
-- the existing wallet column rather than, say, purchase_history).
ALTER TABLE players ADD COLUMN IF NOT EXISTS tokens INT NOT NULL DEFAULT 0;
