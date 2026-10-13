/**
 * Item database: consumables, keys, story clues, relics (equippable, max 3) and lore records.
 */
export const RELIC_SLOTS = 3;

export const ITEMS = {
  vial: { id: 'vial', type: 'consumable', name: 'Blood Vial', heal: 0.45, desc: 'Preserved blood from the old herds. Drink with [H] to restore 45% of your health.' },

  sextonKey: { id: 'sextonKey', type: 'key', name: "Sexton's Key", desc: 'A heavy iron key on a rosary chain. It opens the cathedral doors.' },
  mayorKey: { id: 'mayorKey', type: 'key', name: "Mayor's Key", desc: 'A brass key engraved "Halden". It opens the Mayor\'s house in the Ashen Village.' },

  decree: { id: 'decree', type: 'clue', name: 'Clue: The Royal Decree', desc: 'The Treaty was to be renewed on the seventh night with the blood of the royal line. The King never came.' },
  ledger: { id: 'ledger', type: 'clue', name: "Clue: Mayor Halden's Ledger", desc: 'Villagers were taken north to the Blood Altar. The moon must drink a thousand souls — and one royal heart.' },
  journal: { id: 'journal', type: 'clue', name: "Clue: The Hunter's Journal", desc: 'The Countess is only a doorkeeper. The heir was found at the broken Treaty Stone — but "something used their hands".' },

  treatyShard: { id: 'treatyShard', type: 'relic', hidden: true, name: 'Shard of the Treaty Stone', desc: 'A sliver of moon-stone that still remembers the oath. +8% damage, +10 max health.', mods: { damage: 0.08, hp: 10 } },
  coin: { id: 'coin', type: 'relic', hidden: true, name: 'Moon-Eaten Coin', desc: "Silver the Countess paid for silence, gnawed by something with fangs. +15% experience gained.", mods: { xp: 0.15 } },
  saintEye: { id: 'saintEye', type: 'relic', hidden: true, name: "Weeping Saint's Eye", desc: 'A glass eye from a forest shrine that never stops crying. +12% movement speed.', mods: { speed: 0.12 } },
  rosary: { id: 'rosary', type: 'relic', name: 'Rosary of the Drowned Moon', desc: "Marta's husband carried it through forty hunts. +20 max health.", mods: { hp: 20 } },
  quill: { id: 'quill', type: 'relic', name: 'Raven-Feather Quill', desc: 'The hunter wrote his last truths with it. Abilities recharge 12% faster.', mods: { cdr: 0.12 } },
  thimble: { id: 'thimble', type: 'relic', name: 'Silver Thimble of St. Elise', desc: 'Worn through a hundred vigils. +25% stamina regeneration.', mods: { staminaRegen: 0.25 } },
  fang: { id: 'fang', type: 'relic', name: 'Fang of the First Night', desc: '+10% damage.', mods: { damage: 0.1 } },
  ashheart: { id: 'ashheart', type: 'relic', name: 'Heart of Ash', desc: 'A heart burned to cinders that still beats. +2 blood energy on every hit.', mods: { bloodOnHit: 2 } },
  veilpin: { id: 'veilpin', type: 'relic', name: "Countess's Veil-Pin", desc: 'Silver thorns that once held the veil. Blood energy regenerates 60% faster.', mods: { bloodRegen: 0.6 } },

  record1: { id: 'record1', type: 'record', name: 'Lost Record I — On the Treaty' },
  record2: { id: 'record2', type: 'record', name: 'Lost Record II — On the Hollowing' },
  record3: { id: 'record3', type: 'record', name: 'Lost Record III — On the Royal Line' },
  record4: { id: 'record4', type: 'record', name: 'Lost Record IV — On the Veiled Countess' },
  record5: { id: 'record5', type: 'record', name: 'Lost Record V — On the Door' },
};
