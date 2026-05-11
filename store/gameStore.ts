'use client';
import { create } from 'zustand';
import type { GameState, CardData } from '@/engine/GameState';
import {
  initGame, confirmSetup, doDrawPhase, drawCard,
  playBasicToBench, playActiveFromBench,
  attachEnergy, retreat, attack,
  endTurn, playTrainer, evolve,
} from '@/engine/GameEngine';
import { XP_REWARDS } from '@/lib/progression';

function awardXP(amount: number, activePlayer: 'player1' | 'player2') {
  // Only award XP for player1 actions (human player in vs-ai or local-2p)
  if (activePlayer !== 'player1') return;
  // Dynamic import avoids circular dep at module load time
  import('@/store/authStore').then(({ useAuthStore }) => {
    const { addXP, user } = useAuthStore.getState();
    if (user) addXP(amount);
  });
}

interface GameStore {
  game: GameState | null;
  selectedHandUid: string | null;
  startGame: (
    p1Name: string, p1Deck: CardData[],
    p2Name: string, p2Deck: CardData[],
    mode: 'vs-ai' | 'local-2p',
  ) => void;
  resetGame: () => void;
  selectHandCard: (uid: string | null) => void;
  drawPhase: () => void;
  draw: (playerId: 'player1' | 'player2') => void;
  playBasic: (handUid: string, slot: number) => void;
  promoteFromBench: (slot: number) => void;
  attachEnergyAction: (energyUid: string, targetUid: string) => void;
  retreatAction: (benchSlot: number) => void;
  attackAction: (attackIndex: number) => void;
  endTurnAction: () => void;
  playTrainerAction: (handUid: string) => void;
  evolveAction: (handUid: string, targetUid: string) => void;
  confirmSetupAction: (activeUid: string, benchUids: string[]) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  selectedHandUid: null,

  startGame: (p1Name, p1Deck, p2Name, p2Deck, mode) => {
    const game = initGame(p1Name, p1Deck, p2Name, p2Deck, mode);
    set({ game, selectedHandUid: null });
  },

  resetGame: () => set({ game: null, selectedHandUid: null }),

  selectHandCard: (uid) => set({ selectedHandUid: uid }),

  drawPhase: () => set(s => ({ game: s.game ? doDrawPhase(s.game) : null })),

  draw: (playerId) => set(s => ({ game: s.game ? drawCard(s.game, playerId) : null })),

  playBasic: (handUid, slot) => {
    const g = get().game;
    if (g) awardXP(XP_REWARDS.playBasic, g.activePlayer);
    set(s => ({
      game: s.game ? playBasicToBench(s.game, handUid, slot) : null,
      selectedHandUid: null,
    }));
  },

  promoteFromBench: (slot) => set(s => ({
    game: s.game ? playActiveFromBench(s.game, slot) : null,
  })),

  attachEnergyAction: (energyUid, targetUid) => {
    const g = get().game;
    if (g) awardXP(XP_REWARDS.attachEnergy, g.activePlayer);
    set(s => ({
      game: s.game ? attachEnergy(s.game, energyUid, targetUid) : null,
      selectedHandUid: null,
    }));
  },

  retreatAction: (benchSlot) => set(s => ({
    game: s.game ? retreat(s.game, benchSlot) : null,
    selectedHandUid: null,
  })),

  attackAction: (attackIndex) => set(s => ({
    game: s.game ? attack(s.game, attackIndex) : null,
    selectedHandUid: null,
  })),

  endTurnAction: () => set(s => ({
    game: s.game ? endTurn(s.game) : null,
    selectedHandUid: null,
  })),

  playTrainerAction: (handUid) => {
    const g = get().game;
    if (g) awardXP(XP_REWARDS.playTrainer, g.activePlayer);
    set(s => ({
      game: s.game ? playTrainer(s.game, handUid) : null,
      selectedHandUid: null,
    }));
  },

  evolveAction: (handUid, targetUid) => {
    const g = get().game;
    if (g) awardXP(XP_REWARDS.evolve, g.activePlayer);
    set(s => ({
      game: s.game ? evolve(s.game, handUid, targetUid) : null,
      selectedHandUid: null,
    }));
  },

  confirmSetupAction: (activeUid, benchUids) => {
    const { game } = get();
    if (!game || game.phase !== 'setup') return;
    const playerId = game.setupStep === 'p1-setup' ? 'player1' : 'player2';
    set({ game: confirmSetup(game, playerId, activeUid, benchUids) });
  },
}));
