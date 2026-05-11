import type {
  GameState, PlayerState, CardData, CardInstance, InPlayPokemon,
  EnergyInstance, EnergyType,
} from './GameState';
import { calculateDamage, applyPoisonDamage, applyBurnDamage, isKnockedOut } from './damage';
import { checkWinConditions, checkDeckOut } from './winConditions';
import { makeUID, makeCardInstance, canPayCost, isPokemon, isBasicPokemon } from '@/lib/cardUtils';

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
  };
}

function inPlayPokemon(card: CardData, turn: number): InPlayPokemon {
  return {
    uid: makeUID(),
    card,
    currentHP: card.hp ?? 10,
    damageTaken: 0,
    attachedEnergy: [],
    statusCondition: null,
    turnPlayed: turn,
    isFirstTurn: false,
  };
}

// ─── init ────────────────────────────────────────────────────────────────────

export function initGame(
  p1Name: string, p1Deck: CardData[],
  p2Name: string, p2Deck: CardData[],
  mode: 'vs-ai' | 'local-2p',
): GameState {
  let p1 = makePlayer('player1', p1Name, p1Deck);
  let p2 = makePlayer('player2', p2Name, p2Deck);

  // Deal 7 cards each
  p1 = { ...p1, hand: p1.deck.slice(0, 7), deck: p1.deck.slice(7) };
  p2 = { ...p2, hand: p2.deck.slice(0, 7), deck: p2.deck.slice(7) };

  // Deal 6 prize cards each
  p1 = { ...p1, prizes: p1.deck.slice(0, 6), deck: p1.deck.slice(6) };
  p2 = { ...p2, prizes: p2.deck.slice(0, 6), deck: p2.deck.slice(6) };

  return {
    phase: 'main', // skip setup phase for simplicity — auto-deal
    turn: 1,
    activePlayer: 'player1',
    player1: p1,
    player2: p2,
    winner: null,
    log: [`Game started! ${p1Name} goes first.`],
    pendingCoinFlip: false,
    mode,
  };
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
  if (player.energyPlayedThisTurn) return state;

  const energyCard = player.hand.find(c => c.uid === energyHandUid);
  if (!energyCard || energyCard.card.supertype !== 'Energy') return state;

  const energyType: EnergyType = (energyCard.card.types[0] as EnergyType) || 'Colorless';
  const energyInst: EnergyInstance = { uid: makeUID(), type: energyType, cardId: energyCard.card.id };

  const attachTo = (pokemon: InPlayPokemon | null): InPlayPokemon | null => {
    if (!pokemon || pokemon.uid !== targetUid) return pokemon;
    return { ...pokemon, attachedEnergy: [...pokemon.attachedEnergy, energyInst] };
  };

  const newActive = attachTo(player.active);
  const newBench = player.bench.map(attachTo) as (InPlayPokemon | null)[];
  const targetName = (newActive?.uid === targetUid ? newActive?.card.name :
    newBench.find(b => b?.uid === targetUid)?.card.name) ?? 'Pokemon';

  if (newActive === player.active && newBench.every((b, i) => b === player.bench[i])) {
    return state; // nothing attached
  }

  const newHand = player.hand.filter(c => c.uid !== energyHandUid);
  const updated = {
    ...player,
    hand: newHand,
    active: newActive,
    bench: newBench,
    energyPlayedThisTurn: true,
  };
  return log({ ...state, [active]: updated }, `${player.name} attaches ${energyType} Energy to ${targetName}.`);
}

// ─── retreat ─────────────────────────────────────────────────────────────────

