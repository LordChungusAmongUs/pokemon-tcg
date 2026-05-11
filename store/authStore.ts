'use client';
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile, Deck } from '@/types/database';
import { computeLevel, CREDIT_REWARDS } from '@/lib/progression';

interface AuthStore {
  user: User | null;
  profile: Profile | null;
  decks: Deck[];
  loading: boolean;
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

  init: async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    set({ user, loading: false });

    if (user) {
      await get().refreshProfile();
      await get().refreshDecks();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      set({ user: u });
      if (u) {
        await get().refreshProfile();
        await get().refreshDecks();
      } else {
        set({ profile: null, decks: [] });
      }
    });
  },

  signInWithGoogle: async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  },

  signInAsGuest: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return;

    const guestNum = Math.floor(Math.random() * 9000) + 1000;
    const displayName = `Guest${guestNum}`;

    await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: displayName,
      is_guest: true,
      wins: 0,
      losses: 0,
      elo: 1000,
    });

    await get().refreshProfile();
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, decks: [] });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;

    const supabase = createClient();

    // Upsert profile on first login
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Trainer';
    await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      is_guest: user.is_anonymous ?? false,
      wins: 0,
      losses: 0,
      elo: 1000,
    }, { onConflict: 'id', ignoreDuplicates: true });

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    set({ profile: data });
  },

  refreshDecks: async () => {
    const { user } = get();
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase.from('decks').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    set({ decks: data ?? [] });
  },

  saveDeck: async (name, cardIds, deckId) => {
    const { user } = get();
    if (!user) return null;
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
    const supabase = createClient();
    await supabase.from('decks').delete().eq('id', id);
    await get().refreshDecks();
  },

  addXP: async (amount) => {
    const { user, profile } = get();
    if (!user || !profile) return;
    const newXP = (profile.xp ?? 0) + amount;
    const { level } = computeLevel(newXP);
    const leveledUp = level > (profile.level ?? 1);
    const bonusCredits = leveledUp ? CREDIT_REWARDS.levelUp * (level - (profile.level ?? 1)) : 0;
    const newCredits = (profile.credits ?? 0) + bonusCredits;
    const supabase = createClient();
    await supabase.from('profiles').update({ xp: newXP, level, credits: newCredits }).eq('id', user.id);
    await get().refreshProfile();
  },

  addCredits: async (amount) => {
    const { user, profile } = get();
    if (!user || !profile) return;
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
