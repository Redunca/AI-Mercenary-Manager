// Open Legend RAW (06-wealth-equipment): armor only grants its Guard bonus
// if the wearer's Fortitude meets the armor's Required Fortitude; otherwise
// it's dead weight. Recomputed live from current attributes rather than
// cached, so it reacts to attribute changes (e.g. perks/flaws, leveling).
function computeArmorGuardBonus(attributes, equippedArmor) {
  if (!equippedArmor) return 0
  if ((attributes.fortitude || 0) < equippedArmor.requiredFortitude) return 0
  return equippedArmor.guardBonus
}

module.exports = { computeArmorGuardBonus }
