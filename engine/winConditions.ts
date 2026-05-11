import type { GameState } from './GameState';

export function checkWinConditions(state: GameState): GameState {
  const p1 = state.player1;
  const p2 = state.player2;

  // Prize cards taken
  if (p1.prizes.length === 0) {
    return { ...state, phase: 'gameover', winner: 'player1', log: [...state.log, `${p1.name} took all 6 prizes — they win!`] };
  }
  if (p2.prizes.length === 0) {
    return { ...state, phase: 'gameover', winner: 'player2', log: [...state.log, `${p2.name} took all 6 prizes — they win!`] };
  }

  // No Pokemon left
  const p1NoPokemon = !p1.active && p1.bench.every(s => s === null);
  const p2NoPokemon = !p2.active && p2.bench.every(s => s === null);

  if (p1NoPokemon) {
    return { ...state, phase: 'gameover', winner: 'player2', log: [...state.log, `${p1.name} has no Pokemon left — ${p2.name} wins!`] };
  }
  if (p2NoPokemon) {
    return { ...state, phase: 'gameover', winner: 'player1', log: [...state.log, `${p2.name} has no Pokemon left — ${p1.name} wins!`] };
  }

  return state;
}

export function checkDeckOut(state: GameState): GameState {
  const active = state.activePlayer;
  const player = state[active];

  if (player.deck.length === 0) {
    const opponent = active === 'player1' ? 'player2' : 'player1';
    return {
      ...state,
      phase: 'gameover',
      winner: opponent,
      log: [...state.log, `${player.name}'s deck is empty — ${state[opponent].name} wins!`],
    };
  }
  return state;
}
