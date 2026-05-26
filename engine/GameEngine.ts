import type {
  GameState, PlayerState, CardData, CardInstance, InPlayPokemon,
  EnergyInstance, EnergyType,
} from './GameState';
import { calculateDamage, applyPoisonDamage, applyBurnDamage, isKnockedOut } from './damage';
import { checkWinConditions, checkDeckOut } from './winConditions';
import { makeUID, makeCardInstance, canPayCost, isPokemon, isBasicPokemon, ALL_CARDS } from '@/lib/cardUtils';
import { computeAttackEffects, handleTrainerEffect, flip } from './cardEffects';

// ─── helpers ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function log(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

function makePlayer(id: 'player1' | 'player2', name: string, deckCards: CardData[]): PlayerState {
  const deck = shuffle(deckCards.map(makeCardInstance));
  return {
    id, name, deck,
    hand: [], active: null,
    bench: [null, null, null, null, null],
    discard: [], prizes: [],
    energyPlayedThisTurn: false,
    retreatedThisTurn: false,
    hasAttackedThisTurn: false,
    attackDamageBonus: 0,
  };
}

export function inPlayPokemon(card: CardData, turn: number): InPlayPokemon {
  return {
    uid: makeUID(),
    card,
    currentHP: card.hp ?? 10,
    damageTaken: 0,
    attachedEnergy: [],
    statusCondition: null,
    turnPlayed: turn,
    isFirstTurn: false,
    evolvedFrom: [],
    energyBurned: false,
    swordsDanceActive: false,
  };
}

function parseEnergyType(card: CardData): EnergyType {
  if (card.types.length > 0) return card.types[0] as EnergyType;
  const n = card.name.toLowerCase();
  if (n.includes('fire')) return 'Fire';
  if (n.includes('water')) return 'Water';
  if (n.includes('grass')) return 'Grass';
  if (n.includes('lightning')) return 'Lightning';
  if (n.includes('psychic')) return 'Psychic';
  if (n.includes('fighting')) return 'Fighting';
  if (n.includes('darkness') || n.includes('dark')) return 'Darkness';
  if (n.includes('metal') || n.includes('steel')) return 'Metal';
  if (n.includes('dragon')) return 'Dragon';
  if (n.includes('fairy')) return 'Fairy';
  return 'Colorless';
}

function fakeEnergyCard(type: EnergyType, cardId: string): CardInstance {
  return makeCardInstance({
    id: cardId, name: `${type} Energy`, set: 'Basic', setCode: 'basic',
    number: '0', rarity: '', supertype: 'Energy', subtype: 'Basic',
    evolvesFrom: null, hp: null, types: [type], attacks: [], abilities: [],
    weaknesses: [], resistances: [], retreatCost: [], rules: [],
    localImagePath: null, apiImageUrl: null,
  });
}

// ─── Pokémon Power helpers ───────────────────────────────────────────────────

function hasAbility(pokemon: InPlayPokemon, name: string): boolean {
  return pokemon.card.abilities.some(a => a.name === name);
}

function isMukSuppressing(state: GameState): boolean {
  const anyMuk = (p: typeof state.player1) =>
    (p.active !== null && hasAbility(p.active, 'Toxic Gas') && p.active.statusCondition === null) ||
    p.bench.some(b => b !== null && hasAbility(b, 'Toxic Gas') && b.statusCondition === null);
  return anyMuk(state.player1) || anyMuk(state.player2);
}

// Passive "whenever" power — not blocked by own status conditions
function isPassivePowerOn(pokemon: InPlayPokemon, name: string, state: GameState): boolean {
  if (!hasAbility(pokemon, name)) return false;
  if (name !== 'Toxic Gas' && isMukSuppressing(state)) return false;
  return true;
}

// Active "during your turn" power — blocked by Asleep/Confused/Paralyzed
export function isActivePowerOn(pokemon: InPlayPokemon, name: string, state: GameState): boolean {
  if (!isPassivePowerOn(pokemon, name, state)) return false;
  const sc = pokemon.statusCondition;
  return sc !== 'Asleep' && sc !== 'Confused' && sc !== 'Paralyzed';
}

function powerUsed(state: GameState, uid: string, name: string): boolean {
  return state.usedPowersThisTurn.includes(`${uid}:${name}`);
}

function markPowerUsed(state: GameState, uid: string, name: string): GameState {
  return { ...state, usedPowersThisTurn: [...state.usedPowersThisTurn, `${uid}:${name}`] };
}

function findInPlay(state: GameState, uid: string): { side: 'player1' | 'player2'; slot: 'active' | number } | null {
  for (const side of ['player1', 'player2'] as const) {
    const p = state[side];
    if (p.active?.uid === uid) return { side, slot: 'active' };
    for (let i = 0; i < 5; i++) if (p.bench[i]?.uid === uid) return { side, slot: i };
  }
  return null;
}

function setPokemonInPlay(state: GameState, uid: string, updated: InPlayPokemon): GameState {
  const loc = findInPlay(state, uid);
  if (!loc) return state;
  const p = state[loc.side];
  if (loc.slot === 'active') return { ...state, [loc.side]: { ...p, active: updated } };
  const nb = [...p.bench]; nb[loc.slot as number] = updated;
  return { ...state, [loc.side]: { ...p, bench: nb } };
}

// ─── init ────────────────────────────────────────────────────────────────────

function dealHand(player: PlayerState): PlayerState {
  return { ...player, hand: player.deck.slice(0, 7), deck: player.deck.slice(7) };
}

function shuffleHandBack(player: PlayerState): PlayerState {
  const newDeck = shuffle([...player.hand, ...player.deck]);
  return { ...player, hand: [], deck: newDeck };
}

function hasBasicInHand(player: PlayerState): boolean {
  return player.hand.some(c => isBasicPokemon(c.card));
}

function finishSetup(state: GameState): GameState {
  const p1 = { ...state.player1, prizes: state.player1.deck.slice(0, 6), deck: state.player1.deck.slice(6) };
  const p2 = { ...state.player2, prizes: state.player2.deck.slice(0, 6), deck: state.player2.deck.slice(6) };

  const p1First = Math.random() < 0.5;
  const firstPlayer: 'player1' | 'player2' = p1First ? 'player1' : 'player2';
  const firstName = p1First ? state.player1.name : state.player2.name;

  return log({
    ...state,
    player1: p1,
    player2: p2,
    setupStep: undefined,
    activePlayer: firstPlayer,
    phase: 'main',
    turn: 1,
  }, `🪙 Coin flip: ${firstName} goes first!`);
}

function aiAutoSetup(state: GameState): GameState {
  const p2 = state.player2;
  const basics = p2.hand.filter(c => isBasicPokemon(c.card));
  if (basics.length === 0) return state;

  const activeCard = basics[0];
  const active = inPlayPokemon(activeCard.card, 0);
  let newHand = p2.hand.filter(c => c.uid !== activeCard.uid);

  const newBench: (InPlayPokemon | null)[] = [null, null, null, null, null];
  const remainingBasics = newHand.filter(c => isBasicPokemon(c.card));
  for (let i = 0; i < Math.min(remainingBasics.length, 5); i++) {
    newBench[i] = inPlayPokemon(remainingBasics[i].card, 0);
    newHand = newHand.filter(c => c.uid !== remainingBasics[i].uid);
  }

  return { ...state, player2: { ...p2, active, bench: newBench, hand: newHand } };
}

export function initGame(
  p1Name: string, p1Deck: CardData[],
  p2Name: string, p2Deck: CardData[],
  mode: 'vs-ai' | 'local-2p',
): GameState {
  let p1 = makePlayer('player1', p1Name, p1Deck);
  let p2 = makePlayer('player2', p2Name, p2Deck);

  let p1Mulligans = 0;
  p1 = dealHand(p1);
  while (!hasBasicInHand(p1) && p1Mulligans < 20) {
    p1 = dealHand(shuffleHandBack(p1));
    p1Mulligans++;
  }

  let p2Mulligans = 0;
  p2 = dealHand(p2);
  while (!hasBasicInHand(p2) && p2Mulligans < 20) {
    p2 = dealHand(shuffleHandBack(p2));
    p2Mulligans++;
  }

  const logs: string[] = ['Both players draw their opening hands.'];
  if (p1Mulligans > 0) logs.push(`${p1Name} mulliganed ${p1Mulligans}×.`);
  if (p2Mulligans > 0) logs.push(`${p2Name} mulliganed ${p2Mulligans}×.`);
  logs.push(`${p1Name}: choose your Active Pokémon.`);

  return {
    phase: 'setup',
    setupStep: 'p1-setup',
    turn: 1,
    activePlayer: 'player1',
    player1: p1,
    player2: p2,
    winner: null,
    log: logs,
    pendingCoinFlip: false,
    mode,
    usedPowersThisTurn: [],
  };
}

// ─── setup confirmation ───────────────────────────────────────────────────────

export function confirmSetup(
  state: GameState,
  playerId: 'player1' | 'player2',
  activeHandUid: string,
  benchHandUids: string[],
): GameState {
  if (state.phase !== 'setup') return state;

  const player = state[playerId];
  const activeCard = player.hand.find(c => c.uid === activeHandUid);
  if (!activeCard || !isBasicPokemon(activeCard.card)) return state;

  const active = inPlayPokemon(activeCard.card, 0);
  let newHand = player.hand.filter(c => c.uid !== activeHandUid);

  const newBench: (InPlayPokemon | null)[] = [null, null, null, null, null];
  let slot = 0;
  for (const uid of benchHandUids) {
    if (slot >= 5) break;
    const card = newHand.find(c => c.uid === uid);
    if (card && isBasicPokemon(card.card)) {
      newBench[slot] = inPlayPokemon(card.card, 0);
      newHand = newHand.filter(c => c.uid !== uid);
      slot++;
    }
  }

  let next: GameState = log(
    { ...state, [playerId]: { ...player, active, bench: newBench, hand: newHand } },
    `${player.name} sends out ${active.card.name}!${slot > 0 ? ` (${slot} benched)` : ''}`,
  );

  if (playerId === 'player1') {
    if (state.mode === 'vs-ai') {
      next = aiAutoSetup(next);
      return finishSetup(next);
    }
    return { ...next, setupStep: 'p2-setup' };
  }

  return finishSetup(next);
}

