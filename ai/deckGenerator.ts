/**
 * AI Opponent Deck Generator
 * Generates balanced 60-card decks for 5 difficulty tiers.
 * Tier 1 = theme deck, Tier 5 = elite competitive.
 */

import type { CardData, EnergyType } from '@/engine/GameState';
import { ALL_CARDS, BASIC_ENERGY_CARDS } from '@/lib/cardUtils';
import { STARTER_DECKS } from '@/lib/starterDecks';

export type AIDifficulty = 1 | 2 | 3 | 4 | 5;

export interface GeneratedDeck {
  cards: CardData[];
  name: string;
  difficulty: AIDifficulty;
  strategy: string;
  totalCards: number;
  validationErrors: string[];
}

// ── WotC-era card pool ─────────────────────────────────────────────────────────
const WOTC_SETS = new Set([
  'Base', 'Jungle', 'Fossil', 'Team Rocket',
  'Neo Genesis', 'Base Set 2', 'Gym Heroes', 'Gym Challenge',
  'Neo Discovery', 'Neo Revelation', 'Neo Destiny',
]);

const POOL = ALL_CARDS.filter(c => WOTC_SETS.has(c.set));
const BROWSE = [...POOL, ...BASIC_ENERGY_CARDS];

// ── Key trainer IDs ────────────────────────────────────────────────────────────
const TID = {
  BILL:       'base1-91',
  OAK:        'base1-88',
  COMPUTER:   'base1-71',
  ITEM_FIND:  'base1-74',
  GOW:        'base1-93',   // Gust of Wind
  EREM:       'base1-92',   // Energy Removal
  SUPER_EREM: 'base1-79',   // Super Energy Removal
  SWITCH:     'base1-95',
  PLUSPOWER:  'base1-84',
  POTION:     'base1-94',
  SUPER_POT:  'base1-90',
  FULL_HEAL:  'base1-82',
  ENERGY_RET: 'base1-81',
  SCOOP_UP:   'base1-78',
  TRADER:     'base1-77',
  REVIVE:     'base1-89',
  DCE:        'base1-96',
  RAINBOW:    'base5-17',
} as const;

// ── RNG helpers ────────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Card helpers ───────────────────────────────────────────────────────────────
function cardById(id: string): CardData | undefined {
  return BROWSE.find(c => c.id === id);
}

function rpt(id: string, n: number): CardData[] {
  const card = cardById(id);
  if (!card) return [];
  return Array(n).fill(card);
}

function basicEnergy(type: EnergyType, n: number): CardData[] {
  const card = BASIC_ENERGY_CARDS.find(c => c.id === `basic-energy-${type.toLowerCase()}`);
  if (!card) return [];
  return Array(n).fill(card);
}

function primaryType(card: CardData): EnergyType | null {
  return (card.types?.[0] as EnergyType) ?? null;
}

// ── Evolution chain structures ─────────────────────────────────────────────────
interface EvolutionChain {
  basic: CardData;
  stage1?: CardData;
  stage2?: CardData;
  mainType: EnergyType | null;
  depth: number; // 1=basic-only, 2=basic+stage1, 3=full line
}

let _chainCache: EvolutionChain[] | null = null;

function getAllChains(): EvolutionChain[] {
  if (_chainCache) return _chainCache;

  const basics  = POOL.filter(c => c.supertype === 'Pokémon' && c.subtype === 'Basic');
  const stage1s = POOL.filter(c => c.supertype === 'Pokémon' && c.subtype === 'Stage 1');
  const stage2s = POOL.filter(c => c.supertype === 'Pokémon' && c.subtype === 'Stage 2');

  const chains: EvolutionChain[] = [];

  for (const basic of basics) {
    const bn = basic.name.toLowerCase();
    const s1s = stage1s.filter(s => s.evolvesFrom?.toLowerCase() === bn);

    if (s1s.length === 0) {
      chains.push({ basic, mainType: primaryType(basic), depth: 1 });
    } else {
      for (const s1 of s1s) {
        const s1n = s1.name.toLowerCase();
        const s2s = stage2s.filter(s => s.evolvesFrom?.toLowerCase() === s1n);
        if (s2s.length === 0) {
          chains.push({ basic, stage1: s1, mainType: primaryType(s1), depth: 2 });
        } else {
          for (const s2 of s2s) {
            chains.push({ basic, stage1: s1, stage2: s2, mainType: primaryType(s2), depth: 3 });
          }
        }
      }
    }
  }

  _chainCache = chains;
  return chains;
}

