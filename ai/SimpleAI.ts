import type { GameState, PlayerState, InPlayPokemon } from '@/engine/GameState';
import {
  playBasicToBench, attachEnergy, attack, endTurn,
  doDrawPhase, playTrainer, retreat, resolvePendingTrainer, confirmRetreat,
  resolveAttackDiscard, resolveSendOut,
} from '@/engine/GameEngine';
import { canPayCost, isBasicPokemon, isTrainer } from '@/lib/cardUtils';

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function lastLog(state: GameState): string {
  return state.log[state.log.length - 1] ?? 'CPU took an action';
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
  onAction?: (message: string) => Promise<void>,
): Promise<void> {
  const ack = async (state: GameState) => {
    await delay(150); // let UI render first
    if (onAction) await onAction(lastLog(state));
    else await delay(800 + Math.random() * 400);
  };

  let state = getState();
  if (state.phase === 'gameover') return;

  // If AI's active was KO'd and it needs to send out a replacement, do that first
  if (state.pendingSendOut?.side === 'player2') {
    const slot = state.player2.bench.findIndex(b => b !== null);
    if (slot >= 0) {
      state = resolveSendOut(state, slot);
      setState(state);
      await ack(state);
      if (state.phase === 'gameover') return;
    }
  }

  // If it's not the AI's turn (human still needs to send out after AI's attack KO'd them), stop here.
  // The store's resolveSendOutAction will call endTurn once the human picks their active.
  if (state.activePlayer !== 'player2') return;

  // Draw phase
  if (state.phase === 'draw') {
    state = doDrawPhase(state);
    setState(state);
    await ack(state);
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
    await ack(state);
    if (state.phase === 'gameover') return;
  }

  // 1b. If no active Pokemon, promote from bench
  if (!state.player2.active) {
    const firstBench = state.player2.bench.findIndex(b => b !== null);
    if (firstBench >= 0) {
      const pokemon = state.player2.bench[firstBench]!;
      const newBench = [...state.player2.bench];
      newBench[firstBench] = null;
      state = {
        ...state,
        player2: { ...state.player2, active: pokemon, bench: newBench },
        log: [...state.log, `${state.player2.name} sends out ${pokemon.card.name}!`],
      };
      setState(state);
      await ack(state);
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
      await ack(state);
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
      await ack(state);
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
        await ack(state);
      }
    }
  }

  // 5. Attack
  if (state.player2.active && !state.player2.hasAttackedThisTurn) {
    const bestAtk = findBestAttack(state.player2.active);
    if (bestAtk >= 0) {
      state = attack(state, bestAtk);
      // Auto-resolve typed energy discard (e.g. Ember needs 1 Fire Energy confirmed)
      if (state.pendingAttackDiscard) {
        const { requiredType, count } = state.pendingAttackDiscard;
        const matching = state.player2.active?.attachedEnergy
          .filter(e => e.type === requiredType)
          .slice(0, count) ?? [];
        if (matching.length >= count) {
          state = resolveAttackDiscard(state, matching.map(e => e.uid));
        } else {
          state = { ...state, pendingAttackDiscard: undefined }; // can't pay, skip
        }
      }
      // If AI's attack KO'd the opponent's active and opponent has multiple bench,
      // the human player must send out — stop the AI turn here.
      // resolveSendOutAction will call endTurn once the human picks their replacement.
      if (state.pendingSendOut?.side === 'player1') {
        setState(state);
        return;
      }
      setState(state);
      await ack(state);
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
        // If retreat requires energy selection, auto-pick the first N energy
        if (state.pendingRetreat) {
          const uids = active.attachedEnergy.slice(0, state.pendingRetreat.cost).map(e => e.uid);
          state = confirmRetreat(state, uids);
        }
        setState(state);
        await ack(state);
      }
    }
  }

  // End turn
  state = endTurn(state);
  setState(state);
}
