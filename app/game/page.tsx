'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import InPlayCard from '@/components/board/InPlayCard';
import EmptySlot from '@/components/board/EmptySlot';
import CardImage from '@/components/cards/CardImage';
import CardBack from '@/components/cards/CardBack';
import CardDetail from '@/components/cards/CardDetail';
import GameLog from '@/components/board/GameLog';
import Image from 'next/image';
import type { CardData, EnergyType } from '@/engine/GameState';
import { isBasicPokemon, isPokemon, canPayCost, cardImageSrc, ALL_CARDS } from '@/lib/cardUtils';
import { isActivePowerOn } from '@/engine/GameEngine';
import { runAITurn } from '@/ai/SimpleAI';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

const AFK_TIMEOUT = 30;
const AFK_WARNING_AT = 3;

// Discriminated union for the bottom-sheet preview context
type PreviewState =
  | { source: 'hand';       uid: string; card: CardData }
  | { source: 'own-active' }
  | { source: 'own-bench';  slot: number }
  | { source: 'opponent';   card: CardData }
  | { source: 'retreat-pick' };

export default function GamePage() {
  const {
    game, selectedHandUid,
    drawPhase, playBasic, promoteFromBench,
    attachEnergyAction, retreatAction, attackAction,
    endTurnAction, playTrainerAction, resolveTrainerAction, evolveAction, selectHandCard,
    confirmSetupAction,
    vileplumHealAction, energyBurnAction, energyTransAction,
    damageSwapAction, gengarCurseAction, buzzapAction, resolvePokedexAction, resolvePokeballAction,
    resolvePokemonTraderAction, resolveMaintenanceAction, resolveItemFinderAction, resolveNightlyGarbageRunAction,
    resolvePokemonBreederAction, resolveRecycleAction, confirmRetreatAction,
  } = useGameStore();

  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pokedexOrder, setPokedexOrder] = useState<string[]>([]);
  const [retreatEnergySelected, setRetreatEnergySelected] = useState<string[]>([]);
  const [powerModal, setPowerModal] = useState<{
    type: 'energy-trans' | 'damage-swap' | 'gengar-curse' | 'buzzap';
    step: string;
    data: Record<string, string | number>;
  } | null>(null);
  const { awardGameResult, addEncountered, addToCollection, pendingLevelUp, dismissLevelUp } = useAuthStore();
  const [promoWon, setPromoWon] = useState<CardData | null>(null);
  const [passModal, setPassModal] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const [setupActiveUid, setSetupActiveUid] = useState<string | null>(null);
  const [setupBenchUids, setSetupBenchUids] = useState<string[]>([]);
  const [setupPassShown, setSetupPassShown] = useState(false);
  const stateRef = useRef(game);
  stateRef.current = game;

  // ── Acknowledgement system ───────────────────────────────────────────────────
  const [ackPromise, setAckPromise] = useState<{ message: string; resolve: () => void } | null>(null);
  const [ackSecondsLeft, setAckSecondsLeft] = useState(AFK_TIMEOUT);
  const [afkCount, setAfkCount] = useState(0);

  const waitForAck = useCallback((message: string): Promise<void> => {
    return new Promise<void>(resolve => {
      setAckPromise({ message, resolve });
      setAckSecondsLeft(AFK_TIMEOUT);
    });
  }, []);

  const handleAck = useCallback(() => {
    setAckPromise(prev => {
      if (prev) prev.resolve();
      return null;
    });
  }, []);

  useEffect(() => {
    if (!ackPromise) return;
    if (ackSecondsLeft <= 0) {
      setAfkCount(c => c + 1);
      const { resolve } = ackPromise;
      setAckPromise(null);
      resolve();
      return;
    }
    const t = setTimeout(() => setAckSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [ackPromise, ackSecondsLeft]);

  const closePreview = () => setPreview(null);

  useEffect(() => {
    setSetupActiveUid(null);
    setSetupBenchUids([]);
  }, [game?.setupStep]);

  // Reset AFK counter when game starts/resets
  useEffect(() => {
    if (game?.turn === 0) setAfkCount(0);
  }, [game?.turn]);

  useEffect(() => {
    if (!game || game.phase === 'gameover') return;
    if (game.phase === 'setup') return;
    if (game.mode !== 'vs-ai') return;
    if (game.activePlayer !== 'player2') return;
    if (aiRunning) return;
    setAiRunning(true);
    runAITurn(
      () => stateRef.current!,
      (s) => useGameStore.setState({ game: s }),
      waitForAck,
    ).finally(() => setAiRunning(false));
  }, [game?.activePlayer, game?.turn, game?.phase]);

  useEffect(() => {
    if (!game || game.phase !== 'gameover' || rewarded) return;
    setRewarded(true);
    const won = game.winner === 'player1';
    awardGameResult(won, game.mode === 'local-2p' ? 'vs-ai' : 'vs-ai');
    // Award 1 random Wizards Black Star Promo on AI win — #1-18 and #20-28 only
    if (won && game.mode === 'vs-ai') {
      const PROMO_RANGE = new Set([
        ...Array.from({ length: 18 }, (_, i) => `basep-${i + 1}`),
        ...Array.from({ length: 9 },  (_, i) => `basep-${i + 20}`),
      ]);
      const promos = ALL_CARDS.filter(c => c.set === 'Wizards Black Star Promos' && PROMO_RANGE.has(c.id));
      if (promos.length > 0) {
        const pick = promos[Math.floor(Math.random() * promos.length)];
        addToCollection([pick.id]);
        setPromoWon(pick);
      }
    }
    const allCards = [game.player1, game.player2].flatMap(p => [
      ...p.deck, ...p.hand, ...p.discard, ...p.prizes,
      ...(p.active ? [{ card: p.active.card }] : []),
      ...p.bench.filter(Boolean).map(b => ({ card: b!.card })),
    ]);
    const ids = [...new Set(allCards.map(c => c.card.id))].filter(id => !id.startsWith('basic-'));
    addEncountered(ids);
  }, [game?.phase]);

  useEffect(() => {
    if (!game || game.mode !== 'local-2p') return;
    if (game.phase === 'draw') setPassModal(true);
  }, [game?.activePlayer, game?.turn]);

  // Close preview whenever game state advances (e.g. AI moved)
  useEffect(() => { setPreview(null); }, [game?.turn, game?.activePlayer]);

  if (!game) {
    return (
      <div className="h-screen bg-green-950 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <p className="text-2xl">No game in progress.</p>
          <Link href="/" className="px-6 py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // ── Setup phase ──────────────────────────────────────────────────────────────
  if (game.phase === 'setup') {
    const isP2Step = game.setupStep === 'p2-setup';
    const setupPlayerId = isP2Step ? 'player2' : 'player1';
    const setupPlayer = game[setupPlayerId];

    if (isP2Step && game.mode === 'local-2p' && !setupPassShown) {
      return (
        <div className="h-screen bg-green-950 flex items-center justify-center">
          <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4 max-w-sm">
            <p className="text-2xl font-bold text-white">Pass to {game.player2.name}</p>
            <p className="text-gray-400 text-sm">Hand the device to {game.player2.name}.</p>
            <button onClick={() => setSetupPassShown(true)}
              className="w-full py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              I'm {game.player2.name} — Ready!
            </button>
          </div>
        </div>
      );
    }

    const basics = setupPlayer.hand.filter(c => isBasicPokemon(c.card));
    const others = setupPlayer.hand.filter(c => !isBasicPokemon(c.card));

    const handleBasicClick = (uid: string) => {
      if (setupActiveUid === uid) {
        setSetupActiveUid(null);
      } else if (setupBenchUids.includes(uid)) {
        setSetupBenchUids(prev => prev.filter(u => u !== uid));
      } else if (!setupActiveUid) {
        setSetupActiveUid(uid);
      } else {
        setSetupBenchUids(prev => [...prev, uid]);
      }
    };

    const handleConfirm = () => {
      if (!setupActiveUid) return;
      confirmSetupAction(setupActiveUid, setupBenchUids);
      setSetupPassShown(false);
    };

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4 overflow-y-auto">
        <div className="max-w-sm mx-auto space-y-4 pb-8">
          <div className="text-center pt-4">
            <h2 className="text-2xl font-bold text-yellow-400">{setupPlayer.name}'s Setup</h2>
            <p className="text-sm text-gray-400 mt-1">
              {!setupActiveUid
                ? 'Tap a Basic Pokémon to set as your Active.'
                : `Active: ${basics.find(c => c.uid === setupActiveUid)?.card.name}. Tap more basics to bench them.`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {basics.map(c => {
              const isActive = setupActiveUid === c.uid;
              const isBenched = setupBenchUids.includes(c.uid);
              return (
                <div key={c.uid} className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => handleBasicClick(c.uid)}>
                  <div className={`rounded-xl overflow-hidden border-2 transition-all ${
                    isActive ? 'border-yellow-400 ring-2 ring-yellow-400' :
                    isBenched ? 'border-blue-400 ring-2 ring-blue-400' : 'border-transparent'
                  }`}>
                    <CardImage card={c.card} small />
                  </div>
                  <span className={`text-[10px] font-bold ${isActive ? 'text-yellow-400' : isBenched ? 'text-blue-400' : 'text-gray-400'}`}>
                    {isActive ? 'ACTIVE' : isBenched ? 'BENCH' : c.card.name}
                  </span>
                </div>
              );
            })}
          </div>
          {others.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Stays in hand:</p>
              <div className="flex flex-wrap gap-2">
                {others.map(c => (
                  <div key={c.uid} className="opacity-40 flex flex-col items-center">
                    <CardImage card={c.card} small />
                    <span className="text-[9px] text-gray-500 max-w-14 truncate text-center">{c.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={handleConfirm} disabled={!setupActiveUid}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-lg">
            Ready!
          </button>
        </div>
      </div>
    );
  }

  // ── Game state helpers ───────────────────────────────────────────────────────
  const p1 = game.player1;
  const p2 = game.player2;
  const isP1Turn = game.activePlayer === 'player1';
  const activePlayer = isP1Turn ? p1 : p2;
  // The hand shown at the bottom is always P1's (human player) — never reveal AI hand
  const displayedHandPlayer = game.mode === 'vs-ai' ? p1 : activePlayer;
  const selectedCard = selectedHandUid ? displayedHandPlayer.hand.find(c => c.uid === selectedHandUid) : null;
  const isEnergySelected = selectedCard?.card.supertype === 'Energy';
  const isBasicSelected  = selectedCard ? isBasicPokemon(selectedCard.card) : false;
  const isEvoSelected    = selectedCard?.card.evolvesFrom != null;
  const dodrioReduction = p1.bench.filter(b => b !== null && isActivePowerOn(b, 'Retreat Aid', game)).length;
  const effectiveRetreatCost = Math.max(0, (p1.active?.card.retreatCost.length ?? 0) - dodrioReduction);
  const canRetreat = isP1Turn && !p1.retreatedThisTurn && !!p1.active &&
    p1.active.attachedEnergy.length >= effectiveRetreatCost &&
    p1.bench.some(b => b !== null);

  function handleP1BenchClick(slot: number) {
    const bench = p1.bench[slot];
    if (isEnergySelected && selectedHandUid && bench) { attachEnergyAction(selectedHandUid, bench.uid); return; }
    if (isEvoSelected    && selectedHandUid && bench) { evolveAction(selectedHandUid, bench.uid);       return; }
    if (isBasicSelected  && selectedHandUid && !bench){ playBasic(selectedHandUid, slot);               return; }
    if (!p1.active && bench) { promoteFromBench(slot); return; }
    if (bench) setPreview({ source: 'own-bench', slot });
  }

  function handleP1ActiveClick() {
    if (isEnergySelected && selectedHandUid && p1.active) { attachEnergyAction(selectedHandUid, p1.active.uid); return; }
    if (isEvoSelected    && selectedHandUid && p1.active) { evolveAction(selectedHandUid, p1.active.uid);       return; }
    setPreview({ source: 'own-active' });
  }

  // ── Preview sheet data ───────────────────────────────────────────────────────
  let previewCard: CardData | null = null;
  let previewHp: { remaining: number; max: number } | null = null;
  let previewStatus: string | null = null;

  if (preview) {
    if (preview.source === 'hand') {
      previewCard = preview.card;
    } else if (preview.source === 'own-active' && p1.active) {
      previewCard = p1.active.card;
      previewHp = { remaining: Math.max(0, (p1.active.card.hp ?? 0) - p1.active.damageTaken), max: p1.active.card.hp ?? 0 };
      previewStatus = p1.active.statusCondition;
    } else if (preview.source === 'own-bench') {
      const b = p1.bench[preview.slot];
      if (b) {
        previewCard = b.card;
        previewHp = { remaining: Math.max(0, (b.card.hp ?? 0) - b.damageTaken), max: b.card.hp ?? 0 };
        previewStatus = b.statusCondition;
      }
    } else if (preview.source === 'opponent') {
      previewCard = preview.card;
    }
  }

  return (
    <div className="h-dvh bg-green-950 text-white flex flex-col select-none overflow-hidden">

      {/* ── Bottom-sheet preview overlay ─────────────────────── */}
      {preview && (
        <div className="fixed inset-0 bg-black/75 z-40 flex flex-col justify-end"
          onClick={closePreview}>
          <div className="bg-gray-900 rounded-t-2xl max-h-[88vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-0">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>

            {/* ── Retreat picker (no card image, just bench grid) ── */}
            {preview.source === 'retreat-pick' ? (
              <div className="p-4">
                <p className="text-white font-bold text-lg text-center mb-3">Choose Replacement</p>
                <div className="flex flex-wrap justify-center gap-3 mb-4">
                  {p1.bench.map((poke, slot) => poke ? (
                    <button key={slot} className="flex flex-col items-center gap-1"
                      onClick={() => { retreatAction(slot); closePreview(); }}>
                      <div className="relative w-16 h-[90px] rounded-lg overflow-hidden border-2 border-blue-500 hover:border-blue-300">
                        <Image src={cardImageSrc(poke.card)} alt={poke.card.name} fill className="object-cover" unoptimized sizes="64px" />
                      </div>
                      <span className="text-white text-[10px] max-w-[64px] truncate">{poke.card.name}</span>
                      <span className="text-gray-400 text-[9px]">
                        {Math.max(0, (poke.card.hp ?? 0) - poke.damageTaken)}/{poke.card.hp} HP
                      </span>
                    </button>
                  ) : null)}
                </div>
                <button onClick={() => setPreview({ source: 'own-active' })}
                  className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl">
                  Back
                </button>
              </div>
            ) : previewCard ? (
              <>
                {/* Card image */}
                <div className="flex justify-center px-4 pt-3">
                  <div className="relative w-40 h-[224px] rounded-xl overflow-hidden shadow-xl">
                    <Image src={cardImageSrc(previewCard)} alt={previewCard.name} fill className="object-contain" unoptimized sizes="160px" />
                  </div>
                </div>

                {/* Card name + live HP */}
                <div className="text-center px-4 mt-2 mb-1">
                  <p className="text-white font-bold text-lg leading-tight">{previewCard.name}</p>
                  {previewHp && (
                    <p className="text-gray-400 text-sm">
                      {previewHp.remaining}/{previewHp.max} HP
                      {previewStatus && <span className="ml-2 text-yellow-400">· {previewStatus}</span>}
                    </p>
                  )}
                </div>

                {/* ── Action buttons ─────────────────────────────── */}
                <div className="flex flex-col gap-2 p-4 pt-2">

                  {/* HAND card */}
                  {preview.source === 'hand' && (() => {
                    const card = preview.card;
                    const label = card.supertype === 'Energy'
                      ? 'Attach Energy'
                      : card.supertype === 'Trainer'
                      ? 'Play Trainer'
                      : card.evolvesFrom
                      ? `Evolve (${card.evolvesFrom} → ${card.name})`
                      : 'Play to Bench';
                    return (
                      <>
                        <button
                          disabled={!isP1Turn}
                          onClick={() => {
                            if (!isP1Turn) return;
                            if (card.supertype === 'Trainer') {
                              playTrainerAction(preview.uid);
                            } else {
                              selectHandCard(preview.uid);
                            }
                            closePreview();
                          }}
                          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold rounded-xl text-base">
                          {label}
                        </button>
                        <button onClick={closePreview}
                          className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl">
                          Back
                        </button>
                      </>
                    );
                  })()}

                  {/* OWN ACTIVE */}
                  {preview.source === 'own-active' && p1.active && (() => {
                    const poke = p1.active;
                    return (
                      <>
                        {/* Attacks */}
                        {poke.card.attacks.map((atk, i) => {
                          const can = isP1Turn && !p1.hasAttackedThisTurn && canPayCost(atk.cost, poke.attachedEnergy);
                          return (
                            <button key={i} disabled={!can}
                              onClick={() => { attackAction(i); closePreview(); }}
                              className={`w-full py-2.5 rounded-xl font-medium flex justify-between items-center px-4 ${
                                can ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              }`}>
                              <span>⚔️ {atk.name}</span>
                              <span className="font-bold">{atk.damageStr || (atk.damage ? `${atk.damage}` : '—')}</span>
                            </button>
                          );
                        })}

                        {/* Abilities / Pokémon Powers */}
                        {poke.card.abilities.map((ab, i) => {
                          // Passive powers auto-trigger — display only
                          const PASSIVE_POWERS = new Set(['Strikes Back','Invisible Wall','Thick Skinned','Toxic Gas',
                            'Transparency','Prehistoric Power','Hay Fever','Flash Fire','Retreat Aid','Shield Dust','Rain Dance']);
                          if (PASSIVE_POWERS.has(ab.name)) {
                            return (
                              <div key={i} className="w-full p-3 bg-purple-900/40 border border-purple-800/40 rounded-xl">
                                <p className="text-purple-400 font-bold text-xs">{ab.type}: {ab.name} <span className="text-purple-600 font-normal">(auto)</span></p>
                                <p className="text-gray-400 text-xs mt-0.5 leading-snug">{ab.text}</p>
                              </div>
                            );
                          }
                          // Active powers — clickable when usable
                          const canUse = isP1Turn && isActivePowerOn(poke, ab.name, game);
                          const handlePowerClick = () => {
                            if (ab.name === 'Heal') { vileplumHealAction(); closePreview(); }
                            else if (ab.name === 'Energy Burn') { energyBurnAction(); closePreview(); }
                            else if (ab.name === 'Energy Trans') { setPowerModal({ type: 'energy-trans', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Damage Swap') { setPowerModal({ type: 'damage-swap', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Curse') { setPowerModal({ type: 'gengar-curse', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Buzzap') { setPowerModal({ type: 'buzzap', step: 'pick-target', data: { benchSlot: String(p1.bench.findIndex(b => b?.card.abilities.some(a => a.name === 'Buzzap'))) } }); closePreview(); }
                          };
                          return (
                            <button key={i} disabled={!canUse} onClick={handlePowerClick}
                              className={`w-full p-3 text-left rounded-xl border transition-all ${
                                canUse ? 'bg-purple-700 hover:bg-purple-600 border-purple-500' : 'bg-purple-900/40 border-purple-800/40 opacity-50 cursor-not-allowed'
                              }`}>
                              <p className="text-purple-200 font-bold text-sm">{ab.type}: {ab.name}</p>
                              <p className="text-gray-300 text-xs mt-0.5 leading-snug">{ab.text}</p>
                            </button>
                          );
                        })}

                        {/* Retreat */}
                        {isP1Turn && canRetreat && (
                          <button onClick={() => setPreview({ source: 'retreat-pick' })}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium">
                            🔄 Retreat
                          </button>
                        )}

                        <button onClick={closePreview}
                          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm">
                          Back
                        </button>
                      </>
                    );
                  })()}

                  {/* OWN BENCH */}
                  {preview.source === 'own-bench' && (() => {
                    const poke = p1.bench[preview.slot];
                    if (!poke) return null;
                    const benchSlotIdx = preview.slot;
                    return (
                      <>
                        {/* Abilities */}
                        {poke.card.abilities.map((ab, i) => {
                          const PASSIVE_POWERS = new Set(['Strikes Back','Invisible Wall','Thick Skinned','Toxic Gas',
                            'Transparency','Prehistoric Power','Hay Fever','Flash Fire','Retreat Aid','Shield Dust','Rain Dance']);
                          if (PASSIVE_POWERS.has(ab.name)) {
                            return (
                              <div key={i} className="w-full p-3 bg-purple-900/40 border border-purple-800/40 rounded-xl">
                                <p className="text-purple-400 font-bold text-xs">{ab.type}: {ab.name} <span className="text-purple-600 font-normal">(auto)</span></p>
                                <p className="text-gray-400 text-xs mt-0.5 leading-snug">{ab.text}</p>
                              </div>
                            );
                          }
                          const canUse = isP1Turn && isActivePowerOn(poke, ab.name, game);
                          const handleBenchPowerClick = () => {
                            if (ab.name === 'Buzzap') { setPowerModal({ type: 'buzzap', step: 'pick-target', data: { benchSlot: String(benchSlotIdx) } }); closePreview(); }
                            else if (ab.name === 'Energy Trans') { setPowerModal({ type: 'energy-trans', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Damage Swap') { setPowerModal({ type: 'damage-swap', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Curse') { setPowerModal({ type: 'gengar-curse', step: 'pick-from', data: {} }); closePreview(); }
                            else if (ab.name === 'Heal') { vileplumHealAction(); closePreview(); }
                          };
                          return (
                            <button key={i} disabled={!canUse} onClick={handleBenchPowerClick}
                              className={`w-full p-3 text-left rounded-xl border transition-all ${
                                canUse ? 'bg-purple-700 hover:bg-purple-600 border-purple-500' : 'bg-purple-900/40 border-purple-800/40 opacity-50 cursor-not-allowed'
                              }`}>
                              <p className="text-purple-200 font-bold text-sm">{ab.type}: {ab.name}</p>
                              <p className="text-gray-300 text-xs mt-0.5 leading-snug">{ab.text}</p>
                            </button>
                          );
                        })}

                        {/* Promote (no active) */}
                        {isP1Turn && !p1.active && (
                          <button onClick={() => { promoteFromBench(preview.slot); closePreview(); }}
                            className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium">
                            Send Out
                          </button>
                        )}

                        {/* Swap in via retreat */}
                        {isP1Turn && canRetreat && (
                          <button onClick={() => { retreatAction(preview.slot); closePreview(); }}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium">
                            🔄 Swap In
                          </button>
                        )}

                        <button onClick={closePreview}
                          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm">
                          Back
                        </button>
                      </>
                    );
                  })()}

                  {/* OPPONENT card — read-only */}
                  {preview.source === 'opponent' && (
                    <>
                      {/* Show opponent's abilities for info */}
                      {previewCard.abilities.map((ab, i) => (
                        <div key={i} className="w-full p-3 bg-gray-800 border border-gray-700 rounded-xl">
                          <p className="text-gray-300 font-bold text-sm">{ab.type}: {ab.name}</p>
                          <p className="text-gray-400 text-xs mt-0.5 leading-snug">{ab.text}</p>
                        </div>
                      ))}
                      <button onClick={closePreview}
                        className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl">
                        Back
                      </button>
                    </>
                  )}

                </div>
              </>
            ) : (
              /* Fallback — shouldn't happen */
              <div className="p-4">
                <button onClick={closePreview} className="w-full py-2.5 bg-gray-700 text-white rounded-xl">Back</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pass modal */}
      {passModal && game.mode === 'local-2p' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4 max-w-sm">
            <p className="text-2xl font-bold">Pass to {activePlayer.name}</p>
            <p className="text-gray-400">Hand the device to the next player.</p>
            <button onClick={() => { setPassModal(false); drawPhase(); }}
              className="w-full py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              I'm {activePlayer.name} — Ready!
            </button>
          </div>
        </div>
      )}

      {/* Full battle log modal */}
      {logOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-none">
            <p className="text-white font-bold text-base">📋 Battle Log</p>
            <button onClick={() => setLogOpen(false)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
            {game.log.map((entry, i) => (
              <div key={i} className={
                entry.startsWith('---')
                  ? 'text-yellow-400 font-semibold border-t border-gray-700 pt-1 mt-1'
                  : 'text-gray-300'
              }>
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Level-up reward modal — shown above game-over */}
      {pendingLevelUp && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-xs w-full text-center space-y-4">
            <div>
              <p className="text-xs text-yellow-400 uppercase tracking-widest font-bold">Level Up!</p>
              <p className="text-4xl font-black text-white mt-1">Lv {pendingLevelUp.level}</p>
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Reward</p>
              <p className="text-lg font-bold text-yellow-300">{pendingLevelUp.reward.label}</p>
            </div>
            {pendingLevelUp.cardId && (() => {
              const card = ALL_CARDS.find(c => c.id === pendingLevelUp!.cardId);
              return card ? (
                <div className="flex justify-center">
                  <CardImage card={card} />
                </div>
              ) : null;
            })()}
            <button
              onClick={dismissLevelUp}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {game.phase === 'gameover' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-3xl font-bold text-yellow-400">Game Over!</p>
            <p className="text-xl">{game.winner ? game[game.winner].name : '???'} wins!</p>
            {promoWon && (
              <div className="bg-yellow-900/40 rounded-xl px-3 py-3 space-y-2">
                <p className="text-sm text-yellow-300">⭐ Promo earned: <span className="font-bold">{promoWon.name}</span></p>
                <div className="flex justify-center">
                  <CardImage card={promoWon} />
                </div>
              </div>
            )}
            <Link href="/" className="block w-full py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              Back to Menu
            </Link>
          </div>
        </div>
      )}

      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* ── Pending trainer modals ─────────────────────────────── */}
      {/* Energy Removal step 1: choose target Pokémon */}
      {game.pendingTrainer?.type === 'energy-removal' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Energy Removal</h3>
            <p className="text-sm text-gray-400 text-center">Choose a Pokémon to remove energy from:</p>
            <div className="space-y-2">
              {p2.active && p2.active.attachedEnergy.length > 0 && (
                <button onClick={() => resolveTrainerAction(-1)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-red-800 rounded-xl text-sm text-white">
                  <CardImage card={p2.active.card} small />
                  <span className="font-bold">{p2.active.card.name}</span>
                  <span className="text-gray-400 ml-auto">{p2.active.attachedEnergy.length} energy</span>
                </button>
              )}
              {p2.bench.map((b, i) => b && b.attachedEnergy.length > 0 ? (
                <button key={b.uid} onClick={() => resolveTrainerAction(i)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-red-800 rounded-xl text-sm text-white">
                  <CardImage card={b.card} small />
                  <span className="font-bold">{b.card.name}</span>
                  <span className="text-gray-400 ml-auto">{b.attachedEnergy.length} energy</span>
                </button>
              ) : null)}
            </div>
          </div>
        </div>
      )}
      {/* Energy Removal step 2: choose which energy */}
      {game.pendingTrainer?.type === 'energy-removal-energy' && (() => {
        const { targetSlot } = game.pendingTrainer;
        const target = targetSlot === 'active' ? p2.active : p2.bench[targetSlot as number];
        if (!target) return null;
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Energy Removal</h3>
              <p className="text-sm text-gray-400 text-center">Choose energy to remove from {target.card.name}:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {target.attachedEnergy.map((e, i) => (
                  <button key={e.uid} onClick={() => resolveTrainerAction(i)}
                    className="px-3 py-2 bg-gray-700 hover:bg-red-700 rounded-xl text-sm font-bold text-white">
                    {e.type} Energy
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {/* Super Energy Removal step 1: choose target Pokémon */}
      {game.pendingTrainer?.type === 'super-energy-removal' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Super Energy Removal</h3>
            <p className="text-sm text-gray-400 text-center">Choose target (removes 2 energy):</p>
            <div className="space-y-2">
              {p2.active && p2.active.attachedEnergy.length > 0 && (
                <button onClick={() => resolveTrainerAction(-1)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-red-800 rounded-xl text-sm text-white">
                  <CardImage card={p2.active.card} small />
                  <span className="font-bold">{p2.active.card.name}</span>
                  <span className="text-gray-400 ml-auto">{p2.active.attachedEnergy.length} energy</span>
                </button>
              )}
              {p2.bench.map((b, i) => b && b.attachedEnergy.length > 0 ? (
                <button key={b.uid} onClick={() => resolveTrainerAction(i)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-red-800 rounded-xl text-sm text-white">
                  <CardImage card={b.card} small />
                  <span className="font-bold">{b.card.name}</span>
                  <span className="text-gray-400 ml-auto">{b.attachedEnergy.length} energy</span>
                </button>
              ) : null)}
            </div>
          </div>
        </div>
      )}
      {/* Super Energy Removal step 2: confirm (auto-removes 2) */}
      {game.pendingTrainer?.type === 'super-energy-removal-energy' && (() => {
        const { targetSlot } = game.pendingTrainer;
        const target = targetSlot === 'active' ? p2.active : p2.bench[targetSlot as number];
        if (!target) return null;
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Super Energy Removal</h3>
              <p className="text-sm text-gray-400 text-center">Remove up to 2 energy from {target.card.name}?</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {target.attachedEnergy.slice(0, 2).map(e => (
                  <span key={e.uid} className="px-3 py-1 bg-red-900/60 text-red-300 rounded-lg text-sm font-bold">{e.type}</span>
                ))}
              </div>
              <button onClick={() => resolveTrainerAction(0)}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">
                Remove Energy
              </button>
            </div>
          </div>
        );
      })()}
      {game.pendingTrainer?.type === 'gust-of-wind' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Gust of Wind</h3>
            <p className="text-sm text-gray-400 text-center">Choose a Pokémon to pull in from {p2.name}'s bench:</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {p2.bench.map((poke, i) => poke ? (
                <button key={poke.uid} onClick={() => resolveTrainerAction(i)}
                  className="flex flex-col items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-blue-700 rounded-xl">
                  <CardImage card={poke.card} small />
                  <span className="text-xs text-white font-bold">{poke.card.name}</span>
                </button>
              ) : null)}
            </div>
          </div>
        </div>
      )}
      {game.pendingTrainer?.type === 'pokedex' && (() => {
        const { cards, cardUids } = game.pendingTrainer;
        // Initialize order on first render
        const order = pokedexOrder.length === cardUids.length ? pokedexOrder : cardUids;
        const orderedCards = order.map(uid => {
          const idx = cardUids.indexOf(uid);
          return idx >= 0 ? cards[idx] : null;
        }).filter(Boolean) as CardData[];
        const moveCard = (from: number, to: number) => {
          const newOrder = [...order];
          const [moved] = newOrder.splice(from, 1);
          newOrder.splice(to, 0, moved);
          setPokedexOrder(newOrder);
        };
        if (pokedexOrder.length !== cardUids.length) setPokedexOrder(cardUids);
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-2xl space-y-4">
              <h3 className="font-bold text-yellow-400 text-center">Pokédex — Rearrange Top 5 Cards</h3>
              <p className="text-xs text-gray-400 text-center">Position 1 goes on top of your deck.</p>
              <div className="flex gap-3 justify-center">
                {orderedCards.map((card, i) => (
                  <div key={order[i]} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <span className="text-xs font-bold text-yellow-400">{i + 1}</span>
                    <CardImage card={card} small />
                    <span className="text-[10px] text-gray-300 text-center w-full truncate">{card.name}</span>
                    <div className="flex gap-1">
                      <button disabled={i === 0} onClick={() => moveCard(i, i - 1)}
                        className="text-gray-400 hover:text-white disabled:opacity-20 text-sm font-bold px-1.5 py-0.5 bg-gray-700 rounded">◀</button>
                      <button disabled={i === orderedCards.length - 1} onClick={() => moveCard(i, i + 1)}
                        className="text-gray-400 hover:text-white disabled:opacity-20 text-sm font-bold px-1.5 py-0.5 bg-gray-700 rounded">▶</button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { resolvePokedexAction(order); setPokedexOrder([]); }}
                className="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-sm">
                Confirm Order
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Poké Ball — choose a Pokémon from deck ──────────── */}
      {game.pendingTrainer?.type === 'pokeball' && (() => {
        const uids = game.pendingTrainer.pokemonUids;
        const pokemonChoices = uids.map(uid => p1.deck.find(c => c.uid === uid)).filter(Boolean) as import('@/engine/GameState').CardInstance[];
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Poké Ball — Choose a Pokémon</h3>
              <p className="text-xs text-gray-400 text-center">Select any Pokémon from your deck to add to your hand.</p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {pokemonChoices.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolvePokeballAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Pokémon Trader step 1: pick Pokémon from hand ───── */}
      {game.pendingTrainer?.type === 'pokemon-trader' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Pokémon Trader</h3>
            <p className="text-sm text-gray-400 text-center">Choose a Pokémon from your hand to trade away:</p>
            <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
              {p1.hand.filter(c => isPokemon(c.card)).map(ci => (
                <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                  onClick={() => resolvePokemonTraderAction(ci.uid)}>
                  <CardImage card={ci.card} small />
                  <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pokémon Trader step 2: pick Pokémon from deck ───── */}
      {game.pendingTrainer?.type === 'pokemon-trader-deck' && (() => {
        const { handUid } = game.pendingTrainer;
        const handCard = p1.hand.find(c => c.uid === handUid);
        const deckPoke = p1.deck.filter(c => isPokemon(c.card));
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Pokémon Trader</h3>
              <p className="text-sm text-gray-400 text-center">
                Trading away <span className="font-bold text-white">{handCard?.card.name}</span>. Choose a Pokémon from your deck:
              </p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {deckPoke.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolvePokemonTraderAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Maintenance step 1: pick first card ─────────────── */}
      {game.pendingTrainer?.type === 'maintenance' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Maintenance</h3>
            <p className="text-sm text-gray-400 text-center">Choose the <span className="font-bold text-white">first</span> card to shuffle into your deck:</p>
            <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
              {p1.hand.map(ci => (
                <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                  onClick={() => resolveMaintenanceAction(ci.uid)}>
                  <CardImage card={ci.card} small />
                  <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Maintenance step 2: pick second card ────────────── */}
      {game.pendingTrainer?.type === 'maintenance-second' && (() => {
        const { firstUid } = game.pendingTrainer;
        const firstCard = p1.hand.find(c => c.uid === firstUid);
        const remaining = p1.hand.filter(c => c.uid !== firstUid);
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Maintenance</h3>
              <p className="text-sm text-gray-400 text-center">
                First: <span className="font-bold text-white">{firstCard?.card.name}</span>. Choose the <span className="font-bold text-white">second</span> card:
              </p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {remaining.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolveMaintenanceAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Item Finder step 1: pick first card to discard ──── */}
      {game.pendingTrainer?.type === 'item-finder' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Item Finder</h3>
            <p className="text-sm text-gray-400 text-center">Choose the <span className="font-bold text-white">first</span> card to discard:</p>
            <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
              {p1.hand.map(ci => (
                <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                  onClick={() => resolveItemFinderAction(ci.uid)}>
                  <CardImage card={ci.card} small />
                  <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Item Finder step 2: pick second card to discard ─── */}
      {game.pendingTrainer?.type === 'item-finder-second' && (() => {
        const { firstUid } = game.pendingTrainer;
        const firstCard = p1.hand.find(c => c.uid === firstUid);
        const remaining = p1.hand.filter(c => c.uid !== firstUid);
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Item Finder</h3>
              <p className="text-sm text-gray-400 text-center">
                Discarding <span className="font-bold text-white">{firstCard?.card.name}</span>. Choose the <span className="font-bold text-white">second</span> card to discard:
              </p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {remaining.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolveItemFinderAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Item Finder step 3: pick Trainer from discard ───── */}
      {game.pendingTrainer?.type === 'item-finder-trainer' && (() => {
        const trainersInDiscard = p1.discard.filter(c => c.card.supertype === 'Trainer');
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Item Finder</h3>
              <p className="text-sm text-gray-400 text-center">Choose a Trainer to recover from your discard pile:</p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {trainersInDiscard.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolveItemFinderAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Recycle: pick a card from discard to put on top of deck ── */}
      {game.pendingTrainer?.type === 'recycle' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Recycle — Heads!</h3>
            <p className="text-sm text-gray-400 text-center">Choose a card from your discard pile to put on top of your deck:</p>
            <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
              {p1.discard.map(ci => (
                <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                  onClick={() => resolveRecycleAction(ci.uid)}>
                  <CardImage card={ci.card} small />
                  <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pokémon Breeder step 1: pick Stage 2 from hand ──── */}
      {game.pendingTrainer?.type === 'pokemon-breeder' && (() => {
        const stage2s = p1.hand.filter(c => isPokemon(c.card) && c.card.evolvesFrom !== null);
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Pokémon Breeder</h3>
              <p className="text-sm text-gray-400 text-center">Choose a Stage 2 Pokémon from your hand to play directly:</p>
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {stage2s.map(ci => (
                  <div key={ci.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolvePokemonBreederAction(ci.uid)}>
                    <CardImage card={ci.card} small />
                    <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Pokémon Breeder step 2: pick Basic in play ───────── */}
      {game.pendingTrainer?.type === 'pokemon-breeder-target' && (() => {
        const { stage2Uid } = game.pendingTrainer;
        const stage2Card = p1.hand.find(c => c.uid === stage2Uid);
        const allOwn = [p1.active, ...p1.bench].filter(Boolean) as import('@/engine/GameState').InPlayPokemon[];
        const validBasics = allOwn.filter(pk => {
          if (!stage2Card) return false;
          const stage1Name = stage2Card.card.evolvesFrom;
          if (!stage1Name) return false;
          const stage1 = ALL_CARDS.find(c => c.name === stage1Name);
          return stage1?.evolvesFrom === pk.card.name;
        });
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Pokémon Breeder</h3>
              <p className="text-sm text-gray-400 text-center">
                Evolving <span className="font-bold text-white">{stage2Card?.card.name}</span>. Choose the Basic Pokémon to evolve:
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {validBasics.map(pk => (
                  <div key={pk.uid} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80"
                    onClick={() => resolvePokemonBreederAction(pk.uid)}>
                    <CardImage card={pk.card} small />
                    <span className="text-[9px] text-gray-300 text-center">{pk.card.name}</span>
                  </div>
                ))}
                {validBasics.length === 0 && <p className="text-gray-500 text-sm">No valid Basics in play.</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Nightly Garbage Run: pick up to 3 from discard ─── */}
      {game.pendingTrainer?.type === 'nightly-garbage-run' && (() => {
        const { selectedUids } = game.pendingTrainer;
        const eligible = p1.discard.filter(c => isPokemon(c.card) || c.card.supertype === 'Energy');
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-lg w-full space-y-3">
              <h3 className="font-bold text-yellow-400 text-center">Nightly Garbage Run</h3>
              <p className="text-sm text-gray-400 text-center">
                Choose up to 3 Pokémon or Energy cards from your discard to shuffle into your deck.
                <span className="ml-1 font-bold text-white">{selectedUids.length}/3 selected</span>
              </p>
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {eligible.map(ci => {
                  const selected = selectedUids.includes(ci.uid);
                  return (
                    <div key={ci.uid}
                      className={`flex flex-col items-center gap-1 cursor-pointer rounded-xl p-1 transition-all ${selected ? 'ring-2 ring-yellow-400 bg-yellow-900/30' : 'hover:opacity-80'}`}
                      onClick={() => resolveNightlyGarbageRunAction(ci.uid)}>
                      <CardImage card={ci.card} small />
                      <span className="text-[9px] text-gray-300 text-center truncate w-full">{ci.card.name}</span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => resolveNightlyGarbageRunAction(null)}
                className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-xl">
                Confirm ({selectedUids.length} card{selectedUids.length !== 1 ? 's' : ''})
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Retreat energy selection ───────────────────────── */}
      {game.pendingRetreat && (() => {
        const { cost } = game.pendingRetreat;
        const energies = p1.active?.attachedEnergy ?? [];
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-sm w-full space-y-3">
              <h3 className="font-bold text-blue-400 text-center">Retreat — Pay Cost</h3>
              <p className="text-sm text-gray-400 text-center">
                Choose {cost} energ{cost === 1 ? 'y' : 'ies'} to discard:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {energies.map(e => {
                  const isSelected = retreatEnergySelected.includes(e.uid);
                  return (
                    <button key={e.uid}
                      onClick={() => setRetreatEnergySelected(prev =>
                        isSelected ? prev.filter(u => u !== e.uid)
                          : prev.length < cost ? [...prev, e.uid] : prev
                      )}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                        isSelected
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-blue-500'
                      }`}>
                      {e.type} Energy
                    </button>
                  );
                })}
              </div>
              <button
                disabled={retreatEnergySelected.length !== cost}
                onClick={() => { confirmRetreatAction(retreatEnergySelected); setRetreatEnergySelected([]); }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl">
                Confirm ({retreatEnergySelected.length}/{cost})
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Active Power Modals ──────────────────────────────── */}
      {powerModal && (() => {
        const allOwnPoke = [p1.active, ...p1.bench].filter(Boolean) as import('@/engine/GameState').InPlayPokemon[];
        const allOppPoke = [p2.active, ...p2.bench].filter(Boolean) as import('@/engine/GameState').InPlayPokemon[];

        if (powerModal.type === 'energy-trans' && powerModal.step === 'pick-from') {
          const withEnergy = allOwnPoke.filter(p => p.attachedEnergy.length > 0);
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-green-400 text-center">🌿 Energy Trans — Move From</h3>
                <p className="text-sm text-gray-400 text-center">Choose Pokémon to move energy from:</p>
                <div className="space-y-2">
                  {withEnergy.map(p => (
                    <div key={p.uid} className="bg-gray-800 rounded-xl p-2 space-y-1">
                      <p className="text-white text-sm font-bold">{p.card.name}</p>
                      <div className="flex gap-1 flex-wrap">
                        {p.attachedEnergy.map((e, idx) => (
                          <button key={e.uid} onClick={() => setPowerModal({ type: 'energy-trans', step: 'pick-to', data: { fromUid: p.uid, energyIdx: idx } })}
                            className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded-lg text-xs font-bold text-white">
                            {e.type}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {withEnergy.length === 0 && <p className="text-gray-500 text-sm">No Pokémon with energy.</p>}
                </div>
                <button onClick={() => setPowerModal(null)} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Cancel</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'energy-trans' && powerModal.step === 'pick-to') {
          const fromPoke = allOwnPoke.find(p => p.uid === String(powerModal.data.fromUid));
          const energyIdx = Number(powerModal.data.energyIdx);
          const energyType = fromPoke?.attachedEnergy[energyIdx]?.type ?? '';
          const targets = allOwnPoke.filter(p => p.uid !== String(powerModal.data.fromUid));
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-green-400 text-center">🌿 Energy Trans — Move To</h3>
                <p className="text-sm text-gray-400 text-center">Move {energyType} Energy to:</p>
                <div className="space-y-2">
                  {targets.map(p => (
                    <button key={p.uid} onClick={() => { energyTransAction(String(powerModal.data.fromUid), energyIdx, p.uid); setPowerModal(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-800 hover:bg-green-700 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setPowerModal({ type: 'energy-trans', step: 'pick-from', data: {} })} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Back</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'damage-swap' && powerModal.step === 'pick-from') {
          const withDmg = allOwnPoke.filter(p => p.damageTaken >= 10);
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-purple-400 text-center">🔮 Damage Swap — From</h3>
                <p className="text-sm text-gray-400 text-center">Move 1 counter from:</p>
                <div className="space-y-2">
                  {withDmg.map(p => (
                    <button key={p.uid} onClick={() => setPowerModal({ type: 'damage-swap', step: 'pick-to', data: { fromUid: p.uid } })}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-800 hover:bg-purple-700 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                      <span className="text-red-400 ml-auto">{p.damageTaken} dmg</span>
                    </button>
                  ))}
                  {withDmg.length === 0 && <p className="text-gray-500 text-sm">No Pokémon with damage counters.</p>}
                </div>
                <button onClick={() => setPowerModal(null)} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Cancel</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'damage-swap' && powerModal.step === 'pick-to') {
          const targets = allOwnPoke.filter(p => p.uid !== String(powerModal.data.fromUid) && p.damageTaken + 10 < (p.card.hp ?? 0));
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-purple-400 text-center">🔮 Damage Swap — To</h3>
                <p className="text-sm text-gray-400 text-center">Move counter to:</p>
                <div className="space-y-2">
                  {targets.map(p => (
                    <button key={p.uid} onClick={() => { damageSwapAction(String(powerModal.data.fromUid), p.uid); setPowerModal(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-800 hover:bg-purple-700 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                      <span className="text-gray-400 ml-auto">{p.damageTaken} dmg</span>
                    </button>
                  ))}
                  {targets.length === 0 && <p className="text-gray-500 text-sm">No valid targets (would KO).</p>}
                </div>
                <button onClick={() => setPowerModal({ type: 'damage-swap', step: 'pick-from', data: {} })} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Back</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'gengar-curse' && powerModal.step === 'pick-from') {
          const withDmg = allOppPoke.filter(p => p.damageTaken >= 10);
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-gray-400 text-center">👻 Curse — Move From</h3>
                <p className="text-sm text-gray-400 text-center">Move 1 counter from opponent's:</p>
                <div className="space-y-2">
                  {withDmg.map(p => (
                    <button key={p.uid} onClick={() => setPowerModal({ type: 'gengar-curse', step: 'pick-to', data: { fromUid: p.uid } })}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                      <span className="text-red-400 ml-auto">{p.damageTaken} dmg</span>
                    </button>
                  ))}
                  {withDmg.length === 0 && <p className="text-gray-500 text-sm">No opponent Pokémon with damage.</p>}
                </div>
                <button onClick={() => setPowerModal(null)} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Cancel</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'gengar-curse' && powerModal.step === 'pick-to') {
          const targets = allOppPoke.filter(p => p.uid !== String(powerModal.data.fromUid));
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-gray-400 text-center">👻 Curse — Move To</h3>
                <p className="text-sm text-gray-400 text-center">Move counter to opponent's:</p>
                <div className="space-y-2">
                  {targets.map(p => (
                    <button key={p.uid} onClick={() => { gengarCurseAction(String(powerModal.data.fromUid), p.uid); setPowerModal(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setPowerModal({ type: 'gengar-curse', step: 'pick-from', data: {} })} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Back</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'buzzap' && powerModal.step === 'pick-target') {
          const benchSlot = Number(powerModal.data.benchSlot);
          const electrode = p1.bench[benchSlot];
          const targets = allOwnPoke.filter(p => p.uid !== electrode?.uid);
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-yellow-400 text-center">⚡ Buzzap — Attach To</h3>
                <p className="text-sm text-gray-400 text-center">{electrode?.card.name} will be KO'd. Choose target:</p>
                <div className="space-y-2">
                  {targets.map(p => (
                    <button key={p.uid} onClick={() => setPowerModal({ type: 'buzzap', step: 'pick-type', data: { benchSlot: String(benchSlot), targetUid: p.uid } })}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-800 hover:bg-yellow-700 rounded-xl text-sm text-white">
                      <CardImage card={p.card} small />
                      <span className="font-bold">{p.card.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setPowerModal(null)} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Cancel</button>
              </div>
            </div>
          );
        }

        if (powerModal.type === 'buzzap' && powerModal.step === 'pick-type') {
          const energyTypes: EnergyType[] = ['Fire','Water','Grass','Lightning','Psychic','Fighting','Colorless','Darkness','Metal'];
          return (
            <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
                <h3 className="font-bold text-yellow-400 text-center">⚡ Buzzap — Energy Type</h3>
                <p className="text-sm text-gray-400 text-center">Choose 2 energy of which type?</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {energyTypes.map(t => (
                    <button key={t} onClick={() => { buzzapAction(Number(powerModal.data.benchSlot), String(powerModal.data.targetUid), t); setPowerModal(null); }}
                      className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-xl text-sm font-bold text-white">
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => setPowerModal({ type: 'buzzap', step: 'pick-target', data: { benchSlot: powerModal.data.benchSlot } })} className="w-full py-2 bg-gray-700 text-white rounded-xl text-sm">Back</button>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* ── P2 zone ──────────────────────────────────────────── */}
      <div className="flex-none bg-green-900/50 px-2 pt-1 pb-1 border-b border-green-800/40">
        <div className="flex items-center justify-between text-[10px] text-gray-300 mb-1">
          <span className="font-bold text-yellow-300 truncate max-w-24">{p2.name}</span>
          <div className="flex gap-2">
            <span>✋{p2.hand.length}</span>
            <span>🎴{p2.deck.length}</span>
            <span>🏆{p2.prizes.length}</span>
            {aiRunning && <span className="text-yellow-400 animate-pulse">thinking…</span>}
          </div>
        </div>
        {/* P2 bench row */}
        <div className="flex gap-1 justify-center items-end mb-1">
          {p2.bench.map((poke, i) =>
            poke
              ? <InPlayCard key={poke.uid} pokemon={poke} small onClick={() => setPreview({ source: 'opponent', card: poke.card })} />
              : <EmptySlot key={i} small />
          )}
        </div>
        {/* P2 active — pushed toward center battle zone */}
        <div className="flex justify-center">
          {p2.active
            ? <InPlayCard pokemon={p2.active} isActive small onClick={() => setPreview({ source: 'opponent', card: p2.active!.card })} />
            : <EmptySlot label="Active" small />
          }
        </div>
      </div>

      {/* ── Log strip ────────────────────────────────────────── */}
      <div className="flex-none flex items-center gap-2 px-2 py-0.5 border-b border-green-800/40 bg-green-950">
        <div className="flex-none text-[10px] text-gray-400 whitespace-nowrap">
          {isP1Turn ? `${p1.name}'s turn` : `${p2.name}'s turn`}
        </div>
        <button className="flex-1 text-left min-w-0" onClick={() => setLogOpen(true)}>
          <GameLog entries={game.log.slice(-3)} className="text-[10px]" />
        </button>
        <button onClick={() => setLogOpen(true)}
          className="flex-none text-[10px] text-gray-500 hover:text-yellow-300 px-1 py-0.5 rounded whitespace-nowrap">
          📋 Log
        </button>
      </div>

      {/* ── AI action acknowledgement banner ─────────────────── */}
      {ackPromise && game.mode === 'vs-ai' && (
        <div className="flex-none bg-gray-900 border-b-2 border-yellow-500">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-400 leading-none">CPU action</p>
              <p className="text-xs text-white font-medium leading-tight truncate">{ackPromise.message}</p>
            </div>
            {afkCount > 0 && (
              <div className="flex items-center gap-1 flex-none">
                <span className="text-[9px] text-red-400">AFK</span>
                {Array.from({ length: Math.min(afkCount, 5) }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < afkCount ? 'bg-red-500' : 'bg-gray-700'}`} />
                ))}
              </div>
            )}
            <button
              onClick={handleAck}
              className="flex-none px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-xs"
            >
              OK {ackSecondsLeft}s
            </button>
          </div>
          {/* countdown bar */}
          <div className="h-1 bg-gray-800">
            <div
              className={`h-full transition-[width] ease-linear ${ackSecondsLeft <= 3 ? 'bg-red-500' : 'bg-yellow-500'}`}
              style={{ width: `${(ackSecondsLeft / AFK_TIMEOUT) * 100}%`, transitionDuration: '1s' }}
            />
          </div>
          {afkCount >= AFK_WARNING_AT && (
            <div className="px-3 pb-1 text-[10px] text-red-400 font-medium">
              ⚠️ AFK warning — {afkCount} missed acknowledgements
            </div>
          )}
        </div>
      )}

      {/* ── P1 active — battle zone, takes remaining vertical space ── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-green-900/30 py-1">
        {p1.active
          ? <InPlayCard pokemon={p1.active} isActive small onClick={handleP1ActiveClick} />
          : <EmptySlot label="Active" small />
        }
      </div>

      {/* ── P1 bench ─────────────────────────────────────────── */}
      <div className="flex-none flex gap-1 justify-center items-end px-2 py-1 bg-green-900/50 border-t border-green-800/40">
        {p1.bench.map((poke, i) =>
          poke ? (
            <InPlayCard key={poke.uid} pokemon={poke} small
              selected={isEnergySelected || isEvoSelected}
              onClick={() => handleP1BenchClick(i)} />
          ) : (
            <EmptySlot key={i} small
              highlight={isBasicSelected && isP1Turn}
              onClick={() => isBasicSelected && selectedHandUid && playBasic(selectedHandUid, i)} />
          )
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between px-3 py-1.5 bg-green-900/60 border-t border-green-800/60">
        <div className="flex gap-2 items-center text-xs text-gray-300">
          <span className="font-bold text-yellow-300 truncate max-w-20">{p1.name}</span>
          <CardBack small count={p1.prizes.length} className="w-6 h-8 text-xs" />
          <span>🎴{p1.deck.length}</span>
        </div>
        {isP1Turn && game.phase !== 'gameover' && (
          <div className="flex gap-2">
            {game.phase === 'draw' && (
              <button onClick={drawPhase}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
                Draw
              </button>
            )}
            {(game.phase === 'main' || game.phase === 'attack') && (
              <button onClick={endTurnAction}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium">
                End Turn
              </button>
            )}
          </div>
        )}
        <Link href="/" className="text-xs text-gray-500 hover:text-white">Quit</Link>
      </div>

      {/* ── Hand ─────────────────────────────────────────────── */}
      <div className="flex-none bg-black/50 px-2 pt-1 pb-safe-2" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {selectedCard && (
          <p className="text-[10px] text-yellow-300 mb-0.5 leading-tight">
            {selectedCard.card.name}: {
              isBasicSelected ? 'tap empty bench slot' :
              isEnergySelected ? 'tap a Pokémon to attach' :
              isEvoSelected ? `tap ${selectedCard.card.evolvesFrom} to evolve` : ''
            }
          </p>
        )}
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {displayedHandPlayer.hand.map(c => (
            <div key={c.uid} className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <CardImage
                card={c.card}
                small
                selected={selectedHandUid === c.uid}
                onClick={() => isP1Turn ? setPreview({ source: 'hand', uid: c.uid, card: c.card }) : undefined}
              />
              <span
                className="text-[9px] text-gray-400 text-center max-w-14 truncate leading-tight cursor-pointer hover:text-white"
                onContextMenu={e => { e.preventDefault(); setDetailCard(c.card); }}
              >
                {c.card.name}
              </span>
            </div>
          ))}
          {displayedHandPlayer.hand.length === 0 && (
            <span className="text-gray-500 text-sm py-2">Empty hand</span>
          )}
        </div>
      </div>

    </div>
  );
}