// ── Energy calculation ─────────────────────────────────────────────────────────
function countAttackEnergyCosts(pokemon: CardData[]): Map<EnergyType, number> {
  const tally = new Map<EnergyType, number>();
  for (const p of pokemon) {
    for (const atk of p.attacks ?? []) {
      for (const cost of atk.cost) {
        if (cost !== 'Colorless') {
          tally.set(cost, (tally.get(cost) ?? 0) + 1);
        }
      }
    }
  }
  return tally;
}

// Given typed energy demands → proportional energy counts adding to total
function buildEnergySlots(
  pokemon: CardData[],
  totalEnergy: number,
  forcedTypes?: EnergyType[],
  allowRainbow = false,
): CardData[] {
  const demands = countAttackEnergyCosts(pokemon);

  // Determine which types to use
  let types: EnergyType[] = forcedTypes?.length
    ? forcedTypes
    : [...demands.keys()];

  if (types.length === 0) {
    types = ['Colorless'];
  }

  const result: CardData[] = [];

  if (types.length === 1) {
    result.push(...basicEnergy(types[0], totalEnergy));
  } else if (types.length === 2) {
    // Weight by demand
    const d0 = demands.get(types[0]) ?? 1;
    const d1 = demands.get(types[1]) ?? 1;
    const total = d0 + d1;
    const n0 = Math.round((d0 / total) * totalEnergy);
    const n1 = totalEnergy - n0;
    result.push(...basicEnergy(types[0], n0));
    result.push(...basicEnergy(types[1], n1));
  } else {
    // 3+ types: use rainbow energy for spares, fill primary
    const sortedTypes = [...types].sort(
      (a, b) => (demands.get(b) ?? 0) - (demands.get(a) ?? 0),
    );
    const primaryT = sortedTypes[0];

    if (allowRainbow) {
      const rainbowCard = cardById(TID.RAINBOW);
      const rainbowCount = Math.min(4, Math.floor(totalEnergy * 0.3));
      if (rainbowCard) result.push(...Array(rainbowCount).fill(rainbowCard));
      result.push(...basicEnergy(primaryT, totalEnergy - rainbowCount));
    } else {
      // split evenly among top-2 types
      const n0 = Math.ceil(totalEnergy / 2);
      const n1 = totalEnergy - n0;
      result.push(...basicEnergy(sortedTypes[0], n0));
      result.push(...basicEnergy(sortedTypes[1], n1));
    }
  }

  return result;
}

// ── Deck validation ────────────────────────────────────────────────────────────
function validateDeck(cards: CardData[]): string[] {
  const errors: string[] = [];

  if (cards.length !== 60) errors.push(`Deck has ${cards.length} cards (expected 60)`);

  // Count copies
  const counts = new Map<string, number>();
  for (const c of cards) {
    const key = c.name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    const card = cards.find(c => c.name === name)!;
    const isBasicEnergy = card.supertype === 'Energy' && card.subtype === 'Basic';
    if (!isBasicEnergy && count > 4) {
      errors.push(`${name}: ${count} copies (max 4)`);
    }
  }

  // Must have at least 1 basic Pokemon
  const hasBasic = cards.some(c => c.supertype === 'Pokémon' && c.subtype === 'Basic');
  if (!hasBasic) errors.push('No basic Pokémon in deck');

  return errors;
}

