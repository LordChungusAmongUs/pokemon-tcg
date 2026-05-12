'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import InPlayCard from '@/components/board/InPlayCard';
import EmptySlot from '@/components/board/EmptySlot';
import CardImage from '@/components/cards/CardImage';
import CardBack from '@/components/cards/CardBack';
import CardDetail from '@/components/cards/CardDetail';
import GameLog from '@/components/board/GameLog';
import Image from 'next/image';
import type { CardData } from '@/engine/GameState';
import { isBasicPokemon, canPayCost, cardImageSrc, ALL_CARDS } from '@/lib/cardUtils';
import { runAITurn } from '@/ai/SimpleAI';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

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
  } = useGameStore();

  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const { awardGameResult, addEncountered, addToCollection } = useAuthStore();
  const [promoWon, setPromoWon] = useState<string | null>(null);
  const [passModal, setPassModal] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const [setupActiveUid, setSetupActiveUid] = useState<string | null>(null);
  const [setupBenchUids, setSetupBenchUids] = useState<string[]>([]);
  const [setupPassShown, setSetupPassShown] = useState(false);
  const stateRef = useRef(game);
  stateRef.current = game;

  const closePreview = () => setPreview(null);

  useEffect(() => {
    setSetupActiveUid(null);
    setSetupBenchUids([]);
  }, [game?.setupStep]);

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
    ).finally(() => setAiRunning(false));
  }, [game?.activePlayer, game?.turn, game?.phase]);

  useEffect(() => {
    if (!game || game.phase !== 'gameover' || rewarded) return;
    setRewarded(true);
    const won = game.winner === 'player1';
    awardGameResult(won, game.mode === 'pvp' ? 'pvp' : 'vs-ai');
    // Award 1 random Wizards Black Star Promo on AI win
    if (won && game.mode === 'vs-ai') {
      const promos = ALL_CARDS.filter(c => c.set === 'Wizards Black Star Promos');
      if (promos.length > 0) {
        const pick = promos[Math.floor(Math.random() * promos.length)];
        addToCollection([pick.id]);
        setPromoWon(pick.name);
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
  const selectedCard = selectedHandUid ? activePlayer.hand.find(c => c.uid === selectedHandUid) : null;
  const isEnergySelected = selectedCard?.card.supertype === 'Energy';
  const isBasicSelected  = selectedCard ? isBasicPokemon(selectedCard.card) : false;
  const isEvoSelected    = selectedCard?.card.evolvesFrom != null;
  const canRetreat = isP1Turn && !p1.retreatedThisTurn && !!p1.active &&
    p1.active.attachedEnergy.length >= p1.active.card.retreatCost.length &&
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
                        {poke.card.abilities.map((ab, i) => (
                          <div key={i} className="w-full p-3 bg-purple-900/60 border border-purple-700/60 rounded-xl">
                            <p className="text-purple-300 font-bold text-sm">{ab.type}: {ab.name}</p>
                            <p className="text-gray-300 text-xs mt-0.5 leading-snug">{ab.text}</p>
                          </div>
                        ))}

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
                    return (
                      <>
                        {/* Abilities */}
                        {poke.card.abilities.map((ab, i) => (
                          <div key={i} className="w-full p-3 bg-purple-900/60 border border-purple-700/60 rounded-xl">
                            <p className="text-purple-300 font-bold text-sm">{ab.type}: {ab.name}</p>
                            <p className="text-gray-300 text-xs mt-0.5 leading-snug">{ab.text}</p>
                          </div>
                        ))}

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

      {/* Game over */}
      {game.phase === 'gameover' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-3xl font-bold text-yellow-400">Game Over!</p>
            <p className="text-xl">{game.winner ? game[game.winner].name : '???'} wins!</p>
            {promoWon && (
              <p className="text-sm text-yellow-300 bg-yellow-900/40 rounded-xl px-3 py-2">
                ⭐ Promo earned: <span className="font-bold">{promoWon}</span>
              </p>
            )}
            <Link href="/" className="block w-full py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              Back to Menu
            </Link>
          </div>
        </div>
      )}

      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* ── Pending trainer modals ─────────────────────────────── */}
      {game.pendingTrainer?.type === 'energy-removal' && p2.active && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Energy Removal</h3>
            <p className="text-sm text-gray-400 text-center">Choose an energy to remove from {p2.active.card.name}:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {p2.active.attachedEnergy.map((e, i) => (
                <button key={e.uid} onClick={() => resolveTrainerAction(i)}
                  className="px-3 py-2 bg-gray-700 hover:bg-red-700 rounded-xl text-sm font-bold text-white">
                  {e.type} Energy
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
      {game.pendingTrainer?.type === 'pokedex' && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-yellow-400 text-center">Pokédex — Top 5 Cards</h3>
            <div className="flex gap-2 justify-center flex-wrap">
              {game.pendingTrainer.cards.map((card, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <CardImage card={card} small />
                  <span className="text-[9px] text-gray-400 text-center max-w-14 truncate">{card.name}</span>
                </div>
              ))}
            </div>
            <button onClick={() => resolveTrainerAction(0)}
              className="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-sm">
              Done
            </button>
          </div>
        </div>
      )}

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
        <div className="flex items-end gap-2 justify-center">
          {p2.active
            ? <InPlayCard pokemon={p2.active} isActive small onClick={() => setPreview({ source: 'opponent', card: p2.active!.card })} />
            : <EmptySlot label="Active" small />
          }
          <div className="w-px self-stretch bg-green-800/60 mx-0.5" />
          {p2.bench.map((poke, i) =>
            poke
              ? <InPlayCard key={poke.uid} pokemon={poke} small onClick={() => setPreview({ source: 'opponent', card: poke.card })} />
              : <EmptySlot key={i} small />
          )}
        </div>
      </div>

      {/* ── Log strip ────────────────────────────────────────── */}
      <div className="flex-none flex items-center gap-2 px-2 py-0.5 border-b border-green-800/40 bg-green-950">
        <div className="flex-none text-[10px] text-gray-400 whitespace-nowrap">
          {isP1Turn ? `${p1.name}'s turn` : `${p2.name}'s turn`}
        </div>
        <GameLog entries={game.log.slice(-3)} className="flex-1 text-[10px]" />
      </div>

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
          {activePlayer.hand.map(c => (
            <div key={c.uid} className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <CardImage
                card={c.card}
                small
                selected={selectedHandUid === c.uid}
                onClick={() => setPreview({ source: 'hand', uid: c.uid, card: c.card })}
              />
              <span
                className="text-[9px] text-gray-400 text-center max-w-14 truncate leading-tight cursor-pointer hover:text-white"
                onContextMenu={e => { e.preventDefault(); setDetailCard(c.card); }}
              >
                {c.card.name}
              </span>
            </div>
          ))}
          {activePlayer.hand.length === 0 && (
            <span className="text-gray-500 text-sm py-2">Empty hand</span>
          )}
        </div>
      </div>

    </div>
  );
}
