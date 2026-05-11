'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getRank } from '@/lib/ranking';
import type { LobbyMessage, Profile } from '@/types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

export default function LobbyPage() {
  const { user, profile, decks, loading, signOut, refreshDecks } = useAuthStore();
  const router = useRouter();
  const supabase = createClient();

  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [openGames, setOpenGames] = useState<any[]>([]);
  const [matchmakingStatus, setMatchmakingStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [onlineCount, setOnlineCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    refreshDecks();
    loadLeaderboard();
    loadMessages();
    loadOpenGames();
    setupRealtime();
    return () => { channelRef.current?.unsubscribe(); };
  }, [user]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id);
  }, [decks]);

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('profiles').select('*').order('elo', { ascending: false }).limit(10);
    setLeaderboard(data ?? []);
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('lobby_messages').select('*').order('created_at', { ascending: true }).limit(50);
    setMessages(data ?? []);
  }

  async function loadOpenGames() {
    const { data } = await supabase
      .from('games').select('*, p1:player1_id(display_name, elo)').eq('status', 'waiting').limit(10);
    setOpenGames(data ?? []);
  }

  function setupRealtime() {
    if (!user) return;
    const channel = supabase.channel('lobby', {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lobby_messages' },
        (payload) => setMessages(prev => [...prev, payload.new as LobbyMessage]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' },
        () => loadOpenGames())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchmaking_queue' },
        async (payload) => {
          if (payload.new.user_id === user.id && payload.new.status === 'matched') {
            setMatchmakingStatus('found');
            setTimeout(() => router.push(`/game/${payload.new.matched_game_id}`), 1000);
          }
        })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, display_name: profile?.display_name });
        }
      });

    channelRef.current = channel;
  }

  async function sendMessage() {
    if (!newMsg.trim() || !user || !profile) return;
    await supabase.from('lobby_messages').insert({
      user_id: user.id,
      display_name: profile.display_name,
      message: newMsg.trim(),
    });
    setNewMsg('');
  }

  async function startMatchmaking() {
    if (!user || !selectedDeckId) return;
    setMatchmakingStatus('searching');

    // Remove any stale queue entry
    await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);

    // Check if someone is already waiting
    const { data: waiting } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('status', 'waiting')
      .neq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (waiting) {
      // Match found — create a game
      const seed = Math.floor(Math.random() * 2147483647);
      const { data: game } = await supabase.from('games').insert({
        player1_id: waiting.user_id,
        player1_deck_id: waiting.deck_id,
        seed,
      }).select().single();

      if (game) {
        // Add self as player2
        await supabase.from('games').update({
          player2_id: user.id,
          player2_deck_id: selectedDeckId,
          status: 'in_progress',
        }).eq('id', game.id);

        // Mark both queue entries as matched
        await supabase.from('matchmaking_queue').update({ status: 'matched', matched_game_id: game.id }).eq('id', waiting.id);
        // Insert own entry as matched immediately
        await supabase.from('matchmaking_queue').insert({ user_id: user.id, deck_id: selectedDeckId });
        await supabase.from('matchmaking_queue').update({ status: 'matched', matched_game_id: game.id }).eq('user_id', user.id);

        setMatchmakingStatus('found');
        setTimeout(() => router.push(`/game/${game.id}`), 800);
      }
    } else {
      // Enter queue and wait
      await supabase.from('matchmaking_queue').insert({ user_id: user.id, deck_id: selectedDeckId });
    }
  }

  async function cancelMatchmaking() {
    if (!user) return;
    await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
    setMatchmakingStatus('idle');
  }

  async function joinGame(gameId: string) {
    if (!user || !selectedDeckId) return;
    const { error } = await supabase.from('games').update({
      player2_id: user.id,
      player2_deck_id: selectedDeckId,
      status: 'in_progress',
    }).eq('id', gameId).eq('status', 'waiting');

    if (!error) router.push(`/game/${gameId}`);
  }

  async function createGame() {
    if (!user || !selectedDeckId) return;
    const seed = Math.floor(Math.random() * 2147483647);
    const { data } = await supabase.from('games').insert({
      player1_id: user.id,
      player1_deck_id: selectedDeckId,
      seed,
    }).select().single();
    if (data) router.push(`/game/${data.id}`);
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading…</div>;
  if (!user || !profile) return null;

  const rank = getRank(profile.elo);

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-black"><span className="text-yellow-400">Pokemon</span> TCG</Link>
          <span className="text-xs text-green-400">● {onlineCount} online</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="font-semibold">{profile.display_name}</div>
            <div className={`text-xs ${rank.color}`}>{rank.emoji} {rank.name} · {profile.elo} ELO · {profile.wins}W/{profile.losses}L</div>
          </div>
          <Link href="/deck-builder" className="text-xs text-gray-400 hover:text-white">Deck Builder</Link>
          <button onClick={signOut} className="text-xs text-gray-500 hover:text-white">Sign Out</button>
        </div>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">

        {/* Left: Leaderboard */}
        <div className="w-48 flex-none bg-gray-900 border-r border-gray-800 p-3 overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Leaderboard</h3>
          <div className="space-y-1">
            {leaderboard.map((p, i) => {
              const r = getRank(p.elo);
              return (
                <div key={p.id} className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 w-4 text-right">{i + 1}</span>
                  <span className={r.color}>{r.emoji}</span>
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="text-gray-400">{p.elo}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle: Chat */}
        <div className="flex-1 flex flex-col">
          <div className="flex-none px-3 pt-2 pb-1 text-xs text-gray-400 font-semibold uppercase tracking-wide">
            Lobby Chat
          </div>
          <div ref={chatRef} className="flex-1 overflow-y-auto px-3 space-y-1">
            {messages.map(m => (
              <div key={m.id} className="text-sm">
                <span className="font-semibold text-yellow-300">{m.display_name}</span>
                <span className="text-gray-400 text-xs ml-1">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-gray-200 ml-2">{m.message}</span>
              </div>
            ))}
            {messages.length === 0 && <p className="text-gray-600 text-sm">No messages yet. Say hello!</p>}
          </div>
          <div className="flex-none flex gap-2 p-3 border-t border-gray-800">
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Chat…"
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-500"
            />
            <button onClick={sendMessage} className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg text-sm hover:bg-yellow-400">
              Send
            </button>
          </div>
        </div>

        {/* Right: Games + Matchmaking */}
        <div className="w-64 flex-none bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden">
          {/* Deck selector */}
          <div className="flex-none p-3 border-b border-gray-800 space-y-2">
            <label className="text-xs text-gray-400">Your deck</label>
            {decks.length === 0 ? (
              <p className="text-xs text-yellow-400">
                <Link href="/deck-builder" className="underline">Build a deck first</Link>
              </p>
            ) : (
              <select value={selectedDeckId} onChange={e => setSelectedDeckId(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-2 py-1.5 text-sm">
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>

          {/* Matchmaking */}
          <div className="flex-none p-3 border-b border-gray-800 space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Quick Match</h3>
            {matchmakingStatus === 'idle' && (
              <button onClick={startMatchmaking} disabled={!selectedDeckId}
                className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm">
                Find Match
              </button>
            )}
            {matchmakingStatus === 'searching' && (
              <div className="space-y-2">
                <div className="text-center text-sm text-yellow-300 animate-pulse">Searching for opponent…</div>
                <button onClick={cancelMatchmaking} className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            )}
            {matchmakingStatus === 'found' && (
              <div className="text-center text-green-400 font-bold animate-bounce">Match found!</div>
            )}
          </div>

          {/* Open games */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Open Games</h3>
              <button onClick={createGame} disabled={!selectedDeckId}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-white">
                + Create
              </button>
            </div>
            {openGames.length === 0 && <p className="text-xs text-gray-600">No open games. Create one!</p>}
            {openGames.map(g => (
              <div key={g.id} className="bg-gray-800 rounded-lg p-2 space-y-1">
                <div className="text-sm font-medium">{g.p1?.display_name ?? 'Trainer'}</div>
                <div className="text-xs text-gray-400">{getRank(g.p1?.elo ?? 1000).emoji} {getRank(g.p1?.elo ?? 1000).name}</div>
                <button
                  onClick={() => joinGame(g.id)}
                  disabled={!selectedDeckId || g.player1_id === user.id}
                  className="w-full py-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black text-xs font-bold rounded"
                >
                  {g.player1_id === user.id ? 'Waiting…' : 'Join'}
                </button>
              </div>
            ))}
          </div>

          {/* Play vs AI */}
          <div className="flex-none p-3 border-t border-gray-800">
            <Link href="/" className="block w-full py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold rounded-lg text-center">
              Play vs AI
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