// ── Tier 1: Official theme decks ───────────────────────────────────────────────
function generateTier1(): GeneratedDeck {
  const eligible = STARTER_DECKS.filter(d => d.prerequisiteSet === null);
  const chosen = pick(eligible);
  const cards = chosen.cardIds
    .map(id => BROWSE.find(c => c.id === id))
    .filter(Boolean) as CardData[];

  return {
    cards,
    name: chosen.name,
    difficulty: 1,
    strategy: chosen.description,
    totalCards: cards.length,
    validationErrors: validateDeck(cards),
  };
}

// ── Tier 2: Weak random deck ───────────────────────────────────────────────────
function generateTier2(): GeneratedDeck {
  // Pick 3–5 random types (chaotic)
  const allTypes: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting'];
  const typeCount = rand(3, 5);
  const chosenTypes = shuffle(allTypes).slice(0, typeCount);

  // Grab random basics from multiple types (18–26)
  const pokemonTarget = rand(18, 26);
  const pool = POOL.filter(
    c => c.supertype === 'Pokémon' && c.subtype === 'Basic' &&
    c.types?.some(t => chosenTypes.includes(t as EnergyType)),
  );
  const shuffledPool = shuffle(pool);

  const deckPokemon: CardData[] = [];
  const used = new Map<string, number>();

  for (const poke of shuffledPool) {
    if (deckPokemon.length >= pokemonTarget) break;
    const copies = (used.get(poke.name) ?? 0);
    if (copies >= 4) continue;
    // Sometimes add incomplete stage-1 evolutions (creates broken lines)
    const addCount = rand(1, Math.min(4 - copies, 3));
    for (let i = 0; i < addCount && deckPokemon.length < pokemonTarget; i++) {
      deckPokemon.push(poke);
      used.set(poke.name, (used.get(poke.name) ?? 0) + 1);
    }
  }

  // Occasionally toss in a lone stage-1 (can't be evolved to — orphan card)
  const stage1s = POOL.filter(c => c.supertype === 'Pokémon' && c.subtype === 'Stage 1');
  if (Math.random() < 0.5 && deckPokemon.length < pokemonTarget) {
    const orphan = pick(stage1s.filter(s => s.types?.some(t => chosenTypes.includes(t as EnergyType))));
    if (orphan) {
      const add = Math.min(rand(1, 2), pokemonTarget - deckPokemon.length);
      for (let i = 0; i < add; i++) deckPokemon.push(orphan);
    }
  }

  // Small trainer suite (8–12)
  const trainerTarget = rand(8, 12);
  const weakTrainers: CardData[] = [
    ...rpt(TID.POTION,    rand(1, 2)),
    ...rpt(TID.BILL,      rand(1, 2)),
    ...rpt(TID.SWITCH,    rand(1, 2)),
    ...rpt(TID.FULL_HEAL, rand(0, 1)),
    ...rpt(TID.EREM,      rand(0, 1)),
  ].slice(0, trainerTarget);

  // Random rainbow (sometimes, tier 2 has it just because)
  if (Math.random() < 0.3) {
    weakTrainers.push(...rpt(TID.RAINBOW, rand(1, 2)));
  }

  const nonEnergyCount = deckPokemon.length + weakTrainers.length;
  const energyTarget = 60 - nonEnergyCount;
  const energyTypes = shuffle(chosenTypes).slice(0, 3); // use up to 3 types — messy
  const energy = buildEnergySlots(deckPokemon, energyTarget, energyTypes, false);

  const cards = [...deckPokemon, ...weakTrainers, ...energy].slice(0, 60);

  // Pad with energy if short
  while (cards.length < 60) {
    cards.push(basicEnergy(pick(energyTypes), 1)[0]);
  }

  const typeStr = chosenTypes.join('/');
  return {
    cards,
    name: `Rookie ${typeStr} Mix`,
    difficulty: 2,
    strategy: `A chaotic mix of ${typeStr} basics with minimal support`,
    totalCards: cards.length,
    validationErrors: validateDeck(cards),
  };
}