// ─── draw ────────────────────────────────────────────────────────────────────

export function drawCard(state: GameState, playerId: 'player1' | 'player2'): GameState {
  const player = state[playerId];
  if (player.deck.length === 0) {
    return checkDeckOut({ ...state, activePlayer: playerId });
  }
  const [drawn, ...rest] = player.deck;
  const updated = { ...player, deck: rest, hand: [...player.hand, drawn] };
  return { ...state, [playerId]: updated };
}

export function doDrawPhase(state: GameState): GameState {
  const active = state.activePlayer;
  let next = drawCard(state, active);
  if (next.phase === 'gameover') return next;
  next = log(next, `${state[active].name} draws a card.`);
  return { ...next, phase: 'main' };
}

// ─── play pokemon ────────────────────────────────────────────────────────────

export function playBasicToBench(state: GameState, handUid: string, slot: number): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const card = player.hand.find(c => c.uid === handUid);

  if (!card || !isBasicPokemon(card.card)) return state;
  if (slot < 0 || slot > 4) return state;
  if (player.bench[slot] !== null) return state;

  const pokemon = inPlayPokemon(card.card, state.turn);
  const newHand = player.hand.filter(c => c.uid !== handUid);
  const newBench = [...player.bench];
  newBench[slot] = pokemon;

  const updated = { ...player, hand: newHand, bench: newBench };
  return log({ ...state, [active]: updated }, `${player.name} plays ${card.card.name} to the bench.`);
}

export function playActiveFromBench(state: GameState, benchSlot: number): GameState {
  const active = state.activePlayer;
  const player = state[active];
  if (player.active !== null) return state;
  const pokemon = player.bench[benchSlot];
  if (!pokemon) return state;

  const newBench = [...player.bench];
  newBench[benchSlot] = null;
  const updated = { ...player, active: pokemon, bench: newBench };
  return log({ ...state, [active]: updated }, `${player.name} sends ${pokemon.card.name} to the Active spot.`);
}

// ─── attach energy ───────────────────────────────────────────────────────────

export function attachEnergy(
  state: GameState,
  energyHandUid: string,
  targetUid: string,
): GameState {
  const active = state.activePlayer;
  const player = state[active];

  const energyCard = player.hand.find(c => c.uid === energyHandUid);
  if (!energyCard || energyCard.card.supertype !== 'Energy') return state;

  const energyType: EnergyType = parseEnergyType(energyCard.card);

  // Rain Dance: water energy attached to a water Pokémon bypasses the per-turn limit
  const isWaterEnergy = energyType === 'Water';
  const hasRainDance = isWaterEnergy && [player.active, ...player.bench].some(
    p => p !== null && isActivePowerOn(p, 'Rain Dance', state),
  );
  const allOwn = [player.active, ...player.bench].filter(Boolean) as InPlayPokemon[];
  const targetPoke = allOwn.find(p => p.uid === targetUid);
  const isRainDanceAttach = hasRainDance && (targetPoke?.card.types.includes('Water') ?? false);

  if (player.energyPlayedThisTurn && !isRainDanceAttach) return state;

  // Double Colorless Energy (base1-96) — ONE card that provides 2 Colorless.
  // Stored as a single EnergyInstance with provides:2 so Energy Removal treats it
  // as one card and retreat/cost checks count it as 2 energy symbols.
  const isDCE = energyCard.card.id === 'base1-96' ||
    energyCard.card.name.toLowerCase().includes('double colorless');
  const energyInstances: EnergyInstance[] = isDCE
    ? [{ uid: makeUID(), type: 'Colorless', cardId: energyCard.card.id, provides: 2 }]
    : [{ uid: makeUID(), type: energyType, cardId: energyCard.card.id }];

  const attachTo = (pokemon: InPlayPokemon | null): InPlayPokemon | null => {
    if (!pokemon || pokemon.uid !== targetUid) return pokemon;
    return { ...pokemon, attachedEnergy: [...pokemon.attachedEnergy, ...energyInstances] };
  };

  const newActive = attachTo(player.active);
  const newBench = player.bench.map(attachTo) as (InPlayPokemon | null)[];
  const targetName = (newActive?.uid === targetUid ? newActive?.card.name :
    newBench.find(b => b?.uid === targetUid)?.card.name) ?? 'Pokemon';

  if (newActive === player.active && newBench.every((b, i) => b === player.bench[i])) {
    return state;
  }

  const newHand = player.hand.filter(c => c.uid !== energyHandUid);
  const updated = {
    ...player,
    hand: newHand,
    active: newActive,
    bench: newBench,
    energyPlayedThisTurn: isRainDanceAttach ? player.energyPlayedThisTurn : true,
  };
  const energyLabel = isDCE ? 'Double Colorless Energy (2×Colorless)' : `${energyType} Energy`;
  const rainMsg = isRainDanceAttach ? ' 💧 (Rain Dance)' : '';
  return log({ ...state, [active]: updated }, `${player.name} attaches ${energyLabel}${rainMsg} to ${targetName}.`);
}

// ─── retreat ─────────────────────────────────────────────────────────────────

export function retreat(state: GameState, benchSlot: number): GameState {
  const active = state.activePlayer;
  const player = state[active];
  if (player.retreatedThisTurn) return state;
  if (player.hasAttackedThisTurn) return state;
  if (!player.active) return state;

  // ── Confusion check for retreat ─────────────────────────────────────────
  if (player.active.statusCondition === 'Confused') {
    const heads = flip();
    if (!heads) {
      return log(state, `😵 ${player.active.card.name} is Confused — coin flip tails! Can't retreat.`);
    }
    state = log(state, `😵 ${player.active.card.name} is Confused — coin flip heads! Retreat succeeds.`);
  }

  const dodrioReduction = player.bench.filter(b => b !== null && isActivePowerOn(b, 'Retreat Aid', state)).length;
  const cost = Math.max(0, player.active.card.retreatCost.length - dodrioReduction);
  // DCE counts as 2 energy symbols — sum 'provides' values (default 1 per card)
  const totalEnergyValue = player.active.attachedEnergy.reduce((s, e) => s + (e.provides ?? 1), 0);
  if (totalEnergyValue < cost) return state;

  const swapTo = player.bench[benchSlot];
  if (!swapTo) return state;

  // If cost is 0, execute immediately; otherwise wait for player to choose energy
  if (cost === 0) {
    return applyRetreat(state, benchSlot, []);
  }
  return { ...state, pendingRetreat: { benchSlot, cost } };
}

export function confirmRetreat(state: GameState, energyUids: string[]): GameState {
  if (!state.pendingRetreat) return state;
  const { benchSlot, cost } = state.pendingRetreat;
  const player = state[state.activePlayer];
  if (!player.active) return state;
  const selected = player.active.attachedEnergy.filter(e => energyUids.includes(e.uid));
  // DCE provides 2 — compare sum of provides values, not instance count
  const selectedValue = selected.reduce((s, e) => s + (e.provides ?? 1), 0);
  if (selectedValue < cost) return state;
  return applyRetreat({ ...state, pendingRetreat: undefined }, benchSlot, energyUids);
}

function applyRetreat(state: GameState, benchSlot: number, energyUids: string[]): GameState {
  const active = state.activePlayer;
  const player = state[active];
  if (!player.active) return state;

  const swapTo = player.bench[benchSlot];
  if (!swapTo) return state;

  const energyToDiscard = energyUids.length > 0
    ? player.active.attachedEnergy.filter(e => energyUids.includes(e.uid))
    : [];
  const remainingEnergy = player.active.attachedEnergy.filter(e => !energyUids.includes(e.uid));
  // Status conditions are cured when a Pokémon retreats to the bench
  const retreatedPokemon = { ...player.active, attachedEnergy: remainingEnergy, statusCondition: null };

  const newBench = [...player.bench];
  newBench[benchSlot] = retreatedPokemon;

  const discardedCards: CardInstance[] = energyToDiscard.map(e => fakeEnergyCard(e.type, e.cardId));

  const updated = {
    ...player,
    active: swapTo,
    bench: newBench,
    discard: [...player.discard, ...discardedCards],
    retreatedThisTurn: true,
  };
  return log({ ...state, [active]: updated },
    `${player.name} retreats ${retreatedPokemon.card.name}, sends out ${swapTo.card.name}.`);
}

// ─── KO resolution ───────────────────────────────────────────────────────────

function resolveKO(
  state: GameState,
  knockedSide: 'player1' | 'player2',
  prizeTaker: 'player1' | 'player2' | null,
): GameState {
  const player = state[knockedSide];
  if (!player.active) return state;

  const hp = player.active.card.hp ?? 0;
  if (player.active.damageTaken < hp) return state;

  const discarded: CardInstance[] = [
    makeCardInstance(player.active.card),
    ...player.active.evolvedFrom.map(c => makeCardInstance(c)),
    ...player.active.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId)),
  ];

  let newPlayer = { ...player, active: null, discard: [...player.discard, ...discarded] };
  let next = log({ ...state, [knockedSide]: newPlayer }, `${player.active.card.name} is knocked out!`);

  if (prizeTaker && state[prizeTaker].prizes.length > 0) {
    const taker = next[prizeTaker];
    const [prize, ...remainingPrizes] = taker.prizes;
    next = log(
      { ...next, [prizeTaker]: { ...taker, prizes: remainingPrizes, hand: [...taker.hand, prize] } },
      `${taker.name} takes a prize card! (${remainingPrizes.length} left)`,
    );
  }

  // Send out a replacement active
  const updatedKnocked = next[knockedSide];
  const benchAvailable = updatedKnocked.bench.filter(b => b !== null);

  if (benchAvailable.length === 1) {
    // Only one choice — auto-promote immediately
    const firstBench = updatedKnocked.bench.findIndex(b => b !== null);
    const promoted = updatedKnocked.bench[firstBench]!;
    const newBench = [...updatedKnocked.bench];
    newBench[firstBench] = null;
    next = log(
      { ...next, [knockedSide]: { ...updatedKnocked, active: promoted, bench: newBench } },
      `${promoted.card.name} is promoted to Active!`,
    );
  } else if (benchAvailable.length > 1) {
    // Multiple choices — player must pick before anything else happens
    next = log({ ...next, pendingSendOut: { side: knockedSide } },
      `${updatedKnocked.name} must send out a new Active Pokémon!`);
  }
  // length === 0: no bench left — win condition handled by checkWinConditions

  return next;
}

