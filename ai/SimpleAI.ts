import type { GameState, PlayerState, InPlayPokemon } from '@/engine/GameState';
import {
  playBasicToBench, attachEnergy, attack, endTurn,
  doDrawPhase, playTrainer, retreat, resolvePendingTrainer,
} from '@/engine/GameEngine';
import { canPayCost, isBasicPokemon, isTrainer } from '@/lib/cardUtils';

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(): Promise<void> {
  return delay(800 + Math.random() * 400);
}

function findBestAttack(pokemon: InPlayPokemon): number {
  if (!pokemon.card.attacks.length) return -1;
  let bestIdx = -1;
  let bestDmg = -1;
  for (let i = 0; i < pokemon.card.attacks.length; i++) {
    const atk = pokemon.card.attacks[i];
    if (!canPayCost(atk.cost, pokemon.attachedEnergy)) continue;
    if (atk.damage > bestDmg) { bestDmg = atk.damage; bestIdx = i; }
  }
  return bestIdx;
}

function findBestEnergyTarget(player: PlayerState): string | null {
  // Prioritize active, then bench pokemon that are closest to attacking
  if (player.active) {
    const active = player.active;
    const bestAtk = active.card.attacks.reduce((best, atk) =>
      atk.damage > best.damage ? atk : best, { damage: 0, cost: [] as import('@/engine/GameState').EnergyType[] });
    if (!canPayCost(bestAtk.cost, active.attachedEnergy)) {
      return active.uid;
    }
  }
  // Find bench pokemon that needs energy most
  for (const bench of player.bench) {
    if (!bench) continue;
    const bestAtk = bench.card.attacks[0];
    if (bestAtk && !canPayCost(bestAtk.cost, bench.attachedEnergy)) {
      return bench.uid;
    }
  }
  return player.active?.uid ?? null;
}

export async function runAITurn(
  getState: () => GameState,
  setState: (s: GameState) => void,
): Promise<void> {
  let state = getState();
  if (state.phase === 'gameover') return;

  // Draw phase
  if (state.phase === 'draw') {
    state = doDrawPhase(state);
    setState(state);
    await randomDelay();
  }

  if (state.phase !== 'main' || state.activePlayer !== 'player2') return;

  const ai = state.player2;

  // 1. Fill bench with basics
  for (const card of ai.hand) {
    if (!isBasicPokemon(card.card)) continue;
    const emptySlot = state.player2.bench.findIndex(b => b === null);
    if (emptySlot < 0) break;
    state = playBasicToBench(state, card.uid, emptySlot);
    setState(state);
    await randomDelay();
    if (state.phase === 'gameover') return;
  }

  // 1b. If no active Pokemon, promote from bench
  if (!state.player2.active) {
    const firstBench = state.player2.bench.findIndex(b => b !== null);
    if (firstBench >= 0) {
      // Promote by "retreating" — just directly move bench to active
      const pokemon = state.player2.bench[firstBench]!;
      const newBench = [...state.player2.bench];
      newBench[firstBench] = null;
      state = {
        ...state,
        player2: { ...state.player2, active: pokemon, bench: newBench },
        log: [...state.log, `${state.player2.name} sends out ${pokemon.card.name}!`],
      };
      setState(state);
      await randomDelay();
    }
  }

  // 2. Play draw trainers
  for (const card of [...state.player2.hand]) {
    if (!isTrainer(card.card)) continue;
    const name = card.card.name.toLowerCase();
    if (name.includes('professor oak') || name === 'bill' || name.includes('pokédex')) {
      state = playTrainer(state, card.uid);
      if (state.pendingTrainer) state = resolvePendingTrainer(state, 0);
      setState(state);
      await randomDelay();
      if (state.phase === 'gameover') return;
    }
  }

  // 3. Attach energy
  const energyCard = state.player2.hand.find(c => c.card.supertype === 'Energy');
  if (energyCard && !state.player2.energyPlayedThisTurn) {
    const target = findBestEnergyTarget(state.player2);
    if (target) {
      state = attachEnergy(state, energyCard.uid, target);
      setState(state);
      await randomDelay();
    }
  }

  // 4. Play healing trainers if active is hurt
  for (const card of [...state.player2.hand]) {
    if (!isTrainer(card.card)) continue;
    const name = card.card.name.toLowerCase();
    const active = state.player2.active;
    if (active && active.damageTaken > 20) {
      if (name.includes('potion') || name.includes('full heal')) {
        state = playTrainer(state, card.uid);
        setState(state);
        await randomDelay();
      }
    }
  }

  // 5. Attack
  if (state.player2.active && !state.player2.hasAttackedThisTurn) {
    const bestAtk = findBestAttack(state.player2.active);
    if (bestAtk >= 0) {
      state = attack(state, bestAtk);
      setState(state);
      await randomDelay();
      if (state.phase === 'gameover') return;
    }
  }

  // 6. Consider emergency retreat
  if (state.player2.active && !state.player2.retreatedThisTurn) {
    const active = state.player2.active;
    const hp = active.card.hp ?? 0;
    const remaining = hp - active.damageTaken;
    const opponentBestDmg = state.player1.active?.card.attacks
      .filter(a => canPayCost(a.cost, state.player1.active!.attachedEnergy))
      .reduce((m, a) => Math.max(m, a.damage), 0) ?? 0;
    if (remaining <= opponentBestDmg) {
      const slot = state.player2.bench.findIndex(b => b !== null && (b.card.hp ?? 0) - b.damageTaken > remaining);
      if (slot >= 0 && active.attachedEnergy.length >= active.card.retreatCost.length) {
        state = retreat(state, slot);
        setState(state);
        await randomDelay();
      }
    }
  }

  // End turn
  state = endTurn(state);
  setState(state);
}