// ── Tier 3: Casual constructed ─────────────────────────────────────────────────
function generateTier3(): GeneratedDeck {
  const allTypes: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting'];
  const numTypes = Math.random() < 0.5 ? 1 : 2;
  const chosenTypes = shuffle(allTypes).slice(0, numTypes) as EnergyType[];

  const allChains = getAllChains();

  // Pick 2 evolution lines (depth 2 preferred, depth 1 okay)
  const matchingChains = shuffle(
    allChains.filter(ch => ch.mainType && chosenTypes.includes(ch.mainType) && ch.depth >= 2),
  );

  const pickedChains: EvolutionChain[] = [];
  const usedNames = new Set<string>();

  for (const ch of matchingChains) {
    if (pickedChains.length >= 2) break;
    if (usedNames.has(ch.basic.name)) continue;
    pickedChains.push(ch);
    usedNames.add(ch.basic.name);
    if (ch.stage1) usedNames.add(ch.stage1.name);
  }

  if (pickedChains.length === 0) {
    // Fallback: just pick random basics from matching types
    return generateTier2();
  }

  const deckPokemon: CardData[] = [];
  const pokeCounts = new Map<string, number>();

  function addPoke(card: CardData, n: number) {
    const cur = pokeCounts.get(card.name) ?? 0;
    const add = Math.min(n, 4 - cur);
    for (let i = 0; i < add; i++) deckPokemon.push(card);
    pokeCounts.set(card.name, cur + add);
  }

  // Add evolution lines
  for (const chain of pickedChains) {
    addPoke(chain.basic, chain.stage1 ? rand(3, 4) : rand(2, 4));
    if (chain.stage1) addPoke(chain.stage1, rand(2, 3));
  }

  // Add 3–5 backup basics
  const backupPool = shuffle(
    POOL.filter(
      c => c.supertype === 'Pokémon' && c.subtype === 'Basic' &&
        c.types?.some(t => chosenTypes.includes(t as EnergyType)) &&
        !usedNames.has(c.name),
    ),
  );
  let backupAdded = 0;
  for (const bp of backupPool) {
    if (backupAdded >= 4 || deckPokemon.length >= 22) break;
    addPoke(bp, rand(1, 2));
    backupAdded++;
  }

  // Casual trainer suite (12–16)
  const trainers: CardData[] = [
    ...rpt(TID.BILL,    2),
    ...rpt(TID.OAK,     1),
    ...rpt(TID.POTION,  2),
    ...rpt(TID.SWITCH,  2),
    ...rpt(TID.GOW,     1),
    ...rpt(TID.EREM,    2),
    ...rpt(TID.ENERGY_RET, 1),
  ];

  const nonEnergyCount = deckPokemon.length + trainers.length;
  const energyTarget = Math.min(26, 60 - nonEnergyCount);
  const energyCards = buildEnergySlots(deckPokemon, Math.max(energyTarget, 20), chosenTypes, false);

  const raw = [...deckPokemon, ...trainers, ...energyCards];
  const cards = padOrTrim(raw, deckPokemon, chosenTypes);

  const typeStr = chosenTypes.join('/');
  const primaryChain = pickedChains[0];
  const heroName = primaryChain.stage1?.name ?? primaryChain.basic.name;

  return {
    cards,
    name: `${heroName} Casual`,
    difficulty: 3,
    strategy: `Casual ${typeStr} deck built around ${heroName}`,
    totalCards: cards.length,
    validationErrors: validateDeck(cards),
  };
}