// ─── Send-out resolution (after KO with multiple bench options) ───────────────

export function resolveSendOut(state: GameState, benchSlot: number): GameState {
  const pending = state.pendingSendOut;
  if (!pending) return state;
  const p = state[pending.side];
  const pokemon = p.bench[benchSlot];
  if (!pokemon) return state;
  const newBench = [...p.bench];
  newBench[benchSlot] = null;
  return log(
    { ...state, pendingSendOut: undefined, [pending.side]: { ...p, active: pokemon, bench: newBench } },
    `${pokemon.card.name} is sent out!`,
  );
}

// ─── attack ──────────────────────────────────────────────────────────────────

export function flipCoin(): boolean { return flip(); }

// Detects "Discard N [Type] Energy" in attack text — returns type+count or null.
// Used to intercept and show a picker before the attack resolves.
function getTypedDiscardRequirement(atk: CardAttack): { type: EnergyType; count: number } | null {
  const m = atk.text?.match(
    /discard\s+(\d+)\s+(fire|water|grass|lightning|psychic|fighting|darkness|metal|dragon|fairy)\s+energy/i,
  );
  if (!m) return null;
  const type = (m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()) as EnergyType;
  return { count: parseInt(m[1]), type };
}

// skipTypedDiscard=true: energy discard was already paid by resolveAttackDiscard
// skipCostCheck=true:    cost was already validated before the discard; don't re-check
//   (needed because resolveAttackDiscard removes the typed energy BEFORE calling attack,
//    which would otherwise make canPayCost fail even though cost was legitimately paid)
export function attack(state: GameState, attackIndex: number, skipTypedDiscard = false, skipCostCheck = false): GameState {
  const active = state.activePlayer;
  const opponent = active === 'player1' ? 'player2' : 'player1';
  const attacker = state[active];
  const defender = state[opponent];

  if (!attacker.active || !defender.active) return state;
  if (attacker.hasAttackedThisTurn) return state;

  const atk = attacker.active.card.attacks[attackIndex];
  if (!atk) return state;
  // Energy Burn: all attached energy counts as Fire for cost-checking purposes
  const effectiveEnergy = attacker.active.energyBurned
    ? attacker.active.attachedEnergy.map(e => ({ ...e, type: 'Fire' as EnergyType }))
    : attacker.active.attachedEnergy;
  if (!skipCostCheck && !canPayCost(atk.cost, effectiveEnergy)) return state;

  // ── Asleep check ─────────────────────────────────────────────────────────
  if (attacker.active.statusCondition === 'Asleep') {
    return log(state, `${attacker.active.card.name} is Asleep and can't attack!`);
  }

  // ── Paralysis check ──────────────────────────────────────────────────────
  if (attacker.active.statusCondition === 'Paralyzed') {
    const cleared = { ...attacker.active, statusCondition: null };
    return log(
      { ...state, [active]: { ...attacker, active: cleared, hasAttackedThisTurn: true } },
      `${attacker.active.card.name} is Paralyzed and can't attack! The Paralysis fades.`,
    );
  }

  // ── Confusion check ──────────────────────────────────────────────────────
  if (attacker.active.statusCondition === 'Confused') {
    const heads = flip();
    if (!heads) {
      const selfDamaged = { ...attacker.active, damageTaken: attacker.active.damageTaken + 30 };
      let next = log(
        { ...state, [active]: { ...attacker, active: selfDamaged, hasAttackedThisTurn: true } },
        `😵 ${attacker.active.card.name} is Confused! Coin flip tails — hits itself for 30 damage!`,
      );
      next = resolveKO(next, active, null);
      return checkWinConditions(next);
    }
    // Heads: attack proceeds normally — log it then fall through
    state = log(state, `😵 ${attacker.active.card.name} is Confused — coin flip heads! Attack proceeds.`);
  }

  // ── Leer / "can't attack" check ─────────────────────────────────────────
  if (state.cantAttackTarget) {
    const { attackerUid, targetUid } = state.cantAttackTarget;
    // Effect still applies only if same Pokémon are still active on both sides
    if (attacker.active.uid === attackerUid && defender.active.uid === targetUid) {
      return log(
        { ...state, cantAttackTarget: undefined, [active]: { ...attacker, hasAttackedThisTurn: true } },
        `${attacker.active.card.name} can't attack ${defender.active.card.name} this turn! (Leer)`,
      );
    }
    // One of them was swapped out — clear the restriction silently
    state = { ...state, cantAttackTarget: undefined };
  }

  // ── Sand Attack — coin flip check ────────────────────────────────────────
  if (state.sandAttackTarget) {
    if (attacker.active.uid === state.sandAttackTarget) {
      // Same Pokémon is still active — must flip a coin
      const heads = flip();
      state = { ...state, sandAttackTarget: undefined };
      if (!heads) {
        return log(
          { ...state, [active]: { ...attacker, hasAttackedThisTurn: true } },
          `😵 ${attacker.active.card.name} has sand in its eyes! Coin flip tails — attack fails!`,
        );
      }
      // Heads — attack proceeds
      state = log(state, `😵 ${attacker.active.card.name} has sand in its eyes! Coin flip heads — attack proceeds!`);
    } else {
      // Pokémon swapped out — clear the effect
      state = { ...state, sandAttackTarget: undefined };
    }
  }

  // ── Typed energy discard check (Ember, Flamethrower, Fire Spin…) ────────
  // Intercept before computing effects — show player a picker to confirm which
  // specific Fire (or other typed) energy to discard for the attack.
  if (!skipTypedDiscard) {
    const typedDiscard = getTypedDiscardRequirement(atk);
    if (typedDiscard) {
      const matching = attacker.active.attachedEnergy.filter(e => e.type === typedDiscard.type);
      if (matching.length < typedDiscard.count) return state; // not enough (shouldn't reach here)
      return { ...state, pendingAttackDiscard: { attackIndex, requiredType: typedDiscard.type, count: typedDiscard.count } };
    }
  }

  // ── Compute all attack effects ───────────────────────────────────────────
  const attackerBenchCount = attacker.bench.filter(b => b !== null).length;
  const fx = computeAttackEffects(atk, attacker.active, defender.active, attackerBenchCount);

  // ── Calculate damage ─────────────────────────────────────────────────────
  // Swords Dance boost: Slash does 60 instead of 30 the turn after Swords Dance
  const swordsDanceBoosted = atk.name === 'Slash' && attacker.active.swordsDanceActive;
  const rawDamage = swordsDanceBoosted ? 60 : fx.rawDamage;
  let damage = calculateDamage(attacker.active.card.types, atk, defender.active, rawDamage);
  // PlusPower bonus (added after W/R)
  damage += attacker.attackDamageBonus;
  // Flat bonus from card effects (also after W/R conceptually — bench count, energy count)
  damage += fx.bonusDamage;
  damage = Math.max(0, damage);

  // ── Passive damage-prevention Pokémon Powers ─────────────────────────────
  const preventionMsgs: string[] = [];

  // Mr. Mime Invisible Wall: prevent all damage if ≥ 30 (after W/R)
  if (damage >= 30 && isPassivePowerOn(defender.active, 'Invisible Wall', state)) {
    preventionMsgs.push(`🛡 ${defender.active.card.name}'s Invisible Wall prevents all damage!`);
    damage = 0;
  }
  // Haunter Transparency: flip coin — heads = no damage
  if (damage > 0 && isPassivePowerOn(defender.active, 'Transparency', state)) {
    if (flip()) {
      preventionMsgs.push(`👻 ${defender.active.card.name}'s Transparency! (heads — damage prevented)`);
      damage = 0;
    }
  }
  // Snorlax Thick Skinned / Venomoth Shield Dust: block status + other effects on defender
  const blockDefStatus = isPassivePowerOn(defender.active, 'Thick Skinned', state)
    || isPassivePowerOn(defender.active, 'Shield Dust', state);
  const blockDefEffects = isPassivePowerOn(defender.active, 'Shield Dust', state);

  // ── Snivel damage reduction ──────────────────────────────────────────────
  // Applied AFTER W/R. Clears after one attack (or if either Pokémon was benched).
  let snivel = state.snivel;
  if (snivel && snivel.protectedUid === defender.active.uid && snivel.attackerUid === attacker.active.uid) {
    const reduced = Math.max(0, damage - 20);
    if (damage > 0) {
      preventionMsgs.push(`🛡 Snivel reduces damage by ${damage - reduced}!`);
      damage = reduced;
    }
    snivel = undefined; // consumed
  } else if (snivel) {
    // Either Pokémon switched out — clear it
    const allUids = [
      state[active].active?.uid, ...state[active].bench.map(b => b?.uid),
      state[opponent].active?.uid, ...state[opponent].bench.map(b => b?.uid),
    ];
    if (!allUids.includes(snivel.protectedUid) || !allUids.includes(snivel.attackerUid)) {
      snivel = undefined;
    }
  }

  // ── Build log message ────────────────────────────────────────────────────
  let msg = `${attacker.active.card.name} uses ${atk.name}`;
  if (damage > 0) msg += ` for ${damage} damage`;
  if (fx.coinMsg) msg += ` ${fx.coinMsg}`;
  msg += '!';

  // ── Apply damage to defender ─────────────────────────────────────────────
  let newDefenderActive = { ...defender.active, damageTaken: defender.active.damageTaken + damage };

  // ── Status condition on defender ─────────────────────────────────────────
  if (!blockDefStatus) {
    if (fx.defenderStatus !== false) {
      if (fx.defenderStatus !== null) {
        newDefenderActive = { ...newDefenderActive, statusCondition: fx.defenderStatus };
      }
    } else {
      const text = atk.text?.toLowerCase() ?? '';
      if (!text.includes('flip a coin')) {
        if (text.includes('asleep')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Asleep' };
        else if (text.includes('paralyz')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Paralyzed' };
        else if (text.includes('poison')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Poisoned' };
        else if (text.includes('confus') && !text.includes(attacker.active.card.name.toLowerCase())) {
          newDefenderActive = { ...newDefenderActive, statusCondition: 'Confused' };
        } else if (text.includes('burn')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Burned' };
      }
    }
  }

  // Swords Dance: set flag for next turn; all other attacks clear it
  const isSwordsDance = atk.name === 'Swords Dance';
  const updatedAttackerActive = attacker.active
    ? { ...attacker.active, swordsDanceActive: isSwordsDance }
    : attacker.active;

  let next: GameState = {
    ...state,
    [active]: { ...attacker, active: updatedAttackerActive, hasAttackedThisTurn: true, attackDamageBonus: 0 },
    [opponent]: { ...defender, active: newDefenderActive },
    log: [...state.log, msg, ...preventionMsgs],
  };

  if (isSwordsDance) {
    next = log(next, `${attacker.active.card.name}'s next Slash will deal 60 damage!`);
  }
  if (swordsDanceBoosted) {
    next = log(next, `⚔️ Swords Dance boost! Slash deals 60 damage!`);
  }

  // ── Self-confusion (Vileplume Petal Dance) ───────────────────────────────
  if (fx.selfStatus) {
    const p = next[active];
    if (p.active) {
      next = log({ ...next, [active]: { ...p, active: { ...p.active, statusCondition: fx.selfStatus } } },
        `${p.active.card.name} is now ${fx.selfStatus}!`);
    }
  }

  // ── Recoil damage ────────────────────────────────────────────────────────
  if (fx.recoil > 0) {
    const p = next[active];
    if (p.active) {
      next = log({ ...next, [active]: { ...p, active: { ...p.active, damageTaken: p.active.damageTaken + fx.recoil } } },
        `${p.active.card.name} takes ${fx.recoil} recoil damage!`);
    }
  }

  // ── Self-heal (Leech Seed) ───────────────────────────────────────────────
  // Only heals if damage was actually dealt (not fully prevented)
  if (fx.selfHeal > 0 && damage > 0) {
    const p = next[active];
    if (p.active && p.active.damageTaken > 0) {
      const healed = Math.min(p.active.damageTaken, fx.selfHeal);
      next = log(
        { ...next, [active]: { ...p, active: { ...p.active, damageTaken: p.active.damageTaken - healed } } },
        `🌿 ${p.active.card.name} removes 1 damage counter! (Leech Seed)`,
      );
    }
  }

  // ── Self-KO (Selfdestruct, Explosion) ───────────────────────────────────
  if (fx.selfKO) {
    const p = next[active];
    if (p.active) {
      const hp = p.active.card.hp ?? 1;
      next = { ...next, [active]: { ...p, active: { ...p.active, damageTaken: hp } } };
    }
  }

  // ── Opponent bench damage ────────────────────────────────────────────────
  if (fx.opponentBenchDmg > 0) {
    const o = next[opponent];
    const newBench = o.bench.map(b =>
      b ? { ...b, damageTaken: b.damageTaken + fx.opponentBenchDmg } : null,
    ) as (InPlayPokemon | null)[];
    next = log({ ...next, [opponent]: { ...o, bench: newBench } },
      `${fx.opponentBenchDmg} damage dealt to each of ${o.name}'s bench!`);
  }

  // ── Own bench damage ─────────────────────────────────────────────────────
  if (fx.ownBenchDmg > 0) {
    const p = next[active];
    const newBench = p.bench.map(b =>
      b ? { ...b, damageTaken: b.damageTaken + fx.ownBenchDmg } : null,
    ) as (InPlayPokemon | null)[];
    next = log({ ...next, [active]: { ...p, bench: newBench } },
      `${fx.ownBenchDmg} damage dealt to each of ${p.name}'s bench!`);
  }

  // ── Discard attacker's energy ────────────────────────────────────────────
  // When skipTypedDiscard=true, the typed energy was already removed by resolveAttackDiscard —
  // skip the generic discard (fx.discardAttackerEnergy) to avoid double-discarding.
  const effectiveDiscardCount = skipTypedDiscard ? 0 : fx.discardAttackerEnergy;
  if (fx.discardAllAttackerEnergy || effectiveDiscardCount > 0) {
    const p = next[active];
    if (p.active) {
      const count = fx.discardAllAttackerEnergy
        ? p.active.attachedEnergy.length
        : Math.min(effectiveDiscardCount, p.active.attachedEnergy.length);
      const discarded = p.active.attachedEnergy.slice(-count);
      const remaining = p.active.attachedEnergy.slice(0, p.active.attachedEnergy.length - count);
      const discardCards = discarded.map(e => fakeEnergyCard(e.type, e.cardId));
      next = log({
        ...next,
        [active]: {
          ...p,
          active: { ...p.active, attachedEnergy: remaining },
          discard: [...p.discard, ...discardCards],
        },
      }, `${count} energy discarded from ${p.active.card.name}.`);
    }
  }

  // ── Discard opponent's energy (Whirlpool) ────────────────────────────────
  if (fx.discardOpponentEnergy > 0 && !blockDefEffects) {
    const o = next[opponent];
    if (o.active && o.active.attachedEnergy.length > 0) {
      const [removed, ...rest] = o.active.attachedEnergy;
      next = log({
        ...next,
        [opponent]: { ...o, active: { ...o.active, attachedEnergy: rest } },
      }, `${removed.type} Energy discarded from ${o.active.card.name}!`);
    }
  }

  // ── Force opponent switch (Ninetales Lure, Victreebel Lure) ─────────────
  if (fx.forceOpponentSwitch && !blockDefEffects) {
    const o = next[opponent];
    const benchIdx = o.bench.findIndex(b => b !== null);
    if (o.active && benchIdx >= 0) {
      const swapIn = o.bench[benchIdx]!;
      const newBench = [...o.bench];
      newBench[benchIdx] = o.active;
      next = log({ ...next, [opponent]: { ...o, active: swapIn, bench: newBench } },
        `${o.active.card.name} is switched out for ${swapIn.card.name}!`);
    }
  }

  // ── Return defender to hand (Pidgeot Hurricane) ──────────────────────────
  if (fx.returnDefender && !blockDefEffects) {
    const o = next[opponent];
    if (o.active && o.active.damageTaken < (o.active.card.hp ?? 999)) {
      const returned = makeCardInstance(o.active.card);
      next = log({ ...next, [opponent]: { ...o, active: null, hand: [...o.hand, returned] } },
        `${o.active.card.name} and all attached cards return to ${o.name}'s hand!`);
    }
  }

  // ── Machamp Strikes Back ──────────────────────────────────────────────────
  if (damage > 0 && isPassivePowerOn(newDefenderActive, 'Strikes Back', state)) {
    if (flip()) {
      const p = next[active];
      if (p.active) {
        next = log(
          { ...next, [active]: { ...p, active: { ...p.active, damageTaken: p.active.damageTaken + 10 } } },
          `⚡ ${newDefenderActive.card.name}'s Strikes Back deals 10 damage to ${p.active.card.name}! (heads)`,
        );
      }
    } else {
      next = log(next, `${newDefenderActive.card.name}'s Strikes Back — tails, no counter-damage.`);
    }
  }

  // ── Ninetales Flash Fire ──────────────────────────────────────────────────
  if (isPassivePowerOn(newDefenderActive, 'Flash Fire', state)) {
    const o = next[opponent];
    const fireEnergy = o.discard.find(c =>
      c.card.supertype === 'Energy' &&
      (c.card.types.includes('Fire') || c.card.name.toLowerCase().includes('fire')));
    if (fireEnergy && o.active) {
      const attached: EnergyInstance = { uid: makeUID(), type: 'Fire', cardId: fireEnergy.card.id };
      const newDiscard = o.discard.filter(c => c.uid !== fireEnergy.uid);
      next = log({
        ...next,
        [opponent]: { ...o, active: { ...o.active, attachedEnergy: [...o.active.attachedEnergy, attached] }, discard: newDiscard },
      }, `🔥 ${o.active.card.name}'s Flash Fire! Retrieved Fire Energy from discard.`);
    }
  }

  // ── Draw cards (Kangaskhan Fetch) ────────────────────────────────────────
  if (fx.drawCards > 0) {
    for (let i = 0; i < fx.drawCards; i++) next = drawCard(next, active);
    next = log(next, `${attacker.name} draws ${fx.drawCards} card(s).`);
  }

  // ── Leer — set cantAttackTarget on game state ────────────────────────────
  if (fx.cantAttackSelf && attacker.active && defender.active) {
    next = { ...next, cantAttackTarget: { attackerUid: defender.active.uid, targetUid: attacker.active.uid } };
  }

  // ── Sand Attack — mark defender as having sand in its eyes ───────────────
  if (fx.sandAttackSelf && defender.active) {
    next = log({ ...next, sandAttackTarget: defender.active.uid },
      `💨 Sand Attack! ${defender.active.card.name} has sand in its eyes — must flip a coin to attack next turn!`);
  }

  // ── Snivel — set protection on game state (defender's next attack deals -20) ─
  if (fx.applySnivel && attacker.active && defender.active) {
    next = log(
      { ...next, snivel: { protectedUid: attacker.active.uid, attackerUid: defender.active.uid } },
      `🛡 ${attacker.active.card.name} uses Snivel! ${defender.active.card.name}'s next attack deals 20 less damage!`,
    );
  } else {
    // Propagate any cleared snivel state
    next = { ...next, snivel };
  }

  // ── Resolve KOs ──────────────────────────────────────────────────────────
  // Check opponent active KO
  next = resolveKO(next, opponent, active);
  // Check self-KO (recoil, Selfdestruct)
  if (fx.recoil > 0 || fx.selfKO) next = resolveKO(next, active, null);
  // Check bench KOs
  if (fx.opponentBenchDmg > 0) {
    const o = next[opponent];
    o.bench.forEach((b, i) => {
      if (b && isKnockedOut(b)) {
        const newBench = [...next[opponent].bench];
        const discardCards = [makeCardInstance(b.card), ...b.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId))];
        newBench[i] = null;
        next = log({ ...next, [opponent]: { ...next[opponent], bench: newBench, discard: [...next[opponent].discard, ...discardCards] } },
          `${b.card.name} on the bench is knocked out!`);
      }
    });
  }
  if (fx.ownBenchDmg > 0) {
    const p = next[active];
    p.bench.forEach((b, i) => {
      if (b && isKnockedOut(b)) {
        const newBench = [...next[active].bench];
        const discardCards = [makeCardInstance(b.card), ...b.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId))];
        newBench[i] = null;
        next = log({ ...next, [active]: { ...next[active], bench: newBench, discard: [...next[active].discard, ...discardCards] } },
          `${b.card.name} on your bench is knocked out!`);
      }
    });
  }

  return checkWinConditions(next);
}

