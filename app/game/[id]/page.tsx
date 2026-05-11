'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { calcEloChange } from '@/lib/ranking';
import { ALL_CARDS_WITH_ENERGY, makeUID } from '@/lib/cardUtils';
import {
  initGame, doDrawPhase, drawCard, playBasicToBench, playActiveFromBench,
  attachEnergy, retreat, attack, endTurn, playTrainer, evolve,
} from '@/engine/GameEngine';
import type { GameState, CardData } from '@/engine/GameState';
import InPlayCard from '@/components/board/InPlayCard';
import EmptySlot from '@/components/board/EmptySlot';
import CardImage from '@/components/cards/CardImage';
import CardBack from '@/components/cards/CardBack';
import CardDetail from '@/components/cards/CardDetail';
import GameLog from '@/components/board/GameLog';
import { isBasicPokemon, canPayCost } from '@/lib/cardUtils';
import Link from 'next/link';

// Seeded shuffle using mulberry32
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function OnlineGamePage() {
  const { id: gameId } = useParams<{ id: string }>();
  const { user, profile, decks } = useAuthStore();
  const router = useRouter();
  const supabase = createClient();

  const [game, setGame] = useState<GameState | null>(null);
  const [myRole, setMyRole] = useState<'player1' | 'player2' | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [selectedHandUid, setSelectedHandUid] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const [statusMsg, setStatusMsg] = useState('Connecting…');
  const [gameOver, setGameOver] = useState(false);
  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;

  useEffect(() => {
    if (!user) return;
    loadGame();

    const channel = supabase.channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, (payload) => {
        const newState = payload.new.state as GameState | null;
        if (newState) {
          setGame(newState);
          if (newState.phase === 'gameover') handleGameOver(newState);
        }
        // Second player joined
        if (payload.new.player2_id && payload.new.status === 'in_progress' && !game) {
          loadGame();
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user, gameId]);

  async function loadGame() {
    if (!user) return;
    const { data: row } = await supabase.from('games').select('*, p1:player1_id(display_name), p2:player2_id(display_name)').eq('id', gameId).single() as { data: any };
    if (!row) { setStatusMsg('Game not found.'); return; }

    const role = row.player1_id === user.id ? 'player1' : row.player2_id === user.id ? 'player2' : null;
    if (!role) { setStatusMsg('You are not a player in this game.'); return; }
    setMyRole(role);

    const oppName = role === 'player1' ? (row as any).p2?.display_name : (row as any).p1?.display_name;
    setOpponentName(oppName ?? 'Opponent');

    if (row.state) {
      setGame(row.state as GameState);
      return;
    }

    // Both players present — init the game if player1
    if (row.player1_id && row.player2_id && role === 'player1') {
      await initOnlineGame(row);
    } else if (!row.player2_id) {
      setStatusMsg('Waiting for opponent to join…');
    }
  }

  async function initOnlineGame(row: any) {
    const p1DeckRow = decks.find(d => d.id === row.player1_deck_id);
    const p2DeckData = await supabase.from('decks').select('*').eq('id', row.player2_deck_id).single();
    if (!p1DeckRow || !p2DeckData.data) return;

    const p1Cards = seededShuffle(
      p1DeckRow.card_ids.map((id: string) => ALL_CARDS_WITH_ENERGY.find(c => c.id === id)).filter(Boolean) as CardData[],
      row.seed,
    );
    const p2Cards = seededShuffle(
      (p2DeckData.data.card_ids as string[]).map((id: string) => ALL_CARDS_WITH_ENERGY.find(c => c.id === id)).filter(Boolean) as CardData[],
      row.seed + 1,
    );

    const oppName = (await supabase.from('profiles').select('display_name').eq('id', row.player2_id).single()).data?.display_name ?? 'Opponent';
    const initialState = initGame(profile?.display_name ?? 'Player 1', p1Cards, oppName, p2Cards, 'vs-ai');

    await pushState({ ...initialState, mode: 'vs-ai' });
  }

  async function pushState(newState: GameState) {
    setGame(newState);
    if (newState.phase === 'gameover') handleGameOver(newState);
    await supabase.from('games').update({ state: newState as any }).eq('id', gameId);
  }

  async function handleGameOver(state: GameState) {
    if (gameOver || !user || !profile) return;
    setGameOver(true);

    const { data: row } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (!row || row.winner_id) return; // already recorded

    const winnerRole = state.winner;
    const { data: gameRow } = await supabase.from('games').select('player1_id, player2_id').eq('id', gameId).single();
    if (!gameRow) return;

    const myWon = (winnerRole === myRole);
    const opponentId = myRole === 'player1' ? gameRow.player2_id : gameRow.player1_id;

    const { data: oppProfile } = opponentId
      ? await supabase.from('profiles').select('elo, wins, losses').eq('id', opponentId).single()
      : { data: null };

    const myEloChange = calcEloChange(profile.elo, oppProfile?.elo ?? 1000, myWon);

    await supabase.from('profiles').update({
      wins: profile.wins + (myWon ? 1 : 0),
      losses: profile.losses + (myWon ? 0 : 1),
      elo: Math.max(0, profile.elo + myEloChange),
    }).eq('id', user.id);

    await supabase.from('games').update({
      status: 'finished',
      winner_id: (winnerRole === 'player1' ? gameRow.player1_id : gameRow.player2_id) ?? undefined,
    }).eq('id', gameId);
  }

  // ── Action helpers ──────────────────────────────────────────────

  const myPlayer = myRole ? game?.[myRole] : null;
  const oppRole = myRole === 'player1' ? 'player2' : 'player1';
  const isMyTurn = game?.activePlayer === myRole;

  function act(fn: (g: GameState) => GameState) {
    const g = gameRef.current;
    if (!g || !isMyTurn) return;
    pushState(fn(g));
    setSelectedHandUid(null);
  }

  const selectedCard = selectedHandUid ? myPlayer?.hand.find(c => c.uid === selectedHandUid) : null;
  const isEnergySelected = selectedCard?.card.supertype === 'Energy';
  const isBasicSelected = selectedCard ? isBasicPokemon(selectedCard.card) : false;
  const isEvoSelected = selectedCard?.card.evolvesFrom != null;

  if (!game || !myRole) {
    return (
      <div className="h-screen bg-green-950 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <p className="text-xl animate-pulse">{statusMsg}</p>
          <Link href="/lobby" className="text-sm text-gray-400 hover:text-white underline">Back to Lobby</Link>
        </div>
      </div>
    );
  }

  const me = game[myRole];
  const opp = game[oppRole];
  const canRetreat = isMyTurn && !me.retreatedThisTurn && me.active &&
    me.active.attachedEnergy.length >= me.active.card.retreatCost.length &&
    me.bench.some(b => b !== null);

  return (
    <div className="h-screen overflow-hidden bg-green-950 text-white flex flex-col select-none">
      {/* Game over overlay */}
      {game.phase === 'gameover' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-3xl font-bold text-yellow-400">Game Over!</p>
            <p className="text-xl">{game.winner ? game[game.winner].name : '???'} wins!</p>
            <Link href="/lobby" className="block py-3 px-6 bg-yellow-500 rounded-xl font-bold text-black hover:bg-yellow-400">
              Back to Lobby
            </Link>
          </div>
        </div>
      )}

      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* Opponent side (top, flipped) */}
      <div className="flex-none bg-green-900/50 rotate-180 px-2 pt-1 pb-0">
        <div className="rotate-180">
          <div className="flex items-center justify-between mb-1 text-xs text-gray-300">
            <span className="font-bold text-red-300 truncate max-w-28">{opp.name}</span>
            <div className="flex gap-2">
              <span>✋{opp.hand.length}</span>
              <span>🎴{opp.deck.length}</span>
              <span>🏆{opp.prizes.length}</span>
              {!isMyTurn && <span className="text-yellow-400 animate-pulse">thinking…</span>}
            </div>
          </div>
          <div className="flex gap-1 justify-center mb-1">
            {opp.bench.map((poke, i) =>
              poke ? <InPlayCard key={poke.uid} pokemon={poke} small onClick={() => setDetailCard(poke.card)} />
                   : <EmptySlot key={i} small />
            )}
          </div>
          <div className="flex justify-center">
            {opp.active
              ? <InPlayCard pokemon={opp.active} isActive small onClick={() => setDetailCard(opp.active!.card)} />
              : <EmptySlot label="Active" small />
            }
          </div>
        </div>
      </div>

      {/* Divider + log */}
      <div className="flex-none px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="flex-none text-xs text-gray-400 whitespace-nowrap">
            {isMyTurn ? 'Your turn' : `${opp.name}'s turn`}
          </span>
          <GameLog entries={game.log.slice(-12)} className="flex-1" />
          <Link href="/lobby" className="flex-none text-xs text-gray-500 hover:text-white">Quit</Link>
        </div>
      </div>

      {/* My active */}
      <div className="flex-none flex flex-col items-center gap-1 py-1">
        {me.active ? (
          <>
            <InPlayCard pokemon={me.active} isActive small
              onClick={() => {
                if (isEnergySelected && selectedHandUid) act(g => attachEnergy(g, selectedHandUid, me.active!.uid));
                else if (isEvoSelected && selectedHandUid) act(g => evolve(g, selectedHandUid, me.active!.uid));
                else setDetailCard(me.active!.card);
              }} />
            {isMyTurn && !me.hasAttackedThisTurn && (
              <div className="flex gap-1 flex-wrap justify-center">
                {me.active.card.attacks.map((atk, i) => {
                  const can = canPayCost(atk.cost, me.active!.attachedEnergy);
                  return (
                    <button key={i} disabled={!can}
                      onClick={() => act(g => attack(g, i))}
                      className={`text-xs px-2 py-0.5 rounded ${can ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                      {atk.name} {atk.damageStr || (atk.damage ? String(atk.damage) : '')}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : <EmptySlot label="No Active" small />}
      </div>

      {/* My bench */}
      <div className="flex-none bg-green-900/40 px-2 py-1">
        <div className="flex gap-1 justify-center">
          {me.bench.map((poke, i) =>
            poke ? (
              <div key={poke.uid} className="flex flex-col items-center gap-0.5">
                <InPlayCard pokemon={poke} small
                  selected={isEnergySelected || isEvoSelected}
                  onClick={() => {
                    if (isEnergySelected && selectedHandUid) act(g => attachEnergy(g, selectedHandUid, poke.uid));
                    else if (isEvoSelected && selectedHandUid) act(g => evolve(g, selectedHandUid, poke.uid));
                    else if (!me.active) act(g => playActiveFromBench(g, i));
                  }} />
                {isMyTurn && canRetreat && (
                  <button onClick={() => act(g => retreat(g, i))}
                    className="text-[10px] px-1 py-0.5 bg-blue-700 hover:bg-blue-600 rounded leading-tight">
                    Swap
                  </button>
                )}
              </div>
            ) : (
              <EmptySlot key={i} small
                highlight={isBasicSelected && isMyTurn}
                onClick={() => isBasicSelected && selectedHandUid && act(g => playBasicToBench(g, selectedHandUid, i))} />
            )
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex-none flex items-center justify-between px-2 py-1">
        <div className="flex gap-2 items-center text-xs text-gray-300">
          <span className="font-bold text-yellow-300 truncate max-w-20">{me.name}</span>
          <CardBack small count={me.prizes.length} className="w-7 h-9 text-xs" />
          <span>🎴{me.deck.length}</span>
        </div>
        {isMyTurn && game.phase !== 'gameover' && (
          <div className="flex gap-2">
            {game.phase === 'draw' && (
              <button onClick={() => act(doDrawPhase)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
                Draw
              </button>
            )}
            {game.phase === 'main' && (
              <button onClick={() => act(endTurn)}
                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium">
                End Turn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hand */}
      <div className="flex-1 min-h-0 bg-black/40 px-2 pt-1 pb-2 overflow-hidden">
        {selectedCard && (
          <p className="text-[10px] text-yellow-300 mb-0.5">
            {selectedCard.card.name}: {isBasicSelected ? 'tap bench slot' : isEnergySelected ? 'tap a Pokémon' : isEvoSelected ? `tap ${selectedCard.card.evolvesFrom}` : ''}
          </p>
        )}
        <div className="flex gap-1 overflow-x-auto h-full items-end pb-1">
          {me.hand.map(c => (
            <div key={c.uid} className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <CardImage card={c.card} small
                selected={selectedHandUid === c.uid}
                onClick={() => {
                  if (!isMyTurn) return;
                  if (c.card.supertype === 'Trainer') act(g => playTrainer(g, c.uid));
                  else setSelectedHandUid(selectedHandUid === c.uid ? null : c.uid);
                }} />
              <span className="text-[9px] text-gray-400 text-center max-w-16 truncate cursor-pointer hover:text-white"
                onContextMenu={e => { e.preventDefault(); setDetailCard(c.card); }}>
                {c.card.name}
              </span>
            </div>
          ))}
          {me.hand.length === 0 && <span className="text-gray-500 text-sm self-center">Empty hand</span>}
        </div>
      </div>
    </div>
  );
}
