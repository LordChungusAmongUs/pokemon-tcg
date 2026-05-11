'use client';
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile, Deck } from '@/types/database';
import { computeLevel, CREDIT_REWARDS } from '@/lib/progression';

const LOCAL_GUEST_KEY = 'pokemon-tcg-guest';
const LOCAL_GUEST_ID  = 'local-guest';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return url.length > 0 && !url.includes('placeholder');
}

function makeGuestProfile(): Profile {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return {
    id: LOCAL_GUEST_ID,
    display_name: `Guest${num}`,
    username: null,
    avatar_url: null,
    is_guest: true,
    wins: 0,
    losses: 0,
    elo: 1000,
    xp: 0,
    level: 1,
    credits: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function saveLocalGuest(profile: Profile) {
  try { localStorage.setItem(LOCAL_GUEST_KEY, JSON.stringify(profile)); } catch {}
}

function loadLocalGuest(): Profile | null {
  try {
    const raw = localStorage.getItem(LOCAL_GUEST_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch { return null; }
}

function fakeUser(): User {
  return { id: LOCAL_GUEST_ID, is_anonymous: true } as unknown as User;
}

interface AuthStore {
  user: User | null;
  profile: Profile | null;
  decks: Deck[];
  loading: boolean;
  isLocalGuest: boolean;
  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshDecks: () => Promise<void>;
  saveDeck: (name: string, cardIds: string[], deckId?: string) => Promise<Deck | null>;
  deleteDeck: (id: string) => Promise<void>;
  addXP: (amount: number) => Promise<void>;
  addCredits: (amount: number) => Promise<void>;
  awardGameResult: (won: boolean) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  decks: [],
  loading: true,
  isLocalGuest: false,

  init: async () => {
    // Restore local guest session first (works without any Supabase setup)
    const savedGuest = loadLocalGuest();
    if (savedGuest) {
      set({ user: fakeUser(), profile: savedGuest, isLocalGuest: true, loading: false });
      return;
    }

    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      set({ user, loading: false });

      if (user) {
        await get().refreshProfile();
        await get().refreshDecks();
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        const u = session?.user ?? null;
        set({ user: u, isLocalGuest: false });
        if (u) {
          await get().refreshProfile();
          await get().refreshDecks();
        } else {
          set({ profile: null, decks: [] });
        }
      });
    } catch {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured()) {
      alert('Google sign-in requires Supabase to be configured. Add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
      return;
    }
    try { localStorage.removeItem(LOCAL_GUEST_KEY); } catch {}
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  },

  signInAsGuest: async () => {
    // Try Supabase anonymous auth first if configured
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data.user) {
        const num = Math.floor(Math.random() * 9000) + 1000;
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: `Guest${num}`,
          is_guest: true,
          wins: 0, losses: 0, elo: 1000, xp: 0, level: 1, credits: 1000,
        });
        await get().refreshProfile();
        return;
      }
    }

    // Fallback: localStorage-based guest (no Supabase needed)
    const profile = loadLocalGuest() ?? makeGuestProfile();
    saveLocalGuest(profile);
    set({ user: fakeUser(), profile, isLocalGuest: true, loading: false });
  },

  signOut: async () => {
    if (get().isLocalGuest) {
      try { localStorage.removeItem(LOCAL_GUEST_KEY); } catch {}
      set({ user: null, profile: null, decks: [], isLocalGuest: false });
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, decks: [], isLocalGuest: false });
  },

  refreshProfile: async () => {
    const { user, isLocalGuest } = get();
    if (!user || isLocalGuest) return;

    const supabase = createClient();
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Trainer';
    await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      is_guest: user.is_anonymous ?? false,
      wins: 0, losses: 0, elo: 1000, xp: 0, level: 1, credits: 1000,
    }, { onConflict: 'id', ignoreDuplicates: true });

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    set({ profile: data });
  },

  refreshDecks: async () => {
    const { user, isLocalGuest } = get();
    if (!user || isLocalGuest) return;
    const supabase = createClient();
    const { data } = await supabase.from('decks').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    set({ decks: data ?? [] });
  },

  saveDeck: async (name, cardIds, deckId) => {
    const { user, isLocalGuest } = get();
    if (!user) return null;
    if (isLocalGuest) return null; // local guests use localStorage decks (managed in deck-builder)

    const supabase = createClient();
    if (deckId) {
      const { data } = await supabase.from('decks').update({ name, card_ids: cardIds }).eq('id', deckId).select().single();
      await get().refreshDecks();
      return data;
    } else {
      const { data } = await supabase.from('decks').insert({ user_id: user.id, name, card_ids: cardIds }).select().single();
      await get().refreshDecks();
      return data;
    }
  },

  deleteDeck: async (id) => {
    const { isLocalGuest } = get();
    if (isLocalGuest) return;
    const supabase = createClient();
    await supabase.from('decks').delete().eq('id', id);
    await get().refreshDecks();
  },

  addXP: async (amount) => {
    const { user, profile, isLocalGuest } = get();
    if (!user || !profile) return;

    const newXP = (profile.xp ?? 0) + amount;
    const { level } = computeLevel(newXP);
    const leveledUp = level > (profile.level ?? 1);
    const bonusCredits = leveledUp ? CREDIT_REWARDS.levelUp * (level - (profile.level ?? 1)) : 0;
    const newCredits = (profile.credits ?? 0) + bonusCredits;

    if (isLocalGuest) {
      const updated = { ...profile, xp: newXP, level, credits: newCredits };
      saveLocalGuest(updated);
      set({ profile: updated });
      return;
    }

    const supabase = createClient();
    await supabase.from('profiles').update({ xp: newXP, level, credits: newCredits }).eq('id', user.id);
    await get().refreshProfile();
  },

  addCredits: async (amount) => {
    const { user, profile, isLocalGuest } = get();
    if (!user || !profile) return;

    if (isLocalGuest) {
      const updated = { ...profile, credits: (profile.credits ?? 0) + amount };
      saveLocalGuest(updated);
      set({ profile: updated });
      return;
    }

    const supabase = createClient();
    await supabase.from('profiles').update({ credits: (profile.credits ?? 0) + amount }).eq('id', user.id);
    await get().refreshProfile();
  },

  awardGameResult: async (won) => {
    const { addXP, addCredits } = get();
    const xp = won ? 100 : 25;
    const credits = won ? CREDIT_REWARDS.winGame : CREDIT_REWARDS.loseGame;
    await addXP(xp);
    await addCredits(credits);
  },
}));