// ── Tier 4: Strong constructed ─────────────────────────────────────────────────
function generateTier4(): GeneratedDeck {
  const allTypes: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting'];
  const numTypes = Math.random() < 0.4 ? 1 : 2;
  const chosenTypes = shuffle(allTypes).slice(0, numTypes) as EnergyType[];

  const allChains = getAllChains();

  // Prefer deeper chains (stage2 or solid stage1)
  const deepChains = shuffle(
    allChains.filter(ch => ch.mainType && chosenTypes.includes(ch.mainType) && ch.depth >= 2),
  );

  const pickedChains: EvolutionChain[] = [];
  const usedNames = new Set<string>();

  for (const ch of deepChains) {
    if (pickedChains.length >= 2) break;
    if (usedNames.has(ch.basic.name)) continue;
    pickedChains.push(ch);
    usedNames.add(ch.basic.name);
    if (ch.stage1) usedNames.add(ch.stage1.name);
  }

  if (pickedChains.length === 0) return generateTier3();

  const deckPokemon: CardData[] = [];
  const pokeCounts = new Map<string, number>();

  function addPoke(card: CardData, n: number) {
    const cur = pokeCounts.get(card.name) ?? 0;
    const add = Math.min(n, 4 - cur);
    for (let i = 0; i < add; i++) deckPokemon.push(card);
    pokeCounts.set(card.name, cur + add);
  }

  // Full evolution lines — no incomplete lines
  for (const chain of pickedChains) {
    if (chain.depth === 3) {
      addPoke(chain.basic,  4);
      addPoke(chain.stage1!, 3);
      addPoke(chain.stage2!, 2);
    } else {
      addPoke(chain.basic,  4);
      addPoke(chain.stage1!, 3);
    }
  }

  // 2–3 strong basics as support (good attackers, not needing evo)
  const strongBasics = shuffle(
    POOL.filter(c =>
      c.supertype === 'Pokémon' && c.subtype === 'Basic' &&
      c.types?.some(t => chosenTypes.includes(t as EnergyType)) &&
      !usedNames.has(c.name) &&
      (c.attacks ?? []).some(a => a.damage >= 30),
    ),
  );
  let supportAdded = 0;
  for (const bp of strongBasics) {
    if (supportAdded >= 3 || deckPokemon.length >= 20) break;
    addPoke(bp, rand(2, 3));
    supportAdded++;
  }

  // Strong trainer suite (16–20)
  const trainers: CardData[] = [
    ...rpt(TID.BILL,       4),
    ...rpt(TID.OAK,        2),
    ...rpt(TID.GOW,        3),
    ...rpt(TID.EREM,       3),
    ...rpt(TID.SWITCH,     2),
    ...rpt(TID.PLUSPOWER,  2),
    ...rpt(TID.POTION,     1),
    ...rpt(TID.ENERGY_RET, 1),
    ...rpt(TID.TRADER,     1),
  ].filter(c => c !== undefined);

  const nonEnergyCount = deckPokemon.length + trainers.length;
  const energyTarget = 60 - nonEnergyCount;
  const capped = Math.min(Math.max(energyTarget, 18), 24);
  const energyCards = buildEnergySlots(deckPokemon, capped, chosenTypes, false);

  const raw = [...deckPokemon, ...trainers, ...energyCards];
  const cards = padOrTrim(raw, deckPokemon, chosenTypes);

  const typeStr = chosenTypes.join('/');
  const heroChain = pickedChains[0];
  const heroName = heroChain.stage2?.name ?? heroChain.stage1?.name ?? heroChain.basic.name;

  return {
    cards,
    name: `${heroName} Strong`,
    difficulty: 4,
    strategy: `Strong ${typeStr} build around ${heroName} with full trainer support`,
    totalCards: cards.length,
    validationErrors: validateDeck(cards),
  };
}

// ── Tier 5: Elite AI ───────────────────────────────────────────────────────────

// Curated pool of high-value attackers for Tier 5 (IDs from Base/Jungle/Fossil)
const ELITE_ATTACKERS: string[] = [
  'base1-4',   // Charizard
  'base1-2',   // Blastoise
  'base1-15',  // Venusaur
  'base1-1',   // Alakazam
  'base1-8',   // Machamp
  'base1-9',   // Magneton
  'base1-11',  // Ninetales
  'base1-18',  // Dewgong
  'base2-5',   // Clefable (Jungle)
  'base2-3',   // Scyther (Jungle - Basic)
  'base2-4',   // Pinsir (Jungle)
  'base2-6',   // Snorlax (Jungle)
  'base2-2',   // Electrode (Jungle)
  'base2-12',  // Flareon (Jungle)
  'base2-17',  // Jolteon (Jungle)
  'base2-28',  // Vaporeon (Jungle)
  'base3-1',   // Aerodactyl (Fossil)
  'base3-2',   // Ditto (Fossil)
  'base3-4',   // Haunter (Fossil)
  'base3-6',   // Lapras (Fossil)
  'base3-9',   // Muk (Fossil)
  'base3-11',  // Raichu (Fossil)
];