// ─── end of turn ─────────────────────────────────────────────────────────────

export function endTurn(state: GameState): GameState {
  const active = state.activePlayer;
  const opponent = active === 'player1' ? 'player2' : 'player1';
  const player = state[active];

  let updatedActive = player.active ? applyPoisonDamage(player.active) : null;
  updatedActive = updatedActive ? applyBurnDamage(updatedActive) : null;

  if (updatedActive?.statusCondition === 'Asleep') {
    if (flip()) updatedActive = { ...updatedActive, statusCondition: null };
  }
  // Reset Energy Burn on active pokemon
  if (updatedActive?.energyBurned) updatedActive = { ...updatedActive, energyBurned: false };
  // Swords Dance flag persists to next player turn (cleared by attacking, not by end-of-turn)

  let next: GameState = {
    ...state,
    [active]: {
      ...player,
      active: updatedActive,
      energyPlayedThisTurn: false,
      retreatedThisTurn: false,
      hasAttackedThisTurn: false,
      attackDamageBonus: 0,
    },
    activePlayer: opponent,
    turn: state.turn + 1,
    phase: 'draw',
    log: [...state.log, `--- ${state[opponent].name}'s turn ---`],
    usedPowersThisTurn: [],
    // Note: cantAttackTarget intentionally NOT cleared here — it must survive into
    // the opponent's turn so the "can't attack" block can fire. It clears itself
    // when it triggers, or when either Pokémon swaps out.
  };

  if (updatedActive && isKnockedOut(updatedActive)) {
    next = resolveKO(next, active, opponent);
  }

  return checkWinConditions(next);
}