export function retreat(state: GameState, benchSlot: number): GameState {
  const active = state.activePlayer;
  const player = state[active];
  if (player.retreatedThisTurn) return state;
  if (!player.active) return state;

  const cost = player.active.card.retreatCost.length;
  const totalEnergy = player.active.attachedEnergy.length;
  if (totalEnergy < cost) return state;

  const swapTo = player.bench[benchSlot];
  if (!swapTo) return state;

  // Discard retreat cost energy
  const energyToDiscard = player.active.attachedEnergy.slice(-cost);
  const remainingEnergy = player.active.attachedEnergy.slice(0, totalEnergy - cost);
  const retreatedPokemon = { ...player.active, attachedEnergy: remainingEnergy };

  const newBench = [...player.bench];
  newBench[benchSlot] = retreatedPokemon;

  const discardedCards: CardInstance[] = energyToDiscard.map(e => ({
    uid: e.uid,
    card: { id: e.cardId, name: `${e.type} Energy`, set: 'Basic', setCode: 'basic', number: '0',
      rarity: 'Common', supertype: 'Energy', subtype: 'Basic', evolvesFrom: null, hp: null,
      types: [e.type], attacks: [], abilities: [], weaknesses: [], resistances: [], retreatCost: [],
      rules: [], localImagePath: null, apiImageUrl: null },
  }));

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

// ─── attack ──────────────────────────────────────────────────────────────────

export function flipCoin(): boolean {
  return Math.random() < 0.5;
}

export function attack(state: GameState, attackIndex: number): GameState {
  const active = state.activePlayer;
  const opponent = active === 'player1' ? 'player2' : 'player1';
  const attacker = state[active];
  const defender = state[opponent];

  if (!attacker.active || !defender.active) return state;
  if (attacker.hasAttackedThisTurn) return state;

  const atk = attacker.active.card.attacks[attackIndex];
  if (!atk) return state;

  if (!canPayCost(atk.cost, attacker.active.attachedEnergy)) return state;

  // Check paralysis
  if (attacker.active.statusCondition === 'Paralyzed') {
    const cleared = { ...attacker.active, statusCondition: null };
    return log(
      { ...state, [active]: { ...attacker, active: cleared, hasAttackedThisTurn: true } },
      `${attacker.active.card.name} is Paralyzed and can't attack! The Paralysis fades.`,
    );
  }

  // Check confusion — coin flip
  if (attacker.active.statusCondition === 'Confused') {
    const heads = flipCoin();
    if (!heads) {
      const selfDamaged = { ...attacker.active, damageTaken: attacker.active.damageTaken + 30 };
      let next = log(
        { ...state, [active]: { ...attacker, active: selfDamaged, hasAttackedThisTurn: true } },
        `${attacker.active.card.name} is Confused! Coin flip tails — hits itself for 30!`,
      );
      next = resolveKO(next, active, null);
      return checkWinConditions(next);
    }
  }

  // Coin flip for attack effects
  let coinResult: boolean | null = null;
  const needsCoin = atk.text.toLowerCase().includes('flip a coin');
  if (needsCoin) {
    coinResult = flipCoin();
  }

  let damage = calculateDamage(attacker.active.card.types, atk, defender.active);

  // Handle "+X more damage on heads" patterns
  if (coinResult === true && atk.text.match(/heads.*(\d+)\s*more damage/i)) {
    const extra = parseInt(atk.text.match(/heads.*?(\d+)\s*more damage/i)![1]);
    damage += extra;
  }
  if (coinResult === false && atk.text.match(/tails.*no damage|tails.*fails/i)) {
    damage = 0;
  }

  let msg = `${attacker.active.card.name} uses ${atk.name}`;
  if (damage > 0) msg += ` for ${damage} damage`;
  if (needsCoin) msg += ` (coin flip: ${coinResult ? 'heads' : 'tails'})`;
  msg += '!';

  // Apply status effects from attack text
  let newDefenderActive = { ...defender.active, damageTaken: defender.active.damageTaken + damage };

  if (atk.text.toLowerCase().includes('sleep')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Asleep' };
  else if (atk.text.toLowerCase().includes('paralyz')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Paralyzed' };
  else if (atk.text.toLowerCase().includes('poison')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Poisoned' };
  else if (atk.text.toLowerCase().includes('confus')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Confused' };
  else if (atk.text.toLowerCase().includes('burn')) newDefenderActive = { ...newDefenderActive, statusCondition: 'Burned' };

  let next = log(
    {
      ...state,
      [active]: { ...attacker, hasAttackedThisTurn: true },
      [opponent]: { ...defender, active: newDefenderActive },
    },
    msg,
  );

  next = resolveKO(next, opponent, active);
  return checkWinConditions(next);
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

  // Move KO'd pokemon + attached energy to discard
  const discarded: CardInstance[] = [
    makeCardInstance(player.active.card),
    ...player.active.attachedEnergy.map(e => makeCardInstance({
      id: e.cardId, name: `${e.type} Energy`, set: 'Basic', setCode: 'basic',
      number: '0', rarity: 'Common', supertype: 'Energy', subtype: 'Basic',
      evolvesFrom: null, hp: null, types: [e.type], attacks: [], abilities: [],
      weaknesses: [], resistances: [], retreatCost: [], rules: [],
      localImagePath: null, apiImageUrl: null,
    })),
  ];

  let newPlayer = { ...player, active: null, discard: [...player.discard, ...discarded] };
  let next = log({ ...state, [knockedSide]: newPlayer }, `${player.active.card.name} is knocked out!`);

  // Prize card to winner
  if (prizeTaker && state[prizeTaker].prizes.length > 0) {
    const taker = next[prizeTaker];
    const [prize, ...remainingPrizes] = taker.prizes;
    const newHand = [...taker.hand, prize];
    next = log(
      { ...next, [prizeTaker]: { ...taker, prizes: remainingPrizes, hand: newHand } },
      `${taker.name} takes a prize card! (${remainingPrizes.length} left)`,
    );
  }

  // Auto-promote from bench if only one Pokemon left
  const updatedKnocked = next[knockedSide];
  const firstBench = updatedKnocked.bench.findIndex(b => b !== null);
  if (firstBench >= 0 && updatedKnocked.bench[firstBench]) {
    const promoted = updatedKnocked.bench[firstBench]!;
    const newBench = [...updatedKnocked.bench];
    newBench[firstBench] = null;
    const allOthers = newBench.every(b => b === null);
    if (allOthers) {
      // Only one Pokemon left — auto-promote
      next = log(
        { ...next, [knockedSide]: { ...updatedKnocked, active: promoted, bench: newBench } },
        `${promoted.card.name} is promoted to Active!`,
      );
    }
  }

  return next;
}

// ─── end of turn ─────────────────────────────────────────────────────────────

export function endTurn(state: GameState): GameState {
  const active = state.activePlayer;
  const opponent = active === 'player1' ? 'player2' : 'player1';
  const player = state[active];

  // Apply poison/burn end-of-turn effects to active player's Pokemon
  let updatedActive = player.active ? applyPoisonDamage(player.active) : null;
  updatedActive = updatedActive ? applyBurnDamage(updatedActive) : null;

  // Wake up sleeping pokemon (coin flip)
  if (updatedActive?.statusCondition === 'Asleep') {
    if (flipCoin()) updatedActive = { ...updatedActive, statusCondition: null };
  }

  let next: GameState = {
    ...state,
    [active]: {
      ...player,
      active: updatedActive,
      energyPlayedThisTurn: false,
      retreatedThisTurn: false,
      hasAttackedThisTurn: false,
    },
    activePlayer: opponent,
    turn: state.turn + 1,
    phase: 'draw',
    log: [...state.log, `--- ${state[opponent].name}'s turn ---`],
  };

  // Check if end-of-turn damage KO'd something
  if (updatedActive && isKnockedOut(updatedActive)) {
    next = resolveKO(next, active, opponent);
  }

  return checkWinConditions(next);
}

// ─── trainer card ─────────────────────────────────────────────────────────────

export function playTrainer(state: GameState, handUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const card = player.hand.find(c => c.uid === handUid);
  if (!card || card.card.supertype !== 'Trainer') return state;

  let next: GameState = {
    ...state,
    [active]: {
      ...player,
      hand: player.hand.filter(c => c.uid !== handUid),
      discard: [...player.discard, card],
    },
  };
  next = log(next, `${player.name} plays ${card.card.name}.`);

  const name = card.card.name.toLowerCase();

  // Professor Oak / Professor's Research: discard hand, draw 7
  if (name.includes('professor oak') || name.includes("professor's research")) {
    const p = next[active];
    next = { ...next, [active]: { ...p, discard: [...p.discard, ...p.hand], hand: [] } };
    for (let i = 0; i < 7; i++) next = drawCard(next, active);
    return log(next, `${player.name} discards their hand and draws 7 cards.`);
  }

  // Bill / Pokédex: draw 2
  if (name === 'bill' || name.includes('pokédex')) {
    next = drawCard(next, active);
    next = drawCard(next, active);
    return log(next, `${player.name} draws 2 cards.`);
  }

  // Potion: heal 20 from active
  if (name === 'potion') {
    const p = next[active];
    if (p.active) {
      const healed = { ...p.active, damageTaken: Math.max(0, p.active.damageTaken - 20) };
      next = log({ ...next, [active]: { ...p, active: healed } }, `${player.name} heals 20 from ${p.active.card.name}.`);
    }
    return next;
  }

  // Super Potion: heal 40 from active, discard 1 energy
  if (name === 'super potion') {
    const p = next[active];
    if (p.active && p.active.attachedEnergy.length > 0) {
      const [discardedE, ...remaining] = p.active.attachedEnergy;
      const healed = { ...p.active, damageTaken: Math.max(0, p.active.damageTaken - 40), attachedEnergy: remaining };
      const eCard = makeCardInstance({ id: discardedE.cardId, name: `${discardedE.type} Energy`, set: 'Basic', setCode: 'basic', number: '0',
        rarity: 'Common', supertype: 'Energy', subtype: 'Basic', evolvesFrom: null, hp: null,
        types: [discardedE.type], attacks: [], abilities: [], weaknesses: [], resistances: [], retreatCost: [], rules: [],
        localImagePath: null, apiImageUrl: null });
      next = log({ ...next, [active]: { ...p, active: healed, discard: [...p.discard, eCard] } },
        `${player.name} heals 40 from ${p.active.card.name} (discards 1 energy).`);
    }
    return next;
  }

  // Switch: swap active with bench
  if (name === 'switch') {
    const p = next[active];
    const firstBench = p.bench.findIndex(b => b !== null);
    if (p.active && firstBench >= 0) {
      const swapTarget = p.bench[firstBench]!;
      const newBench = [...p.bench];
      newBench[firstBench] = p.active;
      next = log({ ...next, [active]: { ...p, active: swapTarget, bench: newBench } },
        `${player.name} switches ${p.active.card.name} with ${swapTarget.card.name}.`);
    }
    return next;
  }

  return log(next, `(${card.card.name}'s effect is not yet implemented.)`);
}

// ─── evolve ──────────────────────────────────────────────────────────────────

export function evolve(state: GameState, handUid: string, targetUid: string): GameState {
  const active = state.activePlayer;
  const player = state[active];
  const evoCard = player.hand.find(c => c.uid === handUid);

  if (!evoCard || !isPokemon(evoCard.card) || !evoCard.card.evolvesFrom) return state;

  const evolveTarget = (pokemon: InPlayPokemon | null): InPlayPokemon | null => {
    if (!pokemon || pokemon.uid !== targetUid) return pokemon;
    if (pokemon.card.name !== evoCard.card.evolvesFrom) return pokemon;
    if (pokemon.turnPlayed === state.turn) return pokemon; // can't evolve same turn

    const damageTaken = Math.min(pokemon.damageTaken, (evoCard.card.hp ?? 0) - 1);
    return {
      ...pokemon,
      card: evoCard.card,
      currentHP: evoCard.card.hp ?? pokemon.currentHP,
      damageTaken: Math.max(0, damageTaken),
      statusCondition: null,
      turnPlayed: state.turn,
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