function generateTier5(): GeneratedDeck {
  const allChains = getAllChains();

  // Step 1: Pick 1–2 focus types
  const allTypes: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting'];
  const numTypes = Math.random() < 0.5 ? 1 : 2;
  const chosenTypes = shuffle(allTypes).slice(0, numTypes) as EnergyType[];

  // Step 2: Find best chains for chosen types (prefer stage2 for elite power)
  const eligibleChains = allChains.filter(
    ch => ch.mainType && chosenTypes.includes(ch.mainType) && ch.depth >= 2,
  );

  // Score chains: depth*10 + avg max damage of stage2/stage1
  function scoreChain(ch: EvolutionChain): number {
    const topCard = ch.stage2 ?? ch.stage1 ?? ch.basic;
    const maxDmg = Math.max(0, ...(topCard.attacks ?? []).map(a => a.damage));
    return ch.depth * 10 + (maxDmg > 0 ? maxDmg / 10 : 0);
  }

  const sortedChains = [...eligibleChains].sort((a, b) => scoreChain(b) - scoreChain(a));

  // Step 3: Select up to 3 evolution lines
  const pickedChains: EvolutionChain[] = [];
  const usedNames = new Set<string>();

  // Primary line (must have attacker)
  for (const ch of sortedChains) {
    if (pickedChains.length >= 3) break;
    if (usedNames.has(ch.basic.name)) continue;
    pickedChains.push(ch);
    usedNames.add(ch.basic.name);
    if (ch.stage1) usedNames.add(ch.stage1.name);
    if (ch.stage2) usedNames.add(ch.stage2.name);
  }

  if (pickedChains.length === 0) return generateTier4();

  // Step 4: Build Pokemon list — full lines
  const deckPokemon: CardData[] = [];
  const pokeCounts = new Map<string, number>();

  function addPoke(card: CardData, n: number) {
    const cur = pokeCounts.get(card.name) ?? 0;
    const add = Math.min(n, 4 - cur);
    for (let i = 0; i < add; i++) deckPokemon.push(card);
    pokeCounts.set(card.name, cur + add);
  }

  for (const chain of pickedChains) {
    if (chain.depth === 3) {
      addPoke(chain.basic,   4);
      addPoke(chain.stage1!, 3);
      addPoke(chain.stage2!, 3);
    } else {
      addPoke(chain.basic,   4);
      addPoke(chain.stage1!, 4);
    }
  }

  // Step 4b: 2–4 standalone support basics
  const supportPool = shuffle(
    POOL.filter(c =>
      c.supertype === 'Pokémon' && c.subtype === 'Basic' &&
      c.types?.some(t => chosenTypes.includes(t as EnergyType)) &&
      !usedNames.has(c.name) &&
      (c.attacks ?? []).some(a => a.damage >= 40),
    ),
  );
  let supportAdded = 0;
  for (const sup of supportPool) {
    if (supportAdded >= 3 || deckPokemon.length >= 22) break;
    addPoke(sup, rand(2, 3));
    supportAdded++;
  }

  // Step 5: Full trainer suite (elite tier)
  const trainers: CardData[] = [
    ...rpt(TID.BILL,       4),
    ...rpt(TID.OAK,        4),
    ...rpt(TID.COMPUTER,   4),
    ...rpt(TID.GOW,        3),
    ...rpt(TID.EREM,       3),
    ...rpt(TID.SUPER_EREM, 2),
    ...rpt(TID.SWITCH,     2),
    ...rpt(TID.PLUSPOWER,  3),
    ...rpt(TID.ITEM_FIND,  2),
    ...rpt(TID.SCOOP_UP,   2),
  ].filter(c => c !== undefined);

  // Step 6–7: Calculate energy
  const nonEnergyCount = deckPokemon.length + trainers.length;
  const energyTarget = 60 - nonEnergyCount;
  const clampedEnergy = Math.min(Math.max(energyTarget, 18), 24);

  // Use Rainbow only for dual-type elite builds
  const useRainbow = chosenTypes.length >= 2 && Math.random() < 0.4;
  const energyCards = buildEnergySlots(deckPokemon, clampedEnergy, chosenTypes, useRainbow);

  const raw = [...deckPokemon, ...trainers, ...energyCards];
  const cards = padOrTrim(raw, deckPokemon, chosenTypes);

  const typeStr = chosenTypes.join('/');
  const heroChain = pickedChains[0];
  const heroName = heroChain.stage2?.name ?? heroChain.stage1?.name ?? heroChain.basic.name;
  const strategyLabel = `Elite ${typeStr} — ${pickedChains.map(c => c.stage2?.name ?? c.stage1?.name ?? c.basic.name).join(' + ')}`;

  return {
    cards,
    name: `${heroName} Elite`,
    difficulty: 5,
    strategy: strategyLabel,
    totalCards: cards.length,
    validationErrors: validateDeck(cards),
  };
}