// ─── Attack energy discard resolution ────────────────────────────────────────
// Called after the player picks which typed energy to discard for Ember etc.
// Removes those energies, then executes the attack (with skipTypedDiscard=true).

export function resolveAttackDiscard(state: GameState, energyUids: string[]): GameState {
  const pending = state.pendingAttackDiscard;
  if (!pending) return state;
  const active = state.activePlayer;
  const player = state[active];
  if (!player.active) return { ...state, pendingAttackDiscard: undefined };

  const selected = player.active.attachedEnergy.filter(e => energyUids.includes(e.uid));
  if (selected.length !== pending.count) return state;
  if (!selected.every(e => e.type === pending.requiredType)) return state;

  const remaining = player.active.attachedEnergy.filter(e => !energyUids.includes(e.uid));
  const discardCards = selected.map(e => fakeEnergyCard(e.type, e.cardId));
  const atkName = player.active.card.attacks[pending.attackIndex]?.name ?? 'attack';

  let next: GameState = log({
    ...state,
    pendingAttackDiscard: undefined,
    [active]: {
      ...player,
      active: { ...player.active, attachedEnergy: remaining },
      discard: [...player.discard, ...discardCards],
    },
  }, `${player.name} discards ${pending.count} ${pending.requiredType} Energy for ${atkName}.`);

  // Run the attack — skip typed-discard intercept AND cost check (energy was just removed,
  // but cost was already validated before the discard was requested)
  return attack(next, pending.attackIndex, true, true);
}

export function cancelAttackDiscard(state: GameState): GameState {
  return { ...state, pendingAttackDiscard: undefined };
}

// ─── trainer card ─────────────────────────────────────────────────────────────

export function playTrainer(state: GameState, handUid: string): GameState {
  const active = state.activePlayer;
  const opp = active === 'player1' ? 'player2' : 'player1';
  const player = state[active];
  const card = player.hand.find(c => c.uid === handUid);
  if (!card || card.card.supertype !== 'Trainer') return state;

  const name = card.card.name.toLowerCase();
  const id = card.card.id;

  // Dark Vileplume Hay Fever: block trainer cards while in play (either side)
  const hayFeverActive = (side: 'player1' | 'player2') => {
    const p = state[side];
    return p.active !== null && isPassivePowerOn(p.active, 'Hay Fever', state);
  };
  if (hayFeverActive('player1') || hayFeverActive('player2')) {
    return log(state, `${player.name} can't play Trainers — Dark Vileplume's Hay Fever is in effect!`);
  }

  // Remove card from hand and put in discard
  let next: GameState = {
    ...state,
    [active]: {
      ...player,
      hand: player.hand.filter(c => c.uid !== handUid),
      discard: [...player.discard, card],
    },
  };
  next = log(next, `${player.name} plays ${card.card.name}.`);

  // Selection trainers — UI must resolve via resolvePendingTrainer
  if (name === 'energy removal' || id === 'base1-92') {
    const o = next[opp];
    const hasAnyEnergy = (o.active?.attachedEnergy.length ?? 0) > 0
      || o.bench.some(b => b !== null && b.attachedEnergy.length > 0);
    if (!hasAnyEnergy) {
      return log(next, `${o.name} has no Energy attached — can't use Energy Removal!`);
    }
    return { ...next, pendingTrainer: { type: 'energy-removal' } };
  }
  if (name === 'super energy removal' || id === 'base1-79') {
    const p = next[active];
    const o = next[opp];
    if ((p.active?.attachedEnergy.length ?? 0) === 0) {
      return log(next, `${p.name} has no Energy to discard — can't use Super Energy Removal!`);
    }
    const hasAnyEnergy = (o.active?.attachedEnergy.length ?? 0) > 0
      || o.bench.some(b => b !== null && b.attachedEnergy.length > 0);
    if (!hasAnyEnergy) {
      return log(next, `${o.name} has no Energy attached — Super Energy Removal has no target!`);
    }
    return { ...next, pendingTrainer: { type: 'super-energy-removal' } };
  }
  if (name === 'gust of wind' || id === 'base1-93') {
    if (!next[opp].bench.some(b => b !== null)) {
      return log(next, `${next[opp].name} has no benched Pokémon to gust!`);
    }
    return { ...next, pendingTrainer: { type: 'gust-of-wind' } };
  }
  if (name === 'pokédex' || name === 'pokedex' || id === 'base1-87') {
    const top5 = next[active].deck.slice(0, 5);
    return { ...next, pendingTrainer: { type: 'pokedex', cards: top5.map(c => c.card), cardUids: top5.map(c => c.uid) } };
  }
  if (name === 'poké ball' || name === 'pokeball' || id === 'base2-64' || id === 'base4-121') {
    const p = next[active];
    const heads = Math.random() < 0.5;
    if (!heads) return log(next, `${p.name} uses Poké Ball — tails! No effect.`);
    const pokemonInDeck = p.deck.filter(c => c.card.supertype === 'Pokémon');
    if (pokemonInDeck.length === 0) {
      const newDeck = [...p.deck].sort(() => Math.random() - 0.5);
      return log({ ...next, [active]: { ...p, deck: newDeck } },
        `${p.name} uses Poké Ball (heads!) — no Pokémon in deck!`);
    }
    return { ...next, pendingTrainer: { type: 'pokeball', pokemonUids: pokemonInDeck.map(c => c.uid) } };
  }

  // ── Maintenance: player picks 2 cards from hand ───────────────────────────
  if (name === 'maintenance' || id === 'base1-83' || id === 'base4-112') {
    const p = next[active];
    if (p.hand.length < 2) return log(next, `${p.name} can't use Maintenance — need 2 cards to shuffle.`);
    return { ...next, pendingTrainer: { type: 'maintenance' } };
  }

  // ── Pokémon Trader: player picks hand pokemon then deck pokemon ────────────
  if (name === 'pokémon trader' || id === 'base1-77' || id === 'base4-106') {
    const p = next[active];
    const handPoke = p.hand.filter(c => isPokemon(c.card));
    const deckPoke = p.deck.filter(c => isPokemon(c.card));
    if (handPoke.length === 0) return log(next, `${p.name} can't use Pokémon Trader — no Pokémon in hand.`);
    if (deckPoke.length === 0) return log(next, `${p.name} can't use Pokémon Trader — no Pokémon in deck.`);
    return { ...next, pendingTrainer: { type: 'pokemon-trader' } };
  }

  // ── Computer Search: discard 2 from hand, pick any card from deck ──────────
  if (name === 'computer search' || id === 'base1-71' || id === 'base4-101') {
    const p = next[active];
    if (p.hand.length < 2) return log(next, `${p.name} can't use Computer Search — need 2 cards to discard.`);
    if (p.deck.length === 0) return log(next, `${p.name} plays Computer Search but deck is empty.`);
    return { ...next, pendingTrainer: { type: 'computer-search' } };
  }

  // ── Item Finder: player picks 2 to discard then a trainer from discard ─────
  if (name === 'item finder' || id === 'base1-74') {
    const p = next[active];
    if (p.hand.length < 2) return log(next, `${p.name} can't use Item Finder — need 2 cards to discard.`);
    const trainers = p.discard.filter(c => c.card.supertype === 'Trainer');
    if (trainers.length === 0) return log(next, `${p.name} uses Item Finder but has no Trainers in discard.`);
    return { ...next, pendingTrainer: { type: 'item-finder' } };
  }

  // ── Recycle: coin flip — heads lets player choose a discard card ──────────
  if (name === 'recycle' || id === 'base3-61') {
    const p = next[active];
    const heads = flip();
    if (!heads) return log(next, `${p.name} plays Recycle — tails! No effect.`);
    if (p.discard.length === 0) return log(next, `${p.name} plays Recycle (heads!) but discard is empty.`);
    return log({ ...next, pendingTrainer: { type: 'recycle' } }, `${p.name} plays Recycle — heads! Choose a card from your discard.`);
  }

  // ── Pokémon Breeder: play Stage 2 directly onto a Basic ───────────────────
  if (name === 'pokémon breeder' || id === 'base1-76') {
    const p = next[active];
    const stage2s = p.hand.filter(c => isPokemon(c.card) && c.card.evolvesFrom !== null);
    const hasValidTarget = stage2s.some(s2 => {
      const stage1Name = s2.card.evolvesFrom!;
      const stage1 = ALL_CARDS.find(c => c.name === stage1Name);
      if (!stage1?.evolvesFrom) return false;
      const basicName = stage1.evolvesFrom;
      return [p.active, ...p.bench].some(pk => pk !== null && pk.card.name === basicName);
    });
    if (!hasValidTarget) return log(next, `${p.name} can't use Pokémon Breeder — no valid Stage 2 / Basic pair.`);
    return { ...next, pendingTrainer: { type: 'pokemon-breeder' } };
  }

  // ── Nightly Garbage Run: player picks up to 3 from discard ────────────────
  if (name === 'nightly garbage run' || id === 'base5-77') {
    const p = next[active];
    const eligible = p.discard.filter(c => isPokemon(c.card) || c.card.supertype === 'Energy');
    if (eligible.length === 0) return log(next, `${p.name} uses Nightly Garbage Run but has no eligible cards in discard.`);
    return { ...next, pendingTrainer: { type: 'nightly-garbage-run', selectedUids: [] } };
  }

  // Delegate to comprehensive handler for all other trainers
  return handleTrainerEffect(next, next, active, card, drawCard, inPlayPokemon);
}

