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
  // Deal 6 prize cards to each player
  const p1 = { ...state.player1, prizes: state.player1.deck.slice(0, 6), deck: state.player1.deck.slice(6) };
  const p2 = { ...state.player2, prizes: state.player2.deck.slice(0, 6), deck: state.player2.deck.slice(6) };

  // Coin flip for who goes first
  const p1First = Math.random() < 0.5;
  const firstPlayer: 'player1' | 'player2' = p1First ? 'player1' : 'player2';
  const firstName = p1First ? state.player1.name : state.player2.name;

  return log({
    ...state,
    player1: p1,
    player2: p2,
    setupStep: undefined,
    activePlayer: firstPlayer,
    phase: 'main', // first player skips draw on turn 1
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

  // Deal 7 cards each, mulligan until each player has at least one basic
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

  // Opponent draws 1 extra card per mulligan
  for (let i = 0; i < p2Mulligans && p1.deck.length > 0; i++) {
    p1 = { ...p1, hand: [...p1.hand, p1.deck[0]], deck: p1.deck.slice(1) };
  }
  for (let i = 0; i < p1Mulligans && p2.deck.length > 0; i++) {
    p2 = { ...p2, hand: [...p2.hand, p2.deck[0]], deck: p2.deck.slice(1) };
  }

  const logs: string[] = ['Both players draw their opening hands.'];
  if (p1Mulligans > 0) logs.push(`${p1Name} mulliganed ${p1Mulligans}× — ${p2Name} draws ${p1Mulligans} extra card(s).`);
  if (p2Mulligans > 0) logs.push(`${p2Name} mulliganed ${p2Mulligans}× — ${p1Name} draws ${p2Mulligans} extra card(s).`);
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

  // Place active (turnPlayed=0 so they can evolve from turn 1 onward)
  const active = inPlayPokemon(activeCard.card, 0);
  let newHand = player.hand.filter(c => c.uid !== activeHandUid);

  // Place bench
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
