import type {
  GameState, PlayerState, CardData, CardInstance, InPlayPokemon,
  EnergyInstance, EnergyType,
} from './GameState';
import { calculateDamage, applyPoisonDamage, applyBurnDamage, isKnockedOut } from './damage';
import { checkWinConditions, checkDeckOut } from './winConditions';
import { makeUID, makeCardInstance, canPayCost, isPokemon, isBasicPokemon } from '@/lib/cardUtils';
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
  };
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
  if (player.energyPlayedThisTurn) return state;

  const energyCard = player.hand.find(c => c.uid === energyHandUid);
  if (!energyCard || energyCard.card.supertype !== 'Energy') return state;

  const energyType: EnergyType = (energyCard.card.types[0] as EnergyType) || 'Colorless';

  // Double Colorless Energy (base1-96) provides 2 Colorless energy instances
  const isDCE = energyCard.card.id === 'base1-96' ||
    energyCard.card.name.toLowerCase().includes('double colorless');
  const energyInstances: EnergyInstance[] = isDCE
    ? [
        { uid: makeUID(), type: 'Colorless', cardId: energyCard.card.id },
        { uid: makeUID(), type: 'Colorless', cardId: energyCard.card.id },
      ]
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
    energyPlayedThisTurn: true,
  };
  const energyLabel = isDCE ? 'Double Colorless Energy (2×Colorless)' : `${energyType} Energy`;
  return log({ ...state, [active]: updated }, `${player.name} attaches ${energyLabel} to ${targetName}.`);
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

  const energyToDiscard = player.active.attachedEnergy.slice(-cost);
  const remainingEnergy = player.active.attachedEnergy.slice(0, totalEnergy - cost);
  const retreatedPokemon = { ...player.active, attachedEnergy: remainingEnergy };

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

  // Auto-promote from bench if only one Pokemon left
  const updatedKnocked = next[knockedSide];
  const firstBench = updatedKnocked.bench.findIndex(b => b !== null);
  if (firstBench >= 0 && updatedKnocked.bench[firstBench]) {
    const promoted = updatedKnocked.bench[firstBench]!;
    const newBench = [...updatedKnocked.bench];
    newBench[firstBench] = null;
    const allOthers = newBench.every(b => b === null);
    if (allOthers) {
      next = log(
        { ...next, [knockedSide]: { ...updatedKnocked, active: promoted, bench: newBench } },
        `${promoted.card.name} is promoted to Active!`,
      );
    }
  }

  return next;
}

// ─── attack ──────────────────────────────────────────────────────────────────

export function flipCoin(): boolean { return flip(); }

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
        `${attacker.active.card.name} is Confused! Coin flip tails — hits itself for 30!`,
      );
      next = resolveKO(next, active, null);
      return checkWinConditions(next);
    }
  }

  // ── Compute all attack effects ───────────────────────────────────────────
  const attackerBenchCount = attacker.bench.filter(b => b !== null).length;
  const fx = computeAttackEffects(atk, attacker.active, defender.active, attackerBenchCount);

  // ── Calculate damage ─────────────────────────────────────────────────────
  const rawDamage = fx.rawDamage;
  let damage = calculateDamage(attacker.active.card.types, atk, defender.active, rawDamage);
  // PlusPower bonus (added after W/R)
  damage += attacker.attackDamageBonus;
  // Flat bonus from card effects (also after W/R conceptually — bench count, energy count)
  damage += fx.bonusDamage;
  damage = Math.max(0, damage);

  // ── Build log message ────────────────────────────────────────────────────
  let msg = `${attacker.active.card.name} uses ${atk.name}`;
  if (damage > 0) msg += ` for ${damage} damage`;
  if (fx.coinMsg) msg += ` ${fx.coinMsg}`;
  msg += '!';

  // ── Apply damage to defender ─────────────────────────────────────────────
  let newDefenderActive = { ...defender.active, damageTaken: defender.active.damageTaken + damage };

  // ── Status condition on defender ─────────────────────────────────────────
  if (fx.defenderStatus !== false) {
    // cardEffects gave us a resolved status (accounts for coin flips)
    if (fx.defenderStatus !== null) {
      newDefenderActive = { ...newDefenderActive, statusCondition: fx.defenderStatus };
    }
  } else {
    // Fall back to text parsing (for cases not handled by computeAttackEffects)
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

  let next: GameState = log(
    {
      ...state,
      [active]: { ...attacker, hasAttackedThisTurn: true, attackDamageBonus: 0 },
      [opponent]: { ...defender, active: newDefenderActive },
    },
    msg,
  );

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
  if (fx.discardAllAttackerEnergy || fx.discardAttackerEnergy > 0) {
    const p = next[active];
    if (p.active) {
      const count = fx.discardAllAttackerEnergy
        ? p.active.attachedEnergy.length
        : Math.min(fx.discardAttackerEnergy, p.active.attachedEnergy.length);
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
  if (fx.discardOpponentEnergy > 0) {
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
  if (fx.forceOpponentSwitch) {
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
  if (fx.returnDefender) {
    const o = next[opponent];
    if (o.active && o.active.damageTaken < (o.active.card.hp ?? 999)) {
      const returned = makeCardInstance(o.active.card);
      next = log({ ...next, [opponent]: { ...o, active: null, hand: [...o.hand, returned] } },
        `${o.active.card.name} and all attached cards return to ${o.name}'s hand!`);
    }
  }

  // ── Draw cards (Kangaskhan Fetch) ────────────────────────────────────────
  if (fx.drawCards > 0) {
    for (let i = 0; i < fx.drawCards; i++) next = drawCard(next, active);
    next = log(next, `${attacker.name} draws ${fx.drawCards} card(s).`);
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

  let next: GameState = {
    ...state,
    [active]: {
      ...player,
      active: updatedActive,
      energyPlayedThisTurn: false,
      retreatedThisTurn: false,
      hasAttackedThisTurn: false,
      attackDamageBonus: 0, // PlusPower discards at end of turn
    },
    activePlayer: opponent,
    turn: state.turn + 1,
    phase: 'draw',
    log: [...state.log, `--- ${state[opponent].name}'s turn ---`],
  };

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

  // Delegate to comprehensive handler
  return handleTrainerEffect(next, next, active, card, drawCard, inPlayPokemon);
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
    if (pokemon.turnPlayed === state.turn) return pokemon;

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