export function resolvePendingTrainer(state: GameState, choice: number): GameState {
  const pending = state.pendingTrainer;
  if (!pending) return state;
  const active = state.activePlayer;
  const opp = active === 'player1' ? 'player2' : 'player1';

  const cleared = { ...state, pendingTrainer: undefined };

  // Step 1 — Energy Removal: choice = -1 for active, 0-4 for bench slot
  if (pending.type === 'energy-removal') {
    const o = cleared[opp];
    const targetSlot: 'active' | number = choice === -1 ? 'active' : choice;
    const targetPoke = targetSlot === 'active' ? o.active : o.bench[targetSlot as number];
    if (!targetPoke || targetPoke.attachedEnergy.length === 0) return cleared;
    return { ...cleared, pendingTrainer: { type: 'energy-removal-energy', targetSlot } };
  }
  // Step 2 — Energy Removal: choice = energy index to discard
  if (pending.type === 'energy-removal-energy') {
    const o = cleared[opp];
    const { targetSlot } = pending;
    const targetPoke = targetSlot === 'active' ? o.active : o.bench[targetSlot as number];
    if (!targetPoke) return cleared;
    const energies = targetPoke.attachedEnergy;
    const idx = Math.max(0, Math.min(choice, energies.length - 1));
    const removed = energies[idx];
    if (!removed) return cleared;
    const newEnergies = energies.filter((_, i) => i !== idx);
    const updatedPoke = { ...targetPoke, attachedEnergy: newEnergies };
    const o2 = targetSlot === 'active'
      ? { ...o, active: updatedPoke }
      : (() => { const nb = [...o.bench]; nb[targetSlot as number] = updatedPoke; return { ...o, bench: nb }; })();
    return log({ ...cleared, [opp]: o2 },
      `${cleared[active].name} discards ${removed.type} Energy from ${targetPoke.card.name}!`);
  }

  // Step 1 — Super Energy Removal: choose target pokemon
  if (pending.type === 'super-energy-removal') {
    const o = cleared[opp];
    const targetSlot: 'active' | number = choice === -1 ? 'active' : choice;
    const targetPoke = targetSlot === 'active' ? o.active : o.bench[targetSlot as number];
    if (!targetPoke || targetPoke.attachedEnergy.length === 0) return cleared;
    // Discard 1 energy from active player first
    const p = cleared[active];
    if (!p.active || p.active.attachedEnergy.length === 0) return cleared;
    const [myDiscard, ...myRest] = p.active.attachedEnergy;
    const myDisEl = fakeEnergyCard(myDiscard.type, myDiscard.cardId);
    const updatedMyActive = { ...p.active, attachedEnergy: myRest };
    const next2 = log({
      ...cleared,
      [active]: { ...p, active: updatedMyActive, discard: [...p.discard, myDisEl] },
    }, `${p.name} discards 1 energy for Super Energy Removal.`);
    return { ...next2, pendingTrainer: { type: 'super-energy-removal-energy', targetSlot } };
  }
  // Step 2 — Super Energy Removal: choose 2 energy to remove from target
  if (pending.type === 'super-energy-removal-energy') {
    const o = cleared[opp];
    const { targetSlot } = pending;
    const targetPoke = targetSlot === 'active' ? o.active : o.bench[targetSlot as number];
    if (!targetPoke) return cleared;
    const energies = targetPoke.attachedEnergy;
    // Remove up to 2
    const toRemove = energies.slice(0, 2);
    const remaining = energies.slice(2);
    const updatedPoke = { ...targetPoke, attachedEnergy: remaining };
    const o2 = targetSlot === 'active'
      ? { ...o, active: updatedPoke }
      : (() => { const nb = [...o.bench]; nb[targetSlot as number] = updatedPoke; return { ...o, bench: nb }; })();
    const removedNames = toRemove.map(e => e.type).join(' + ');
    return log({ ...cleared, [opp]: o2 },
      `${cleared[active].name} removes ${removedNames} Energy from ${targetPoke.card.name}! (Super Energy Removal)`);
  }

  if (pending.type === 'gust-of-wind') {
    const o = cleared[opp];
    const slot = choice;
    if (slot < 0 || slot > 4 || !o.bench[slot]) return cleared;
    const swapIn = o.bench[slot]!;
    const newBench = [...o.bench];
    newBench[slot] = o.active;
    return log({ ...cleared, [opp]: { ...o, active: swapIn, bench: newBench } },
      `${cleared[active].name} uses Gust of Wind! ${swapIn.card.name} is forced in!`);
  }

  if (pending.type === 'pokedex') {
    // choice encodes the new ordering as a JSON-encoded array of UIDs via a separate action
    // In the basic resolve path, just clear and apply default order
    return cleared;
  }

  return cleared;
}

// ─── Pokemon Trader resolution ───────────────────────────────────────────────

export function resolvePokemonTrader(state: GameState, uid: string): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];
  const cleared = { ...state, pendingTrainer: undefined };

  if (pending?.type === 'pokemon-trader') {
    const handCard = player.hand.find(c => c.uid === uid);
    if (!handCard || !isPokemon(handCard.card)) return state;
    return { ...state, pendingTrainer: { type: 'pokemon-trader-deck', handUid: uid } };
  }

  if (pending?.type === 'pokemon-trader-deck') {
    const deckCard = player.deck.find(c => c.uid === uid);
    const handCard = player.hand.find(c => c.uid === pending.handUid);
    if (!handCard || !deckCard) return cleared;
    const newHand = player.hand.filter(c => c.uid !== handCard.uid).concat([deckCard]);
    const newDeck = shuffle(player.deck.filter(c => c.uid !== deckCard.uid).concat([handCard]));
    return log({ ...cleared, [active]: { ...player, hand: newHand, deck: newDeck } },
      `${player.name} trades ${handCard.card.name} for ${deckCard.card.name} from deck.`);
  }

  return cleared;
}

// ─── Maintenance resolution ──────────────────────────────────────────────────

export function resolveMaintenance(state: GameState, uid: string): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];

  if (pending?.type === 'maintenance') {
    const card = player.hand.find(c => c.uid === uid);
    if (!card) return state;
    return { ...state, pendingTrainer: { type: 'maintenance-second', firstUid: uid } };
  }

  if (pending?.type === 'maintenance-second') {
    if (uid === pending.firstUid) return state;
    const first = player.hand.find(c => c.uid === pending.firstUid);
    const second = player.hand.find(c => c.uid === uid);
    if (!first || !second) return { ...state, pendingTrainer: undefined };
    const restHand = player.hand.filter(c => c.uid !== pending.firstUid && c.uid !== uid);
    const newDeck = shuffle([...player.deck, first, second]);
    let next: GameState = { ...state, pendingTrainer: undefined, [active]: { ...player, hand: restHand, deck: newDeck } };
    next = drawCard(next, active);
    return log(next, `${player.name} shuffles 2 cards into deck and draws 1.`);
  }

  return { ...state, pendingTrainer: undefined };
}

// ─── Item Finder resolution ──────────────────────────────────────────────────

export function resolveItemFinder(state: GameState, uid: string): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];

  if (pending?.type === 'item-finder') {
    const card = player.hand.find(c => c.uid === uid);
    if (!card) return state;
    return { ...state, pendingTrainer: { type: 'item-finder-second', firstUid: uid } };
  }

  if (pending?.type === 'item-finder-second') {
    if (uid === pending.firstUid) return state;
    const second = player.hand.find(c => c.uid === uid);
    if (!second) return state;
    return { ...state, pendingTrainer: { type: 'item-finder-trainer', firstUid: pending.firstUid, secondUid: uid } };
  }

  if (pending?.type === 'item-finder-trainer') {
    const first = player.hand.find(c => c.uid === pending.firstUid);
    const second = player.hand.find(c => c.uid === pending.secondUid);
    const trainerCard = player.discard.find(c => c.uid === uid);
    if (!first || !second || !trainerCard || trainerCard.card.supertype !== 'Trainer') {
      return { ...state, pendingTrainer: undefined };
    }
    const restHand = player.hand.filter(c => c.uid !== pending.firstUid && c.uid !== pending.secondUid);
    const newDiscard = player.discard.filter(c => c.uid !== uid).concat([first, second]);
    return log(
      { ...state, pendingTrainer: undefined, [active]: { ...player, hand: [...restHand, trainerCard], discard: newDiscard } },
      `${player.name} uses Item Finder to recover ${trainerCard.card.name}!`,
    );
  }

  return { ...state, pendingTrainer: undefined };
}

