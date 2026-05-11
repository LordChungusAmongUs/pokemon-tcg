'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import InPlayCard from '@/components/board/InPlayCard';
import EmptySlot from '@/components/board/EmptySlot';
import CardImage from '@/components/cards/CardImage';
import CardBack from '@/components/cards/CardBack';
import CardDetail from '@/components/cards/CardDetail';
import GameLog from '@/components/board/GameLog';
import type { CardData } from '@/engine/GameState';
import { isBasicPokemon, canPayCost } from '@/lib/cardUtils';
import { runAITurn } from '@/ai/SimpleAI';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

export default function GamePage() {
  const {
    game, selectedHandUid,
    drawPhase, playBasic, promoteFromBench,
    attachEnergyAction, retreatAction, attackAction,
    endTurnAction, playTrainerAction, evolveAction, selectHandCard,
  } = useGameStore();

  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const { awardGameResult } = useAuthStore();
  const [passModal, setPassModal] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const stateRef = useRef(game);
  stateRef.current = game;

  // Run AI turn
  useEffect(() => {
    if (!game || game.phase === 'gameover') return;
    if (game.mode !== 'vs-ai') return;
    if (game.activePlayer !== 'player2') return;
    if (aiRunning) return;
    setAiRunning(true);
    runAITurn(
      () => stateRef.current!,
      (s) => useGameStore.setState({ game: s }),
    ).finally(() => setAiRunning(false));
  }, [game?.activePlayer, game?.turn, game?.phase]);

  // Award XP/credits when game ends
  useEffect(() => {
    if (!game || game.phase !== 'gameover' || rewarded) return;
    setRewarded(true);
    const won = game.winner === 'player1';
    awardGameResult(won);
  }, [game?.phase]);

  // Pass-and-play modal
  useEffect(() => {
    if (!game || game.mode !== 'local-2p') return;
    if (game.phase === 'draw') setPassModal(true);
  }, [game?.activePlayer, game?.turn]);

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

  const p1 = game.player1;
  const p2 = game.player2;
  const isP1Turn = game.activePlayer === 'player1';
  const activePlayer = isP1Turn ? p1 : p2;
  const selectedCard = selectedHandUid ? activePlayer.hand.find(c => c.uid === selectedHandUid) : null;
  const isEnergySelected = selectedCard?.card.supertype === 'Energy';
  const isBasicSelected = selectedCard ? isBasicPokemon(selectedCard.card) : false;
  const isEvoSelected = selectedCard?.card.evolvesFrom != null;

  function handleBenchClick(player: 'player1' | 'player2', slot: number) {
    if (player !== game!.activePlayer) return;
    const bench = game![player].bench[slot];

    if (isEnergySelected && selectedHandUid && bench) {
      attachEnergyAction(selectedHandUid, bench.uid); return;
    }
    if (isEvoSelected && selectedHandUid && bench) {
      evolveAction(selectedHandUid, bench.uid); return;
    }
    if (isBasicSelected && selectedHandUid && !bench) {
      playBasic(selectedHandUid, slot); return;
    }
    if (!game![player].active) {
      promoteFromBench(slot); return;
    }
  }

  const canRetreat = isP1Turn && !p1.retreatedThisTurn && p1.active &&
    p1.active.attachedEnergy.length >= p1.active.card.retreatCost.length &&
    p1.bench.some(b => b !== null);

  return (
    <div className="h-screen overflow-hidden bg-green-950 text-white flex flex-col select-none">
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
            <Link href="/" className="block w-full py-3 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              Back to Menu
            </Link>
          </div>
        </div>
      )}

      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* ── P2 side (rotated) ─────────────────────────────── */}
      <div className="flex-none bg-green-900/50 rotate-180 px-2 pt-1 pb-0">
        <div className="rotate-180">
          <div className="flex items-center justify-between mb-1 text-xs text-gray-300">
            <span className="font-bold text-yellow-300 truncate max-w-24">{p2.name}</span>
            <div className="flex gap-2">
              <span>✋{p2.hand.length}</span>
              <span>🎴{p2.deck.length}</span>
              <span>🏆{p2.prizes.length}</span>
              {aiRunning && <span className="text-yellow-400 animate-pulse">thinking…</span>}
            </div>
          </div>
          {/* P2 bench */}
          <div className="flex gap-1 justify-center mb-1">
            {p2.bench.map((poke, i) =>
              poke ? <InPlayCard key={poke.uid} pokemon={poke} small onClick={() => setDetailCard(poke.card)} />
                   : <EmptySlot key={i} small />
            )}
          </div>
          {/* P2 active */}
          <div className="flex justify-center">
            {p2.active
              ? <InPlayCard pokemon={p2.active} isActive small onClick={() => setDetailCard(p2.active!.card)} />
              : <EmptySlot label="Active" small />
            }
          </div>
        </div>
      </div>

      {/* ── Divider + log ─────────────────────────────────── */}
      <div className="flex-none px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="flex-none text-xs text-gray-400 whitespace-nowrap">
            {isP1Turn ? `${p1.name}'s turn` : `${p2.name}'s turn`}
          </div>
          <GameLog entries={game.log.slice(-12)} className="flex-1" />
        </div>
      </div>

      {/* ── P1 active ─────────────────────────────────────── */}
      <div className="flex-none flex flex-col items-center gap-1 py-1">
        {p1.active ? (
          <>
            <InPlayCard
              pokemon={p1.active}
              isActive
              small
              onClick={() => {
                if (isEnergySelected && selectedHandUid) attachEnergyAction(selectedHandUid, p1.active!.uid);
                else if (isEvoSelected && selectedHandUid) evolveAction(selectedHandUid, p1.active!.uid);
                else setDetailCard(p1.active!.card);
              }}
            />
            {/* Attacks */}
            {isP1Turn && !p1.hasAttackedThisTurn && (
              <div className="flex gap-1 flex-wrap justify-center">
                {p1.active.card.attacks.map((atk, i) => {
                  const can = canPayCost(atk.cost, p1.active!.attachedEnergy);
                  return (
                    <button key={i} disabled={!can} onClick={() => attackAction(i)}
                      className={`text-xs px-2 py-0.5 rounded ${can ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                      {atk.name} {atk.damageStr || (atk.damage ? `${atk.damage}` : '')}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptySlot label="No Active" small />
        )}
      </div>

      {/* ── P1 bench ──────────────────────────────────────── */}
      <div className="flex-none bg-green-900/40 px-2 py-1">
        <div className="flex gap-1 justify-center">
          {p1.bench.map((poke, i) =>
            poke ? (
              <div key={poke.uid} className="flex flex-col items-center gap-0.5">
                <InPlayCard pokemon={poke} small
                  selected={isEnergySelected || isEvoSelected}
                  onClick={() => handleBenchClick('player1', i)} />
                {isP1Turn && canRetreat && (
                  <button onClick={() => retreatAction(i)}
                    className="text-[10px] px-1 py-0.5 bg-blue-700 hover:bg-blue-600 rounded leading-tight">
                    Swap
                  </button>
                )}
              </div>
            ) : (
              <EmptySlot key={i} small
                highlight={isBasicSelected && isP1Turn}
                onClick={() => isBasicSelected && selectedHandUid && playBasic(selectedHandUid, i)} />
            )
          )}
        </div>
      </div>

      {/* ── Phase controls ────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between px-2 py-1">
        <div className="flex gap-2 items-center text-xs text-gray-300">
          <span className="font-bold text-yellow-300 truncate max-w-20">{p1.name}</span>
          <CardBack small count={p1.prizes.length} className="w-7 h-9 text-xs" />
          <span>🎴{p1.deck.length}</span>
        </div>
        {isP1Turn && game.phase !== 'gameover' && (
          <div className="flex gap-2">
            {game.phase === 'draw' && (
              <button onClick={drawPhase}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
                Draw
              </button>
            )}
            {game.phase === 'main' && (
              <button onClick={endTurnAction}
                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium">
                End Turn
              </button>
            )}
          </div>
        )}
        <Link href="/" className="text-xs text-gray-500 hover:text-white">Quit</Link>
      </div>

      {/* ── P1 Hand ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-black/40 px-2 pt-1 pb-2 overflow-hidden">
        {selectedCard && (
          <p className="text-[10px] text-yellow-300 mb-0.5 leading-tight">
            {selectedCard.card.name}: {
              isBasicSelected ? 'tap empty bench slot' :
              isEnergySelected ? 'tap a Pokémon to attach' :
              isEvoSelected ? `tap ${selectedCard.card.evolvesFrom} to evolve` : ''
            }
          </p>
        )}
        <div className="flex gap-1 overflow-x-auto h-full items-end pb-1">
          {activePlayer.hand.map(c => (
            <div key={c.uid} className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <CardImage
                card={c.card}
                small
                selected={selectedHandUid === c.uid}
                onClick={() => {
                  if (c.card.supertype === 'Trainer' && isP1Turn) playTrainerAction(c.uid);
                  else selectHandCard(selectedHandUid === c.uid ? null : c.uid);
                }}
              />
              <span
                className="text-[9px] text-gray-400 text-center max-w-16 truncate leading-tight cursor-pointer hover:text-white"
                onContextMenu={e => { e.preventDefault(); setDetailCard(c.card); }}
              >
                {c.card.name}
              </span>
            </div>
          ))}
          {activePlayer.hand.length === 0 && (
            <span className="text-gray-500 text-sm self-center">Empty hand</span>
          )}
        </div>
      </div>
    </div>
  );
}
