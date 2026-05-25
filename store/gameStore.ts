'use client';
import { create } from 'zustand';
import type { GameState, CardData } from '@/engine/GameState';
import {
  initGame, confirmSetup, doDrawPhase, drawCard,
  playBasicToBench, playActiveFromBench,
  attachEnergy, retreat, attack,
  endTurn, playTrainer, evolve, resolvePendingTrainer, resolvePokedex, resolvePokeball,
  useVileplumHeal, useEnergyBurn, useRainDance, useEnergyTrans,
  useDamageSwap, useGengarCurse, useBuzzap,
  resolvePokemonTrader, resolveMaintenance, resolveItemFinder, resolveNightlyGarbageRun,
  resolvePokemonBreeder, resolveRecycle, confirmRetreat, resolveComputerSearch,
} from '@/engine/GameEngine';
import type { EnergyType } from '@/engine/GameState';
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
  resolveTrainerAction: (choice: number) => void;
  evolveAction: (handUid: string, targetUid: string) => void;
  confirmSetupAction: (activeUid: string, benchUids: string[]) => void;
  // Active power actions
  vileplumHealAction: () => void;
  energyBurnAction: () => void;
  rainDanceAction: (energyHandUid: string, targetUid: string) => void;
  energyTransAction: (fromUid: string, energyIdx: number, toUid: string) => void;
  damageSwapAction: (fromUid: string, toUid: string) => void;
  gengarCurseAction: (fromOppUid: string, toOppUid: string) => void;
  buzzapAction: (benchSlot: number, targetUid: string, energyType: EnergyType) => void;
  resolvePokedexAction: (orderedUids: string[]) => void;
  resolvePokeballAction: (chosenUid: string) => void;
  resolvePokemonTraderAction: (uid: string) => void;
  resolveMaintenanceAction: (uid: string) => void;
  resolveItemFinderAction: (uid: string) => void;
  resolveComputerSearchAction: (uid: string) => void;
  resolveNightlyGarbageRunAction: (uid: string | null) => void;
  resolvePokemonBreederAction: (uid: string) => void;
  resolveRecycleAction: (uid: string) => void;
  confirmRetreatAction: (energyUids: string[]) => void;
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

  attackAction: (attackIndex) => set(s => {
    if (!s.game) return { game: null, selectedHandUid: null };
    const afterAttack = attack(s.game, attackIndex);
    const final = afterAttack.phase !== 'gameover' ? endTurn(afterAttack) : afterAttack;
    return { game: final, selectedHandUid: null };
  }),

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

  resolveTrainerAction: (choice) => set(s => ({
    game: s.game ? resolvePendingTrainer(s.game, choice) : null,
  })),

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

  vileplumHealAction: () => set(s => ({ game: s.game ? useVileplumHeal(s.game) : null })),
  energyBurnAction: () => set(s => ({ game: s.game ? useEnergyBurn(s.game) : null })),
  rainDanceAction: (energyHandUid, targetUid) => set(s => ({
    game: s.game ? useRainDance(s.game, energyHandUid, targetUid) : null,
    selectedHandUid: null,
  })),
  energyTransAction: (fromUid, energyIdx, toUid) => set(s => ({
    game: s.game ? useEnergyTrans(s.game, fromUid, energyIdx, toUid) : null,
  })),
  damageSwapAction: (fromUid, toUid) => set(s => ({
    game: s.game ? useDamageSwap(s.game, fromUid, toUid) : null,
  })),
  gengarCurseAction: (fromOppUid, toOppUid) => set(s => ({
    game: s.game ? useGengarCurse(s.game, fromOppUid, toOppUid) : null,
  })),
  buzzapAction: (benchSlot, targetUid, energyType) => set(s => ({
    game: s.game ? useBuzzap(s.game, benchSlot, targetUid, energyType) : null,
  })),
  resolvePokedexAction: (orderedUids) => set(s => ({
    game: s.game ? resolvePokedex(s.game, orderedUids) : null,
  })),
  resolvePokeballAction: (chosenUid) => set(s => ({
    game: s.game ? resolvePokeball(s.game, chosenUid) : null,
  })),
  resolvePokemonTraderAction: (uid) => set(s => ({
    game: s.game ? resolvePokemonTrader(s.game, uid) : null,
  })),
  resolveMaintenanceAction: (uid) => set(s => ({
    game: s.game ? resolveMaintenance(s.game, uid) : null,
  })),
  resolveItemFinderAction: (uid) => set(s => ({
    game: s.game ? resolveItemFinder(s.game, uid) : null,
  })),
  resolveComputerSearchAction: (uid) => set(s => ({
    game: s.game ? resolveComputerSearch(s.game, uid) : null,
  })),
  resolveNightlyGarbageRunAction: (uid) => set(s => ({
    game: s.game ? resolveNightlyGarbageRun(s.game, uid) : null,
  })),
  resolvePokemonBreederAction: (uid) => set(s => ({
    game: s.game ? resolvePokemonBreeder(s.game, uid) : null,
  })),
  resolveRecycleAction: (uid) => set(s => ({
    game: s.game ? resolveRecycle(s.game, uid) : null,
  })),
  confirmRetreatAction: (energyUids) => set(s => ({
    game: s.game ? confirmRetreat(s.game, energyUids) : null,
  })),
}));