// ─── Computer Search resolution ──────────────────────────────────────────────

export function resolveComputerSearch(state: GameState, uid: string): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];

  // Step 1 — pick first card to discard from hand
  if (pending?.type === 'computer-search') {
    const card = player.hand.find(c => c.uid === uid);
    if (!card) return state;
    return { ...state, pendingTrainer: { type: 'computer-search-second', firstUid: uid } };
  }

  // Step 2 — pick second card to discard from hand
  if (pending?.type === 'computer-search-second') {
    if (uid === pending.firstUid) return state; // can't pick same card twice
    const card = player.hand.find(c => c.uid === uid);
    if (!card) return state;
    return { ...state, pendingTrainer: { type: 'computer-search-deck', firstUid: pending.firstUid, secondUid: uid } };
  }

  // Step 3 — pick any card from deck
  if (pending?.type === 'computer-search-deck') {
    const first = player.hand.find(c => c.uid === pending.firstUid);
    const second = player.hand.find(c => c.uid === pending.secondUid);
    const deckCard = player.deck.find(c => c.uid === uid);
    if (!first || !second || !deckCard) return { ...state, pendingTrainer: undefined };
    const restHand = player.hand.filter(c => c.uid !== pending.firstUid && c.uid !== pending.secondUid);
    const newDiscard = [...player.discard, first, second];
    const newDeck = shuffle(player.deck.filter(c => c.uid !== uid));
    return log(
      { ...state, pendingTrainer: undefined, [active]: { ...player, hand: [...restHand, deckCard], deck: newDeck, discard: newDiscard } },
      `${player.name} uses Computer Search and finds ${deckCard.card.name}!`,
    );
  }

  return { ...state, pendingTrainer: undefined };
}

// ─── Nightly Garbage Run resolution ─────────────────────────────────────────

export function resolveNightlyGarbageRun(state: GameState, uid: string | null): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];
  if (pending?.type !== 'nightly-garbage-run') return state;

  // null = confirm selection
  if (uid === null) {
    const selected = pending.selectedUids
      .map(id => player.discard.find(c => c.uid === id))
      .filter(Boolean) as import('./GameState').CardInstance[];
    const newDiscard = player.discard.filter(c => !pending.selectedUids.includes(c.uid));
    const newDeck = shuffle([...player.deck, ...selected]);
    return log(
      { ...state, pendingTrainer: undefined, [active]: { ...player, discard: newDiscard, deck: newDeck } },
      `${player.name} shuffles ${selected.length} card(s) from discard into deck (Nightly Garbage Run).`,
    );
  }

  // Toggle selection (max 3)
  const already = pending.selectedUids.includes(uid);
  if (already) {
    return { ...state, pendingTrainer: { ...pending, selectedUids: pending.selectedUids.filter(u => u !== uid) } };
  }
  if (pending.selectedUids.length >= 3) return state;
  return { ...state, pendingTrainer: { ...pending, selectedUids: [...pending.selectedUids, uid] } };
}

// ─── Recycle resolution ──────────────────────────────────────────────────────

export function resolveRecycle(state: GameState, uid: string): GameState {
  if (state.pendingTrainer?.type !== 'recycle') return state;
  const active = state.activePlayer;
  const player = state[active];
  const chosen = player.discard.find(c => c.uid === uid);
  if (!chosen) return state;
  const newDiscard = player.discard.filter(c => c.uid !== uid);
  return log(
    { ...state, pendingTrainer: undefined, [active]: { ...player, deck: [chosen, ...player.deck], discard: newDiscard } },
    `${player.name} puts ${chosen.card.name} on top of the deck (Recycle).`,
  );
}

// ─── Pokémon Breeder resolution ──────────────────────────────────────────────

export function resolvePokemonBreeder(state: GameState, uid: string): GameState {
  const pending = state.pendingTrainer;
  const active = state.activePlayer;
  const player = state[active];
  const cleared = { ...state, pendingTrainer: undefined };

  if (pending?.type === 'pokemon-breeder') {
    // uid = hand card UID (must be Stage 2)
    const stage2Card = player.hand.find(c => c.uid === uid);
    if (!stage2Card || !isPokemon(stage2Card.card) || !stage2Card.card.evolvesFrom) return state;
    return { ...state, pendingTrainer: { type: 'pokemon-breeder-target', stage2Uid: uid } };
  }

  if (pending?.type === 'pokemon-breeder-target') {
    // uid = in-play Pokémon UID (must be the Basic that chains to the Stage 2)
    const stage2Card = player.hand.find(c => c.uid === pending.stage2Uid);
    if (!stage2Card) return cleared;

    const stage1Name = stage2Card.card.evolvesFrom!;
    const stage1Data = ALL_CARDS.find(c => c.name === stage1Name);
    const basicName = stage1Data?.evolvesFrom ?? null;

    const applyBreeder = (pk: InPlayPokemon | null): InPlayPokemon | null => {
      if (!pk || pk.uid !== uid) return pk;
      if (pk.card.name !== basicName) return pk;
      const damageTaken = Math.min(pk.damageTaken, (stage2Card.card.hp ?? 0) - 1);
      return {
        ...pk,
        card: stage2Card.card,
        currentHP: stage2Card.card.hp ?? pk.currentHP,
        damageTaken,
        evolvedFrom: [...pk.evolvedFrom, pk.card],
        turnPlayed: pk.turnPlayed,
      };
    };

    const newActive = applyBreeder(player.active);
    const newBench = player.bench.map(applyBreeder) as (InPlayPokemon | null)[];

    if (newActive === player.active && newBench.every((b, i) => b === player.bench[i])) {
      return log(cleared, `Pokémon Breeder: target must be a Basic that ${stage2Card.card.name} evolves from.`);
    }

    const targetName = (newActive?.uid === uid ? newActive?.card.name :
      newBench.find(b => b?.uid === uid)?.card.name) ?? stage2Card.card.name;
    return log(
      { ...cleared, [active]: { ...player, hand: player.hand.filter(c => c.uid !== pending.stage2Uid), active: newActive, bench: newBench } },
      `${player.name} uses Pokémon Breeder to evolve directly into ${targetName}!`,
    );
  }

  return cleared;
}

// ─── evolve ──────────────────────────────────────────────────────────────────

export function evolve(state: GameState, handUid: string, targetUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const evoCard = player.hand.find(c => c.uid === handUid);

  if (!evoCard || !isPokemon(evoCard.card) || !evoCard.card.evolvesFrom) return state;

  // Aerodactyl Prehistoric Power: block all evolution while in play
  for (const side of ['player1', 'player2'] as const) {
    const p = state[side];
    const hasAero = (p.active && isPassivePowerOn(p.active, 'Prehistoric Power', state))
      || p.bench.some(b => b !== null && isPassivePowerOn(b, 'Prehistoric Power', state));
    if (hasAero) {
      return log(state, `⚠️ Aerodactyl's Prehistoric Power prevents all Evolution!`);
    }
  }

  const evolveTarget = (pokemon: InPlayPokemon | null): InPlayPokemon | null => {
    if (!pokemon || pokemon.uid !== targetUid) return pokemon;
    if (pokemon.card.name !== evoCard.card.evolvesFrom) return pokemon;
    if (pokemon.turnPlayed === state.turn) return pokemon;

    const damageTaken = Math.min(pokemon.damageTaken, (evoCard.card.hp ?? 0) - 1);
    return {
      ...pokemon,
      card: evoCard.card,
      currentHP: evoCard.card.hp ?? pokemon.currentHP,
      damageTaken: Math.max(0, damageTaken),
      statusCondition: null,
      turnPlayed: state.turn,
      evolvedFrom: [...pokemon.evolvedFrom, pokemon.card],
      energyBurned: false,
    };
  };

  const newActive = evolveTarget(player.active);
  const newBench = player.bench.map(evolveTarget) as (InPlayPokemon | null)[];

  if (newActive === player.active && newBench.every((b, i) => b === player.bench[i])) return state;

  const targetName = newActive?.uid === targetUid ? newActive?.card.name :
    newBench.find(b => b?.uid === targetUid)?.card.name;

  const newHand = player.hand.filter(c => c.uid !== handUid);
  const updated = { ...player, hand: newHand, active: newActive, bench: newBench };
  return log({ ...state, [active]: updated }, `${player.name} evolves into ${targetName}.`);
}

// ─── Poké Ball resolve ───────────────────────────────────────────────────────

export function resolvePokeball(state: GameState, chosenUid: string): GameState {
  if (state.pendingTrainer?.type !== 'pokeball') return state;
  const active = state.activePlayer;
  const player = state[active];
  const chosen = player.deck.find(c => c.uid === chosenUid);
  if (!chosen) return state;
  const newDeck = [...player.deck.filter(c => c.uid !== chosenUid)].sort(() => Math.random() - 0.5);
  return log(
    { ...state, [active]: { ...player, hand: [...player.hand, chosen], deck: newDeck }, pendingTrainer: undefined },
    `${player.name} uses Poké Ball — fetched ${chosen.card.name}!`,
  );
}

// ─── Pokédex reorder ─────────────────────────────────────────────────────────

export function resolvePokedex(state: GameState, orderedUids: string[]): GameState {
  if (state.pendingTrainer?.type !== 'pokedex') return state;
  const active = state.activePlayer;
  const player = state[active];
  const top5Uids = state.pendingTrainer.cardUids;
  // Build the reordered top-5 from the deck based on orderedUids
  const reordered = orderedUids.map(uid => player.deck.find(c => c.uid === uid)).filter(Boolean) as CardInstance[];
  // Rest of deck (cards not in the top 5)
  const rest = player.deck.filter(c => !top5Uids.includes(c.uid));
  const newDeck = [...reordered, ...rest];
  return log({ ...state, [active]: { ...player, deck: newDeck }, pendingTrainer: undefined },
    `${player.name} rearranges the top ${reordered.length} card(s) of their deck.`);
}

