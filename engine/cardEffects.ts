// Comprehensive card-specific effect resolution for Base Set through Team Rocket + Black Star Promos.

import type {
  GameState, PlayerState, CardData, CardInstance, InPlayPokemon,
  CardAttack, EnergyType, EnergyInstance, StatusCondition,
} from './GameState';
import { isBasicPokemon, isPokemon, makeUID, makeCardInstance } from '@/lib/cardUtils';

// ─── helpers ────────────────────────────────────────────────────────────────

// Flip subscriber — lets the UI show a coin animation for every flip() call.
let _flipSubs: Array<(result: boolean) => void> = [];
export function subscribeToFlips(fn: (result: boolean) => void): () => void {
  _flipSubs.push(fn);
  return () => { _flipSubs = _flipSubs.filter(f => f !== fn); };
}
export function flip(): boolean {
  const result = Math.random() < 0.5;
  _flipSubs.forEach(fn => fn(result));
  return result;
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function fakeEnergyCard(type: EnergyType, cardId: string): CardInstance {
  return makeCardInstance({
    id: cardId, name: `${type} Energy`, set: 'Basic', setCode: 'basic',
    number: '0', rarity: '', supertype: 'Energy', subtype: 'Basic',
    evolvesFrom: null, hp: null, types: [type], attacks: [], abilities: [],
    weaknesses: [], resistances: [], retreatCost: [], rules: [],
    localImagePath: null, apiImageUrl: null,
  });
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function statusFromText(text: string): StatusCondition | null {
  const t = text.toLowerCase();
  if (t.includes('asleep')) return 'Asleep';
  if (t.includes('paralyz')) return 'Paralyzed';
  if (t.includes('poison')) return 'Poisoned';
  if (t.includes('confus')) return 'Confused';
  if (t.includes('burn')) return 'Burned';
  return null;
}

// ─── Attack Effects ──────────────────────────────────────────────────────────

export interface AttackEffects {
  rawDamage: number;          // damage to apply (before W/R scaling)
  bonusDamage: number;        // flat bonus added AFTER W/R (PlusPower, bench bonus, etc.)
  recoil: number;             // damage dealt to attacker
  selfKO: boolean;            // attacker KOs itself
  opponentBenchDmg: number;   // damage to each opponent bench pokemon (ignores W/R)
  ownBenchDmg: number;        // damage to own bench pokemon (ignores W/R)
  discardAttackerEnergy: number;     // discard N energy from attacker
  discardAllAttackerEnergy: boolean; // discard ALL energy from attacker
  discardOpponentEnergy: number;     // discard N energy from defender's active
  forceOpponentSwitch: boolean;      // force opponent to swap active with bench
  returnDefender: boolean;           // return defending pokemon + cards to opponent's hand
  defenderStatus: StatusCondition | null | false;
  // false = skip status (handled elsewhere), null = no status, StatusCondition = apply
  defenderStatuses: StatusCondition[]; // multi-status (non-empty overrides defenderStatus path)
  selfStatus: StatusCondition | null; // apply to ATTACKER
  drawCards: number;
  coinMsg: string;
  cantAttackSelf: boolean;   // Leer: if heads, defender can't attack attacker next turn
  sandAttackSelf: boolean;   // Sand Attack: defender must flip coin to attack next turn (tails = fails)
  selfHeal: number;          // remove this many damage from attacker if damage was dealt (Leech Seed = 10)
  applySnivel: boolean;      // Cubone Snivel: defender's next attack vs attacker deals 20 less
}

export function computeAttackEffects(
  atk: CardAttack,
  attackerPokemon: InPlayPokemon,
  defenderPokemon: InPlayPokemon,
  attackerBenchCount: number,  // number of attacker's bench pokemon
): AttackEffects {
  const text = atk.text ?? '';
  const t = text.toLowerCase();

  const res: AttackEffects = {
    rawDamage: atk.damage,
    bonusDamage: 0,
    recoil: 0,
    selfKO: false,
    opponentBenchDmg: 0,
    ownBenchDmg: 0,
    discardAttackerEnergy: 0,
    discardAllAttackerEnergy: false,
    discardOpponentEnergy: 0,
    forceOpponentSwitch: false,
    returnDefender: false,
    defenderStatus: false,
    defenderStatuses: [],
    selfStatus: null,
    drawCards: 0,
    coinMsg: '',
    cantAttackSelf: false,
    sandAttackSelf: false,
    selfHeal: 0,
    applySnivel: false,
  };

  const cardId = attackerPokemon.card.id;

  // ── Nidoking Toxic — bad poison (20 damage between turns instead of 10) ──────
  if (atk.name === 'Toxic' && (cardId === 'base1-11' || attackerPokemon.card.name === 'Nidoking')) {
    res.defenderStatus = 'Toxic';
    return res;
  }

  // ── Big Eggsplosion (Jungle Exeggutor base2-35) ─────────────────────────────
  // Flip a coin for each Energy card attached to Exeggutor; 20 damage per heads.
  // The coin count is dynamic (= attached energy count), so the generic multi-coin
  // regex ("Flip N coins") doesn't fire — needs its own handler.
  if (atk.name === 'Big Eggsplosion' && (cardId === 'base2-35' || attackerPokemon.card.name === 'Exeggutor')) {
    const numFlips = attackerPokemon.attachedEnergy.length; // energy cards, not symbols
    let heads = 0;
    for (let i = 0; i < numFlips; i++) if (flip()) heads++;
    res.rawDamage = 20 * heads;
    res.coinMsg = numFlips === 0
      ? '(no energy attached — 0 damage)'
      : `(${heads}/${numFlips} heads)`;
    res.defenderStatus = null;
    return res;
  }

  // ── Venom Powder (Venomoth base1-29) — coin flip; heads = Poisoned + Confused ─
  if ((cardId === 'base1-29' || attackerPokemon.card.name === 'Venomoth') && atk.name === 'Venom Powder') {
    const heads = flip();
    res.coinMsg = heads ? '(heads! — Poisoned + Confused!)' : '(tails — no effect)';
    if (heads) res.defenderStatuses = ['Poisoned', 'Confused'];
    res.defenderStatus = null; // skip the generic single-status path
    return res;
  }

  // ── Selfdestruct / Explosion ─────────────────────────────────────────────
  if (atk.name === 'Selfdestruct' || atk.name === 'Explosion') {
    const m = text.match(/does\s+(\d+)\s+damage to each/i);
    const benchDmg = m ? parseInt(m[1]) : 20;
    res.opponentBenchDmg = benchDmg;
    res.ownBenchDmg = benchDmg;
    res.selfKO = true;
    res.defenderStatus = null;
    return res;
  }

  // ── Force-switch attacks (Lure, Hurricane) ───────────────────────────────
  if (/switch it with his or her active pok[eé]mon/i.test(text)) {
    res.forceOpponentSwitch = true;
    res.rawDamage = 0;
    res.defenderStatus = null;
    return res;
  }

  // ── Return defender to hand (Pidgeot Hurricane) ──────────────────────────
  if (/return the defending pok[eé]mon and all cards attached.*?your opponent's hand/i.test(text)) {
    res.returnDefender = true;
    res.defenderStatus = null;
    return res;
  }

  // ── Multi-coin: "Flip N coins. This attack does X damage times the number of heads." ──
  const multiM = text.match(/flip\s+(\d+)\s+coins?\.\s*this attack does\s+(\d+)\s+damage\s*(?:times the number of|for each)\s*heads?/i);
  if (multiM) {
    const nFlips = parseInt(multiM[1]);
    const dmgPer = parseInt(multiM[2]);
    let heads = 0;
    for (let i = 0; i < nFlips; i++) if (flip()) heads++;
    res.rawDamage = dmgPer * heads;
    res.coinMsg = `(${heads}/${nFlips} heads)`;
    // Self-confusion after attack (Vileplume Petal Dance)
    if (/is now confused \(after/i.test(text)) res.selfStatus = 'Confused';
    res.defenderStatus = null; // no status on multi-flip cards
    return res;
  }

  // ── Thrash-style: "If heads, +Y more damage; if tails, [Name] does Z to itself." ──
  // Must be checked BEFORE Quick Attack — Thunderpunch matches both patterns but needs recoil on tails.
  const thrashM = text.match(/if heads.*?(\d+)\s*more damage.*?if tails.*?does\s+(\d+)\s+damage to itself/i);
  if (thrashM) {
    const bonus = parseInt(thrashM[1]);
    const recoilAmt = parseInt(thrashM[2]);
    const heads = flip();
    if (heads) res.bonusDamage = bonus;
    else res.recoil = recoilAmt;
    res.coinMsg = `(coin: ${heads ? `heads +${bonus}` : `tails, ${recoilAmt} recoil`})`;
    res.defenderStatus = null;
    return res;
  }

  // ── Quick Attack: "If heads, X damage plus Y more; if tails, X damage." ──
  const quickM = text.match(/if heads,\s*this attack does\s*\d+\s*(?:damage\s*)?plus\s*(\d+)\s*more damage;\s*if tails,\s*this attack does\s*\d+\s*damage/i);
  if (quickM) {
    const bonus = parseInt(quickM[1]);
    const heads = flip();
    res.bonusDamage = heads ? bonus : 0;
    res.coinMsg = `(coin: ${heads ? `heads +${bonus}` : 'tails'})`;
    res.defenderStatus = null;
    return res;
  }

  // ── Leer — one coin; heads = defender can't attack next turn (early return) ─
  if (atk.name === 'Leer') {
    if (flip()) {
      res.cantAttackSelf = true;
      res.coinMsg = 'Heads! Defending Pokémon can\'t attack next turn!';
    } else {
      res.coinMsg = 'Tails! Leer has no effect.';
    }
    return res;
  }

  // ── Sand Attack — no coin now; defender must flip coin to attack next turn ─
  if (atk.name === 'Sand-attack' || atk.name === 'Sand Attack') {
    res.sandAttackSelf = true;
    // No coin flip on use — the coin flip happens when the defender tries to attack
    return res;
  }

  // ── Rampage (Tauros) — +10 per own damage counter; flip coin, tails = self Confused ─
  if (atk.name === 'Rampage') {
    const selfCounters = Math.floor(attackerPokemon.damageTaken / 10);
    res.bonusDamage += 10 * selfCounters;
    const heads = flip();
    if (!heads) res.selfStatus = 'Confused';
    res.coinMsg = heads
      ? `Heads! Rampage deals ${res.rawDamage + res.bonusDamage} damage.`
      : `Tails! Tauros is now Confused!`;
    res.defenderStatus = null;
    return res;
  }

  // ── Standard single-coin attacks ─────────────────────────────────────────
  const hasCoin = /flip a coin/i.test(text);

  if (hasCoin) {
    const heads = flip();

    // "If tails, [Name] does X damage to itself." — Raichu Thunder, Zapdos Thunder
    const tailsRecoilM = text.match(/if tails.*?does\s+(\d+)\s+damage to itself/i);
    if (tailsRecoilM) {
      if (!heads) res.recoil = parseInt(tailsRecoilM[1]);
      res.coinMsg = `(coin: ${heads ? 'heads' : `tails, ${tailsRecoilM[1]} recoil`})`;
    }

    // "If heads, X more damage." — generic bonus
    const headsMoreM = text.match(/if heads.*?(\d+)\s*more damage/i);
    if (headsMoreM && !tailsRecoilM) {
      if (heads) res.bonusDamage = parseInt(headsMoreM[1]);
      res.coinMsg = `(coin: ${heads ? `heads +${headsMoreM[1]}` : 'tails'})`;
    }

    // "If tails, this attack does nothing."
    if (!heads && /if tails.*(?:this attack does nothing|fails)/i.test(text)) {
      res.rawDamage = 0;
      res.coinMsg = '(coin: tails — no effect)';
    }

    // Status condition — only apply if heads (conditional) or always (unconditional)
    const condStatusM = text.match(/if heads.*?(?:defending pok[eé]mon is now|is now)\s+(asleep|confused|paralyzed|poisoned|burned)/i);
    if (condStatusM) {
      res.defenderStatus = heads ? capitalize(condStatusM[1]) as StatusCondition : null;
      if (!res.coinMsg) res.coinMsg = `(coin: ${heads ? 'heads' : 'tails'})`;
    }
  }

  // ── Always-recoil (no coin): "[Name] does X damage to itself." ─────────────
  if (!hasCoin) {
    const alwaysRecoilM = text.match(/\w+(?:\s+\w+)?\s+does\s+(\d+)\s+damage to itself/i);
    if (alwaysRecoilM) res.recoil = parseInt(alwaysRecoilM[1]);
  }

  // ── Discard all attacker energy ──────────────────────────────────────────
  if (/discard all energy cards attached to/i.test(text)) {
    res.discardAllAttackerEnergy = true;
  }

  // ── Discard N attacker energy ────────────────────────────────────────────
  if (!res.discardAllAttackerEnergy) {
    const discardM = text.match(/discard\s+(\d+)\s+(?:\w+\s+)?energy cards? attached to/i);
    if (discardM) res.discardAttackerEnergy = parseInt(discardM[1]);
  }

  // ── Bench damage — both sides ────────────────────────────────────────────
  const bothBenchM = text.match(/does\s+(\d+)\s+damage to each pok[eé]mon on each player's bench/i);
  if (bothBenchM) {
    res.opponentBenchDmg = parseInt(bothBenchM[1]);
    res.ownBenchDmg = parseInt(bothBenchM[1]);
  }

  // ── Bench damage — opponent bench only ──────────────────────────────────
  const oppBenchM = text.match(/does\s+(\d+)\s+damage to each of your opponent's benched/i);
  if (oppBenchM) res.opponentBenchDmg = parseInt(oppBenchM[1]);

  // ── Bench damage — own bench only ───────────────────────────────────────
  const ownBenchM = text.match(/does\s+(\d+)\s+damage to each of your(?!\s+opponent)\s+benched/i);
  if (ownBenchM) res.ownBenchDmg = parseInt(ownBenchM[1]);

  // ── Variable bonus from defender's energy (Mewtwo Psychic) ──────────────
  const defEnergyM = text.match(/(\d+)\s+more damage for each energy card attached to the defending/i);
  if (defEnergyM) {
    res.bonusDamage += parseInt(defEnergyM[1]) * defenderPokemon.attachedEnergy.length;
  }

  // ── Variable bonus from defender's damage counters (Mr. Mime Meditate) ──
  const defCounterM = text.match(/(\d+)\s+more damage for each damage counter on the defending/i);
  if (defCounterM) {
    const counters = Math.floor(defenderPokemon.damageTaken / 10);
    res.bonusDamage += parseInt(defCounterM[1]) * counters;
  }

  // ── Extra type energy bonus (Hydro Pump, Water Gun, Fire Blast) ──────────
  // "X more damage for each [Type] Energy attached to [Name] but not used..."
  const extraTypeM = text.match(
    /(\d+)\s+more damage for each\s+(\w+)\s+energy attached to\s+\S+\s+but not used.*?extra\s+\w+\s+energy after the\s+(\d+)/i,
  );
  if (extraTypeM) {
    const bonus = parseInt(extraTypeM[1]);
    const type = extraTypeM[2] as EnergyType;
    const maxExtra = parseInt(extraTypeM[3]);
    const costCount = atk.cost.filter(c => c === type).length;
    const attached = attackerPokemon.attachedEnergy.filter(e => e.type === type).length;
    const extra = Math.min(Math.max(0, attached - costCount), maxExtra);
    res.bonusDamage += bonus * extra;
  }

  // ── Bench count bonus (Wigglytuff Do the Wave, Nidoqueen Boyfriends) ─────
  const benchBonusM = text.match(/(\d+)\s+more damage for each of your (?:own\s+)?benched pok[eé]mon/i);
  if (benchBonusM) {
    res.bonusDamage += parseInt(benchBonusM[1]) * attackerBenchCount;
  }

  // ── Discard 1 energy from opponent's active (Whirlpool) ─────────────────
  if (/if the defending pok[eé]mon has any energy.*?choose 1.*?discard it/i.test(text)) {
    res.discardOpponentEnergy = 1;
  }

  // ── Status condition (always-apply, no coin) ─────────────────────────────
  if (res.defenderStatus === false && !hasCoin) {
    const unCondStatusM = text.match(/the defending pok[eé]mon is now\s+(asleep|confused|paralyzed|poisoned|burned)/i);
    res.defenderStatus = unCondStatusM ? capitalize(unCondStatusM[1]) as StatusCondition : null;
  }

  // ── Draw cards (Kangaskhan Fetch) ────────────────────────────────────────
  const drawM = text.match(/draw\s+(?:a\s+card|(\d+)\s+cards?)/i);
  if (drawM) res.drawCards = drawM[1] ? parseInt(drawM[1]) : 1;


  // ── Self-heal (Leech Seed, etc.) ─────────────────────────────────────────
  // "remove 1 damage counter from [attacker]" — not "from the Defending Pokémon"
  if (/remove\s+(?:1|a)\s+damage counter(?!\s+from (?:the\s+)?defending)/i.test(text)) {
    res.selfHeal = 10;
  }

  // ── Snivel (Cubone) ───────────────────────────────────────────────────────
  if (atk.name === 'Snivel') {
    res.applySnivel = true;
    res.defenderStatus = null;
  }

  return res;
}

// ─── Trainer Effects ─────────────────────────────────────────────────────────

function logMsg(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

export function handleTrainerEffect(
  state: GameState,
  after: GameState,
  playerId: 'player1' | 'player2',
  card: CardInstance,
  drawCard: (s: GameState, pid: 'player1' | 'player2') => GameState,
  makeInPlay: (card: CardData, turn: number) => InPlayPokemon,
): GameState {
  const oppId: 'player1' | 'player2' = playerId === 'player1' ? 'player2' : 'player1';
  const name = card.card.name.toLowerCase();
  const id = card.card.id;
  const playerName = state[playerId].name;
  const oppName = state[oppId].name;

  function player(): PlayerState { return after[playerId]; }
  function opp(): PlayerState { return after[oppId]; }

  // ── Professor Oak / Professor's Research ──────────────────────────────────
  if (name.includes('professor oak') || name.includes("professor's research")) {
    const p = player();
    after = { ...after, [playerId]: { ...p, discard: [...p.discard, ...p.hand], hand: [] } };
    for (let i = 0; i < 7; i++) after = drawCard(after, playerId);
    return logMsg(after, `${playerName} discards their hand and draws 7 cards.`);
  }

  // ── Bill / Pokédex HGSS-style draw-2 ─────────────────────────────────────
  if (name === 'bill') {
    after = drawCard(after, playerId);
    after = drawCard(after, playerId);
    return logMsg(after, `${playerName} draws 2 cards.`);
  }

  // Energy Removal / Gust of Wind / Pokédex are intercepted in playTrainer before reaching here

  // Super Energy Removal is now intercepted as a pendingTrainer in GameEngine.ts


  // ── Full Heal ─────────────────────────────────────────────────────────────
  if (name === 'full heal' || id === 'base1-82') {
    const p = player();
    if (p.active) {
      const healed = { ...p.active, statusConditions: [] };
      after = logMsg({ ...after, [playerId]: { ...p, active: healed } },
        `${playerName} clears ${p.active.card.name}'s status conditions.`);
    }
    return after;
  }

  // ── Potion ────────────────────────────────────────────────────────────────
  if (name === 'potion' || id === 'base1-94') {
    const p = player();
    if (p.active) {
      const healed = { ...p.active, damageTaken: Math.max(0, p.active.damageTaken - 20) };
      after = logMsg({ ...after, [playerId]: { ...p, active: healed } },
        `${playerName} heals 20 from ${p.active.card.name}.`);
    }
    return after;
  }

  // ── Super Potion ──────────────────────────────────────────────────────────
  if (name === 'super potion' || id === 'base1-90') {
    const p = player();
    if (p.active && p.active.attachedEnergy.length > 0) {
      const [discardedE, ...remaining] = p.active.attachedEnergy;
      const healed = { ...p.active, damageTaken: Math.max(0, p.active.damageTaken - 40), attachedEnergy: remaining };
      const eCard = fakeEnergyCard(discardedE.type, discardedE.cardId);
      after = logMsg({ ...after, [playerId]: { ...p, active: healed, discard: [...p.discard, eCard] } },
        `${playerName} heals 40 from ${p.active.card.name} (discards 1 energy).`);
    }
    return after;
  }

  // ── Pokémon Center ────────────────────────────────────────────────────────
  if (name === 'pokémon center' || id === 'base1-85') {
    const p = player();
    const healPoke = (poke: InPlayPokemon | null): InPlayPokemon | null => {
      if (!poke || poke.damageTaken === 0) return poke;
      const energyCards: CardInstance[] = poke.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId));
      // Mark energy for discard (handled below)
      return { ...poke, damageTaken: 0, attachedEnergy: [] };
    };
    const allPoke = [p.active, ...p.bench].filter(Boolean) as InPlayPokemon[];
    const allEnergy = allPoke.flatMap(pk => pk.attachedEnergy).map(e => fakeEnergyCard(e.type, e.cardId));
    after = logMsg({
      ...after, [playerId]: {
        ...p,
        active: p.active ? healPoke(p.active) : null,
        bench: p.bench.map(healPoke) as (InPlayPokemon | null)[],
        discard: [...p.discard, ...allEnergy],
      }
    }, `${playerName} plays Pokémon Center — all Pokémon healed, all energy discarded.`);
    return after;
  }

  // Switch is intercepted in playTrainer (GameEngine.ts) before reaching here
  // — it uses a pendingTrainer picker when multiple bench Pokémon are available.

  // ── Scoop Up ──────────────────────────────────────────────────────────────
  if (name === 'scoop up' || id === 'base1-78') {
    const p = player();
    if (p.active) {
      const returned = makeCardInstance(p.active.card);
      after = logMsg({ ...after, [playerId]: { ...p, active: null, hand: [...p.hand, returned] } },
        `${playerName} scoops up ${p.active.card.name} (all attached cards discarded).`);
    }
    return after;
  }

  // ── Revive ────────────────────────────────────────────────────────────────
  if (name === 'revive' || id === 'base1-89') {
    const p = player();
    const basics = p.discard.filter(c => isBasicPokemon(c.card) && (c.card.hp ?? 0) > 0);
    const slot = p.bench.findIndex(b => b === null);
    if (basics.length > 0 && slot >= 0) {
      const chosen = basics[0];
      const hp = chosen.card.hp!;
      const revived = makeInPlay(chosen.card, state.turn);
      const halfDmg = Math.floor(hp / 2 / 10) * 10;
      const revivedWithDmg = { ...revived, damageTaken: halfDmg };
      const newBench = [...p.bench];
      newBench[slot] = revivedWithDmg;
      const newDiscard = p.discard.filter(c => c.uid !== chosen.uid);
      after = logMsg({ ...after, [playerId]: { ...p, bench: newBench, discard: newDiscard } },
        `${playerName} revives ${chosen.card.name} at half HP!`);
    }
    return after;
  }

  // ── PlusPower ─────────────────────────────────────────────────────────────
  if (name === 'pluspower' || id === 'base1-84') {
    const p = player();
    after = logMsg({ ...after, [playerId]: { ...p, attackDamageBonus: p.attackDamageBonus + 10 } },
      `${playerName} plays PlusPower — next attack +10 damage.`);
    return after;
  }

  // Energy Retrieval — intercepted in playTrainer for player choice (discard 1, recover up to 2)

  // ── Super Energy Retrieval (Fossil set) ───────────────────────────────────
  if (name === 'super energy retrieval') {
    const p = player();
    if (p.hand.length < 2) return logMsg(after, `${playerName} can't use Super Energy Retrieval — need 2 cards to discard.`);
    const [d1, d2, ...restHand] = p.hand;
    const energies = p.discard.filter(c => c.card.supertype === 'Energy').slice(0, 4);
    if (energies.length === 0) return logMsg(after, `${playerName} plays Super Energy Retrieval but has no energy in discard.`);
    const newDiscard = p.discard.filter(c => !energies.find(e => e.uid === c.uid)).concat([d1, d2]);
    after = logMsg({ ...after, [playerId]: { ...p, hand: [...restHand, ...energies], discard: newDiscard } },
      `${playerName} retrieves ${energies.length} energy cards from discard.`);
    return after;
  }

  // Maintenance — intercepted in playTrainer for player choice

  // Computer Search — intercepted in playTrainer for player choice

  // Item Finder — intercepted in playTrainer for player choice

  // ── Lass ──────────────────────────────────────────────────────────────────
  if (name === 'lass' || id === 'base1-75') {
    const p = player();
    const o = opp();
    const pTrainers = p.hand.filter(c => c.card.supertype === 'Trainer');
    const oTrainers = o.hand.filter(c => c.card.supertype === 'Trainer');
    after = {
      ...after,
      [playerId]: { ...p, hand: p.hand.filter(c => c.card.supertype !== 'Trainer'), deck: shuffle([...p.deck, ...pTrainers]) },
      [oppId]: { ...o, hand: o.hand.filter(c => c.card.supertype !== 'Trainer'), deck: shuffle([...o.deck, ...oTrainers]) },
    };
    return logMsg(after, `${playerName} plays Lass! All trainers shuffled back into decks.`);
  }

  // ── Impostor Professor Oak ────────────────────────────────────────────────
  if (name === 'impostor professor oak' || id === 'base1-73') {
    const o = opp();
    const newDeck = shuffle([...o.deck, ...o.hand]);
    after = { ...after, [oppId]: { ...o, deck: newDeck, hand: [] } };
    for (let i = 0; i < 7; i++) after = drawCard(after, oppId);
    return logMsg(after, `${playerName} plays Impostor Professor Oak! ${oppName} shuffles hand and draws 7.`);
  }

  // ── Pokémon Flute ─────────────────────────────────────────────────────────
  if (name === 'pokémon flute' || name === 'pokemon flute' || id === 'base1-86') {
    const o = opp();
    const basics = o.discard.filter(c => isBasicPokemon(c.card));
    const slot = o.bench.findIndex(b => b === null);
    if (basics.length > 0 && slot >= 0) {
      const chosen = basics[0];
      const pokemon = makeInPlay(chosen.card, state.turn);
      const newBench = [...o.bench];
      newBench[slot] = pokemon;
      const newDiscard = o.discard.filter(c => c.uid !== chosen.uid);
      after = logMsg({ ...after, [oppId]: { ...o, bench: newBench, discard: newDiscard } },
        `${playerName} plays Pokémon Flute! ${chosen.card.name} joins ${oppName}'s bench.`);
    }
    return after;
  }

  // ── Devolution Spray ──────────────────────────────────────────────────────
  if (name === 'devolution spray' || id === 'base1-72') {
    const p = player();
    if (p.active && p.active.card.evolvesFrom) {
      const returned = makeCardInstance(p.active.card);
      // Active reverts to empty (we don't track what was under it)
      after = logMsg({ ...after, [playerId]: { ...p, active: null, hand: [...p.hand, returned] } },
        `${playerName} devolves ${p.active.card.name} — card returned to hand.`);
    }
    return after;
  }

  // Pokémon Breeder — intercepted in playTrainer for player choice

  // Pokémon Trader — intercepted in playTrainer for player choice


  // ── Mr. Fuji ──────────────────────────────────────────────────────────────
  if (name === 'mr. fuji' || id === 'base3-58') {
    const p = player();
    const benchIdx = p.bench.findIndex(b => b !== null);
    if (benchIdx >= 0) {
      const target = p.bench[benchIdx]!;
      const energyCards = target.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId));
      const pokemonCard = makeCardInstance(target.card);
      const newBench = [...p.bench];
      newBench[benchIdx] = null;
      const newDeck = shuffle([...p.deck, pokemonCard, ...energyCards]);
      after = logMsg({ ...after, [playerId]: { ...p, bench: newBench, deck: newDeck } },
        `${playerName} shuffles ${target.card.name} into deck with Mr. Fuji.`);
    }
    return after;
  }

  // Recycle — intercepted in playTrainer for coin flip + player choice

  // ── Sleep! (Team Rocket) — flip coin; heads = opponent active Asleep ────────
  if (name === 'sleep!' || id === 'base5-79') {
    const o = opp();
    const heads = flip();
    if (heads && o.active) {
      const scs = o.active.statusConditions.includes('Asleep')
        ? o.active.statusConditions
        : [...o.active.statusConditions, 'Asleep' as StatusCondition];
      const sleptActive = { ...o.active, statusConditions: scs };
      return logMsg({ ...after, [oppId]: { ...o, active: sleptActive } },
        `${playerName} plays Sleep! — Heads! ${o.active.card.name} is now Asleep!`);
    }
    return logMsg(after, `${playerName} plays Sleep! — Tails! No effect.`);
  }

  // ── Rocket's Sneak Attack ─────────────────────────────────────────────────
  if (name === "rocket's sneak attack" || id === 'base5-16') {
    const o = opp();
    const trainers = o.hand.filter(c => c.card.supertype === 'Trainer');
    if (trainers.length > 0) {
      const chosen = trainers[0];
      const newHand = o.hand.filter(c => c.uid !== chosen.uid);
      const newDeck = shuffle([...o.deck, chosen]);
      after = logMsg({ ...after, [oppId]: { ...o, hand: newHand, deck: newDeck } },
        `${playerName} plays Rocket's Sneak Attack! ${chosen.card.name} is shuffled from ${oppName}'s hand.`);
    } else {
      after = logMsg(after, `${playerName} plays Rocket's Sneak Attack — ${oppName} has no trainers.`);
    }
    return after;
  }

  // ── Here Comes Team Rocket! ───────────────────────────────────────────────
  if (name === "here comes team rocket!" || id === 'base5-15') {
    return logMsg(after, `${playerName} plays Here Comes Team Rocket! Prize cards are now face-up.`);
  }

  // ── Mysterious Fossil / Dome Fossil / Helix Fossil ────────────────────────
  if (name.includes('fossil') && card.card.supertype === 'Trainer') {
    const p = player();
    const slot = p.bench.findIndex(b => b === null);
    if (slot >= 0) {
      const fossilCard: CardData = {
        ...card.card,
        supertype: 'Pokémon',
        subtype: 'Basic',
        hp: 10,
        attacks: [],
        retreatCost: [],
      };
      const fossilPoke = makeInPlay(fossilCard, state.turn);
      const newBench = [...p.bench];
      newBench[slot] = fossilPoke;
      // Remove from discard (it was already put there by handleTrainer in GameEngine)
      const newDiscard = p.discard.filter(c => c.uid !== card.uid);
      after = logMsg({ ...after, [playerId]: { ...p, bench: newBench, discard: newDiscard } },
        `${playerName} plays ${card.card.name} onto the bench.`);
    }
    return after;
  }

  // ── Poké Ball ──────────────────────────────────────────────────────────────
  if (name === 'poké ball' || name === 'pokeball' || id === 'base2-64' || id === 'base4-121') {
    const p = player();
    const heads = flip();
    if (heads && p.deck.length > 0) {
      const pokemonInDeck = p.deck.filter(c => isPokemon(c.card));
      if (pokemonInDeck.length > 0) {
        const chosen = pokemonInDeck[Math.floor(Math.random() * pokemonInDeck.length)];
        const newDeck = shuffle(p.deck.filter(c => c.uid !== chosen.uid));
        after = logMsg({ ...after, [playerId]: { ...p, hand: [...p.hand, chosen], deck: newDeck } },
          `${playerName} uses Poké Ball (heads!) — found ${chosen.card.name}!`);
      } else {
        const newDeck = shuffle([...p.deck]);
        after = logMsg({ ...after, [playerId]: { ...p, deck: newDeck } },
          `${playerName} uses Poké Ball (heads!) but found no Pokémon in deck.`);
      }
    } else {
      after = logMsg(after, `${playerName} uses Poké Ball — tails! No effect.`);
    }
    return after;
  }

  // ── Bill's Teleporter (Neo Genesis) — flip coin; heads = draw 4 cards ──────
  if (name === "bill's teleporter" || id === 'neo1-91') {
    const heads = flip();
    if (heads) {
      for (let i = 0; i < 4; i++) after = drawCard(after, playerId);
      return logMsg(after, `${playerName} plays Bill's Teleporter — Heads! Draws 4 cards.`);
    }
    return logMsg(after, `${playerName} plays Bill's Teleporter — Tails! No effect.`);
  }

  // ── Defender ──────────────────────────────────────────────────────────────
  if (name === 'defender' || id === 'base1-80') {
    const p = player();
    if (p.active) {
      after = logMsg(
        { ...after, defenderShield: { protectedUid: p.active.uid, playedOnTurn: state.turn } },
        `${playerName} plays Defender! Damage to ${p.active.card.name} is reduced by 20 during the opponent's next turn.`,
      );
    }
    return after;
  }

  // ── Double Colorless Energy (shouldn't reach here — handled in attachEnergy) ──

  return after; // unimplemented trainers just get discarded with no effect
}