// ── Padding / trimming to exactly 60 ──────────────────────────────────────────
function padOrTrim(
  raw: CardData[],
  pokemon: CardData[],
  energyTypes: EnergyType[],
): CardData[] {
  if (raw.length === 60) return raw;

  if (raw.length > 60) {
    // Trim excess energy first, then extra Pokemon (keep trainers)
    const cards = [...raw];
    const energyIndices = cards
      .map((c, i) => (c.supertype === 'Energy' ? i : -1))
      .filter(i => i >= 0)
      .reverse();
    let excess = cards.length - 60;
    for (const i of energyIndices) {
      if (excess <= 0) break;
      cards.splice(i, 1);
      excess--;
    }
    // If still too long, trim Pokemon extras
    const pokeIndices = cards
      .map((c, i) => (c.supertype === 'Pokémon' ? i : -1))
      .filter(i => i >= 0)
      .reverse();
    for (const i of pokeIndices) {
      if (cards.length <= 60) break;
      cards.splice(i, 1);
    }
    return cards.slice(0, 60);
  }

  // Pad with basic energy of primary type
  const result = [...raw];
  const primaryT = energyTypes[0] ?? primaryType(pokemon[0] ?? null as unknown as CardData) ?? 'Fire';
  while (result.length < 60) {
    result.push(basicEnergy(primaryT as EnergyType, 1)[0]);
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function generateAIDeck(tier: AIDifficulty): GeneratedDeck {
  switch (tier) {
    case 1: return generateTier1();
    case 2: return generateTier2();
    case 3: return generateTier3();
    case 4: return generateTier4();
    case 5: return generateTier5();
  }
}

// Difficulty display helpers
export const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  1: 'Theme Deck',
  2: 'Rookie',
  3: 'Casual',
  4: 'Strong',
  5: 'Elite',
};

export const DIFFICULTY_DESCRIPTIONS: Record<AIDifficulty, string> = {
  1: 'Official WotC theme deck — balanced starter experience',
  2: 'Chaotic mix of basics — weak consistency, messy energy',
  3: 'Coherent type strategy, basic evolution lines',
  4: 'Full evolution lines, strong trainer suite',
  5: 'Optimal attackers, elite trainer package, precise energy',
};

export const DIFFICULTY_COLORS: Record<AIDifficulty, string> = {
  1: 'text-gray-300',
  2: 'text-green-400',
  3: 'text-blue-400',
  4: 'text-yellow-400',
  5: 'text-red-400',
};