// ─── Active Pokémon Powers ────────────────────────────────────────────────────

// Vileplume Heal: remove 1 damage counter from each of your Pokémon (once per turn)
export function useVileplumHeal(state: GameState): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const vileplume = [player.active, ...player.bench].find(
    p => p !== null && isActivePowerOn(p, 'Heal', state),
  ) as InPlayPokemon | undefined;
  if (!vileplume) return log(state, 'No Vileplume with Heal power available.');
  if (powerUsed(state, vileplume.uid, 'Heal')) return log(state, 'Heal power already used this turn.');
  const heal = (p: InPlayPokemon | null) => p ? { ...p, damageTaken: Math.max(0, p.damageTaken - 10) } : null;
  let next = {
    ...state,
    [active]: { ...player, active: heal(player.active), bench: player.bench.map(heal) as (InPlayPokemon | null)[] },
  };
  next = markPowerUsed(next, vileplume.uid, 'Heal');
  return log(next, `🌸 ${player.name} uses Vileplume's Heal — 1 damage counter removed from each Pokémon!`);
}

// Charizard Energy Burn: all attached energy counts as Fire this turn
export function useEnergyBurn(state: GameState): GameState {
  const active = state.activePlayer;
  const player = state[active];
  if (!player.active || !isActivePowerOn(player.active, 'Energy Burn', state)) {
    return log(state, 'No Charizard with Energy Burn available.');
  }
  const updated = { ...player.active, energyBurned: true };
  return log({ ...state, [active]: { ...player, active: updated } },
    `🔥 ${player.name} uses Energy Burn — all energy on ${player.active.card.name} is now Fire!`);
}

// Blastoise Rain Dance: attach Water Energy from hand to any Water Pokémon (no per-turn limit)
export function useRainDance(state: GameState, energyHandUid: string, targetUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const blastoise = [player.active, ...player.bench].find(
    p => p !== null && isActivePowerOn(p, 'Rain Dance', state),
  );
  if (!blastoise) return log(state, 'No Blastoise with Rain Dance available.');
  const energyCard = player.hand.find(c => c.uid === energyHandUid);
  if (!energyCard || energyCard.card.supertype !== 'Energy') return state;
  const isWater = energyCard.card.types.includes('Water') || energyCard.card.name.toLowerCase().includes('water');
  if (!isWater) return log(state, 'Rain Dance only works with Water Energy cards!');
  const attach = (p: InPlayPokemon | null): InPlayPokemon | null => {
    if (!p || p.uid !== targetUid) return p;
    if (!p.card.types.includes('Water')) return p; // must be Water Pokémon
    const inst: EnergyInstance = { uid: makeUID(), type: 'Water', cardId: energyCard.card.id };
    return { ...p, attachedEnergy: [...p.attachedEnergy, inst] };
  };
  const newActive = attach(player.active);
  const newBench = player.bench.map(attach) as (InPlayPokemon | null)[];
  if (newActive === player.active && newBench.every((b, i) => b === player.bench[i])) {
    return log(state, 'Rain Dance: target must be a Water Pokémon!');
  }
  const targetName = (newActive?.uid === targetUid ? newActive?.card.name
    : newBench.find(b => b?.uid === targetUid)?.card.name) ?? 'Pokémon';
  return log({ ...state, [active]: { ...player, hand: player.hand.filter(c => c.uid !== energyHandUid), active: newActive, bench: newBench } },
    `💧 Rain Dance: Water Energy attached to ${targetName}!`);
}

// Venusaur Energy Trans: move 1 energy from one of your Pokémon to another (unlimited per turn)
export function useEnergyTrans(state: GameState, fromUid: string, energyIdx: number, toUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const venusaur = [player.active, ...player.bench].find(
    p => p !== null && isActivePowerOn(p, 'Energy Trans', state),
  );
  if (!venusaur) return log(state, 'No Venusaur with Energy Trans available.');
  const fromPoke = [player.active, ...player.bench].find(p => p?.uid === fromUid) as InPlayPokemon | undefined;
  if (!fromPoke || energyIdx < 0 || energyIdx >= fromPoke.attachedEnergy.length) return state;
  const energyToMove = fromPoke.attachedEnergy[energyIdx];
  const updatedFrom = { ...fromPoke, attachedEnergy: fromPoke.attachedEnergy.filter((_, i) => i !== energyIdx) };
  let next = setPokemonInPlay(state, fromUid, updatedFrom);
  const toPoke = [next[active].active, ...next[active].bench].find(p => p?.uid === toUid) as InPlayPokemon | undefined;
  if (!toPoke) return state;
  const updatedTo = { ...toPoke, attachedEnergy: [...toPoke.attachedEnergy, energyToMove] };
  next = setPokemonInPlay(next, toUid, updatedTo);
  return log(next, `🌿 Energy Trans: ${energyToMove.type} Energy moved from ${fromPoke.card.name} to ${toPoke.card.name}.`);
}

// Alakazam Damage Swap: move 1 damage counter between your Pokémon (can't KO destination)
export function useDamageSwap(state: GameState, fromUid: string, toUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const alakazam = [player.active, ...player.bench].find(
    p => p !== null && isActivePowerOn(p, 'Damage Swap', state),
  );
  if (!alakazam) return log(state, 'No Alakazam with Damage Swap available.');
  const fromPoke = [player.active, ...player.bench].find(p => p?.uid === fromUid) as InPlayPokemon | undefined;
  const toPoke = [player.active, ...player.bench].find(p => p?.uid === toUid) as InPlayPokemon | undefined;
  if (!fromPoke || !toPoke || fromPoke.uid === toPoke.uid) return state;
  if (fromPoke.damageTaken < 10) return log(state, 'No damage counters to move from that Pokémon.');
  if (toPoke.damageTaken + 10 >= (toPoke.card.hp ?? 0)) {
    return log(state, `Damage Swap would knock out ${toPoke.card.name} — not allowed!`);
  }
  let next = setPokemonInPlay(state, fromUid, { ...fromPoke, damageTaken: fromPoke.damageTaken - 10 });
  next = setPokemonInPlay(next, toUid, { ...toPoke, damageTaken: toPoke.damageTaken + 10 });
  return log(next, `🔮 Damage Swap: 10 damage moved from ${fromPoke.card.name} to ${toPoke.card.name}.`);
}

// Gengar Curse: move 1 damage counter between opponent's Pokémon (once per turn)
export function useGengarCurse(state: GameState, fromOppUid: string, toOppUid: string): GameState {
  const active = state.activePlayer;
  const opp = active === 'player1' ? 'player2' : 'player1';
  const player = state[active];
  const opponent = state[opp];
  const gengar = [player.active, ...player.bench].find(
    p => p !== null && isActivePowerOn(p, 'Curse', state),
  ) as InPlayPokemon | undefined;
  if (!gengar) return log(state, 'No Gengar with Curse available.');
  if (powerUsed(state, gengar.uid, 'Curse')) return log(state, 'Curse already used this turn.');
  const fromPoke = [opponent.active, ...opponent.bench].find(p => p?.uid === fromOppUid) as InPlayPokemon | undefined;
  const toPoke = [opponent.active, ...opponent.bench].find(p => p?.uid === toOppUid) as InPlayPokemon | undefined;
  if (!fromPoke || !toPoke || fromPoke.uid === toPoke.uid) return state;
  if (fromPoke.damageTaken < 10) return log(state, `${fromPoke.card.name} has no damage counters.`);
  let next = setPokemonInPlay(state, fromOppUid, { ...fromPoke, damageTaken: fromPoke.damageTaken - 10 });
  next = setPokemonInPlay(next, toOppUid, { ...toPoke, damageTaken: toPoke.damageTaken + 10 });
  next = markPowerUsed(next, gengar.uid, 'Curse');
  next = log(next, `👻 Curse: damage counter moved from ${fromPoke.card.name} to ${toPoke.card.name}.`);
  // Check if the destination pokemon is now KO'd
  const toPokeAfter = [next[opp].active, ...next[opp].bench].find(p => p?.uid === toOppUid);
  if (toPokeAfter && isKnockedOut(toPokeAfter)) {
    next = resolveKO(next, opp, active);
    next = checkWinConditions(next);
  }
  return next;
}

// Electrode Buzzap: KO Electrode from bench, attach it as 2 energy to a Pokémon
export function useBuzzap(state: GameState, benchSlot: number, targetUid: string, energyType: EnergyType): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const electrode = player.bench[benchSlot];
  if (!electrode || !isActivePowerOn(electrode, 'Buzzap', state)) {
    return log(state, 'No Electrode with Buzzap on that bench slot.');
  }
  const allPoke = [player.active, ...player.bench];
  const targetPoke = allPoke.find(p => p?.uid === targetUid && p.uid !== electrode.uid) as InPlayPokemon | undefined;
  if (!targetPoke) return log(state, 'Invalid Buzzap target.');
  // KO Electrode
  const electrodeCard = makeCardInstance(electrode.card);
  const electrodeEnergy = electrode.attachedEnergy.map(e => fakeEnergyCard(e.type, e.cardId));
  const newBench = [...player.bench]; newBench[benchSlot] = null;
  // Give 2 energy of chosen type to target
  const e1: EnergyInstance = { uid: makeUID(), type: energyType, cardId: electrode.card.id };
  const e2: EnergyInstance = { uid: makeUID(), type: energyType, cardId: electrode.card.id };
  const updatedTarget = { ...targetPoke, attachedEnergy: [...targetPoke.attachedEnergy, e1, e2] };
  const newActive = targetPoke.uid === player.active?.uid ? updatedTarget : player.active;
  const finalBench = newBench.map(b => b?.uid === targetPoke.uid ? updatedTarget : b) as (InPlayPokemon | null)[];
  return log({
    ...state,
    [active]: { ...player, active: newActive, bench: finalBench, discard: [...player.discard, electrodeCard, ...electrodeEnergy] },
  }, `⚡ Buzzap! ${electrode.card.name} sacrificed — 2 ${energyType} Energy attached to ${targetPoke.card.name}!`);
}
