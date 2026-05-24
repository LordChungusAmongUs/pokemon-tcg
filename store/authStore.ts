'use client';
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile, Deck } from '@/types/database';
import { computeLevel, CREDIT_REWARDS, STARTING_CREDITS, VOUCHER_THRESHOLD, SET_PROGRESSION, getLevelUpReward, type LevelReward } from '@/lib/progression';
import { generatePackCards } from '@/lib/progression';
import { setCompletionPct, ALL_CARDS, isSetUnlocked } from '@/lib/cardUtils';
import { STARTER_DECKS } from '@/lib/starterDecks';

const LOCAL_GUEST_KEY = 'pokemon-tcg-guest';
const LOCAL_GUEST_ID  = 'local-guest';

function collectionKey(userId: string) {
  return `pokemon-tcg-collection-${userId}`;
}
function loadCollectionFromStorage(userId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(collectionKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCollectionToStorage(userId: string, c: Record<string, number>) {
  try { localStorage.setItem(collectionKey(userId), JSON.stringify(c)); } catch {}
}

function encounteredKey(userId: string) {
  return `pokemon-tcg-encountered-${userId}`;
}
function loadEncounteredFromStorage(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(encounteredKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveEncounteredToStorage(userId: string, e: Set<string>) {
  try { localStorage.setItem(encounteredKey(userId), JSON.stringify([...e])); } catch {}
}

function milestonesKey(userId: string) { return `pokemon-tcg-milestones-${userId}`; }
function loadMilestones(userId: string): Set<string> {
  try { const r = localStorage.getItem(milestonesKey(userId)); return r ? new Set(JSON.parse(r)) : new Set(); } catch { return new Set(); }
}
function saveMilestones(userId: string, m: Set<string>) {
  try { localStorage.setItem(milestonesKey(userId), JSON.stringify([...m])); } catch {}
}

function vouchersKey(userId: string) { return `pokemon-tcg-vouchers-${userId}`; }
function loadVouchers(userId: string): string[] {
  try { const r = localStorage.getItem(vouchersKey(userId)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveVouchers(userId: string, v: string[]) {
  try { localStorage.setItem(vouchersKey(userId), JSON.stringify(v)); } catch {}
}

function prereleaseKey(userId: string) { return `pokemon-tcg-prerelease-${userId}`; }
function loadPrereleaseInvites(userId: string): string[] {
  try { const r = localStorage.getItem(prereleaseKey(userId)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePrereleaseInvites(userId: string, p: string[]) {
  try { localStorage.setItem(prereleaseKey(userId), JSON.stringify(p)); } catch {}
}

function packVouchersKey(userId: string) { return `pokemon-tcg-packvouchers-${userId}`; }
function loadPackVouchers(userId: string): number {
  try { return parseInt(localStorage.getItem(packVouchersKey(userId)) || '0', 10) || 0; } catch { return 0; }
}
function savePackVouchers(userId: string, n: number) {
  try { localStorage.setItem(packVouchersKey(userId), String(n)); } catch {}
}

function starterGivenKey(userId: string) { return `pokemon-tcg-starter-${userId}`; }
function wasStarterGiven(userId: string): boolean {
  try { return localStorage.getItem(starterGivenKey(userId)) === 'true'; } catch { return false; }
}
function markStarterGiven(userId: string) {
  try { localStorage.setItem(starterGivenKey(userId), 'true'); } catch {}
}

function unopenedPacksKey(userId: string) { return `pokemon-tcg-unopened-${userId}`; }
function loadUnopenedPacks(userId: string): Record<string, number> {
  try { const r = localStorage.getItem(unopenedPacksKey(userId)); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveUnopenedPacks(userId: string, p: Record<string, number>) {
  try { localStorage.setItem(unopenedPacksKey(userId), JSON.stringify(p)); } catch {}
}

function onboardingKey(userId: string) { return `pokemon-tcg-onboarding-${userId}`; }
function loadOnboarding(userId: string): { step: number | null; promoCardId: string | null } {
  try { const r = localStorage.getItem(onboardingKey(userId)); return r ? JSON.parse(r) : { step: null, promoCardId: null }; } catch { return { step: null, promoCardId: null }; }
}
function saveOnboarding(userId: string, data: { step: number | null; promoCardId: string | null }) {
  try { localStorage.setItem(onboardingKey(userId), JSON.stringify(data)); } catch {}
}

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
    credits: STARTING_CREDITS,
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
  collection: Record<string, number>; // card_id → quantity owned
  encountered: Set<string>;           // card_ids seen in matches
  freeVouchers: string[];             // set names with unclaimed deck vouchers
  prereleaseInvites: string[];        // set names with unused prerelease invites
  packVouchers: number;               // free booster pack vouchers from level-ups
  pendingLevelUp: { level: number; reward: LevelReward; cardId?: string } | null;
  unopenedPacks: Record<string, number>;
  onboardingStep: number | null;
  onboardingPromoCardId: string | null;
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
  awardGameResult: (won: boolean, mode?: 'vs-ai' | 'pvp') => Promise<void>;
  claimDailyCredits: () => Promise<boolean>;
  addToCollection: (cardIds: string[]) => void;
  addEncountered: (cardIds: string[]) => void;
  ensureStarterDeck: () => void;
  checkMilestones: () => void;
  redeemVoucher: (setName: string) => void;
  usePrereleaseInvite: (setName: string) => void;
  dismissLevelUp: () => void;
  usePackVoucher: () => void;
  addUnopenedPacks: (setName: string, count: number) => void;
  consumeOnePack: (setName: string) => boolean;
  advanceOnboarding: (addPromoToCollection?: boolean) => void;
  resetAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  decks: [],
  loading: true,
  isLocalGuest: false,
  collection: {},
  encountered: new Set<string>(),
  freeVouchers: [],
  prereleaseInvites: [],
  packVouchers: 0,
  pendingLevelUp: null,
  unopenedPacks: {},
  onboardingStep: null,
  onboardingPromoCardId: null,

  init: async () => {
    // Restore local guest session first (works without any Supabase setup)
    const savedGuest = loadLocalGuest();
    if (savedGuest) {
      // Patch corrupted profiles that somehow got 0 credits with no XP spent
      const isEmpty = (savedGuest.credits ?? 0) === 0 && (savedGuest.xp ?? 0) === 0 && (savedGuest.wins ?? 0) === 0;
      const profile = isEmpty ? { ...savedGuest, credits: STARTING_CREDITS } : savedGuest;
      if (isEmpty) saveLocalGuest(profile);
      const collection = loadCollectionFromStorage(LOCAL_GUEST_ID);
      const encountered = loadEncounteredFromStorage(LOCAL_GUEST_ID);
      const guestOnb = loadOnboarding(LOCAL_GUEST_ID);
      set({
        user: fakeUser(), profile, isLocalGuest: true, loading: false, collection, encountered,
        freeVouchers: loadVouchers(LOCAL_GUEST_ID),
        prereleaseInvites: loadPrereleaseInvites(LOCAL_GUEST_ID),
        packVouchers: loadPackVouchers(LOCAL_GUEST_ID),
        unopenedPacks: loadUnopenedPacks(LOCAL_GUEST_ID),
        onboardingStep: guestOnb.step,
        onboardingPromoCardId: guestOnb.promoCardId,
      });
      get().ensureStarterDeck();
      get().claimDailyCredits();
      get().checkMilestones();
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
        set({
          collection: loadCollectionFromStorage(user.id),
          encountered: loadEncounteredFromStorage(user.id),
        });
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        const u = session?.user ?? null;
        set({ user: u, isLocalGuest: false });
        if (u) {
          await get().refreshProfile();
          await get().refreshDecks();
          const authOnb = loadOnboarding(u.id);
          set({
            collection: loadCollectionFromStorage(u.id),
            encountered: loadEncounteredFromStorage(u.id),
            freeVouchers: loadVouchers(u.id),
            prereleaseInvites: loadPrereleaseInvites(u.id),
            packVouchers: loadPackVouchers(u.id),
            unopenedPacks: loadUnopenedPacks(u.id),
            onboardingStep: authOnb.step,
            onboardingPromoCardId: authOnb.promoCardId,
          });
          get().ensureStarterDeck();
          get().claimDailyCredits();
          get().checkMilestones();
        } else {
          set({ profile: null, decks: [], collection: {}, encountered: new Set() });
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
          wins: 0, losses: 0, elo: 1000, xp: 0, level: 1, credits: STARTING_CREDITS,
        });
        await get().refreshProfile();
        // If credits still 0 (e.g. schema migration not run), force-patch
        const { profile } = get();
        if (profile && (profile.credits ?? 0) === 0) {
          await supabase.from('profiles').update({ credits: STARTING_CREDITS }).eq('id', data.user.id);
          await get().refreshProfile();
        }
        set({
          collection: loadCollectionFromStorage(data.user.id),
          encountered: loadEncounteredFromStorage(data.user.id),
        });
        return;
      }
    }

    // Fallback: localStorage-based guest (no Supabase needed)
    const stored = loadLocalGuest();
    // A stored profile with 0 credits AND 0 xp is a bad init — reset it
    const isEmpty = stored && (stored.credits ?? 0) === 0 && (stored.xp ?? 0) === 0 && (stored.wins ?? 0) === 0;
    const profile = (!stored || isEmpty) ? makeGuestProfile() : stored;
    saveLocalGuest(profile);
    const collection = loadCollectionFromStorage(LOCAL_GUEST_ID);
    const encountered = loadEncounteredFromStorage(LOCAL_GUEST_ID);
    set({ user: fakeUser(), profile, isLocalGuest: true, loading: false, collection, encountered });
    get().ensureStarterDeck();
  },

  signOut: async () => {
    if (get().isLocalGuest) {
      try { localStorage.removeItem(LOCAL_GUEST_KEY); } catch {}
      set({ user: null, profile: null, decks: [], isLocalGuest: false, collection: {}, encountered: new Set() });
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, decks: [], isLocalGuest: false, collection: {}, encountered: new Set() });
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
      wins: 0, losses: 0, elo: 1000, xp: 0, level: 1, credits: STARTING_CREDITS,
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

    const oldLevel = computeLevel(profile.xp ?? 0).level;
    const newXP    = (profile.xp ?? 0) + amount;
    const { level: newLevel } = computeLevel(newXP);
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;

    let bonusCredits = 0;
    let pendingLevelUp: { level: number; reward: LevelReward; cardId?: string } | null = null;

    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      const reward = getLevelUpReward(lvl);
      let cardId: string | undefined;

      if (reward.type === 'credits' && reward.amount) {
        bonusCredits += reward.amount;
      } else if (reward.type === 'deck-voucher') {
        const next = [...get().freeVouchers, 'any'];
        saveVouchers(storageId, next);
        set({ freeVouchers: next });
      } else if (reward.type === 'pack-voucher') {
        const next = get().packVouchers + 1;
        savePackVouchers(storageId, next);
        set({ packVouchers: next });
      } else if (reward.type === 'rare-voucher') {
        const pool = ALL_CARDS.filter(c =>
          c.rarity?.toLowerCase() === 'rare' &&
          isSetUnlocked(c.set ?? '', get().collection)
        );
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          get().addToCollection([pick.id]);
          cardId = pick.id;
        }
      } else if (reward.type === 'holo-voucher') {
        const pool = ALL_CARDS.filter(c =>
          c.rarity?.toLowerCase().includes('holo') &&
          isSetUnlocked(c.set ?? '', get().collection)
        );
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          get().addToCollection([pick.id]);
          cardId = pick.id;
        }
      } else if (reward.type === 'promo') {
        // Random promos drawn from #1-18 and #20-28 only
        const PROMO_RANGE = new Set([
          ...Array.from({ length: 18 }, (_, i) => `basep-${i + 1}`),
          ...Array.from({ length: 9 }, (_, i) => `basep-${i + 20}`),
        ]);
        const pool = ALL_CARDS.filter(c => c.set === 'Wizards Black Star Promos' && PROMO_RANGE.has(c.id));
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          get().addToCollection([pick.id]);
          cardId = pick.id;
        }
      }

      pendingLevelUp = { level: lvl, reward, cardId };
    }

    const newCredits = (profile.credits ?? 0) + bonusCredits;

    if (isLocalGuest) {
      const updated = { ...profile, xp: newXP, level: newLevel, credits: newCredits };
      saveLocalGuest(updated);
      set({ profile: updated, ...(pendingLevelUp ? { pendingLevelUp } : {}) });
      return;
    }

    const supabase = createClient();
    await supabase.from('profiles').update({ xp: newXP, level: newLevel, credits: newCredits }).eq('id', user.id);
    if (pendingLevelUp) set({ pendingLevelUp });
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

  awardGameResult: async (won, mode = 'vs-ai') => {
    const { addXP, addCredits } = get();
    const xp = won ? 100 : 25;
    let credits: number;
    if (mode === 'pvp') {
      credits = won ? CREDIT_REWARDS.winPvp : CREDIT_REWARDS.losePvp;
    } else {
      credits = won ? CREDIT_REWARDS.winAI : CREDIT_REWARDS.loseAI;
    }
    await addXP(xp);
    await addCredits(credits);
  },

  claimDailyCredits: async () => {
    const { user, isLocalGuest, addCredits } = get();
    if (!user) return false;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const key = `pokemon-tcg-daily-${storageId}`;
    try {
      const last = localStorage.getItem(key);
      const now = Date.now();
      if (last && now - parseInt(last, 10) < 24 * 60 * 60 * 1000) return false;
      localStorage.setItem(key, String(now));
    } catch { return false; }
    await addCredits(CREDIT_REWARDS.daily);
    return true;
  },

  addToCollection: (cardIds: string[]) => {
    const { user, collection } = get();
    if (!user) return;
    const updated = { ...collection };
    for (const id of cardIds) {
      updated[id] = (updated[id] ?? 0) + 1;
    }
    const storageId = get().isLocalGuest ? LOCAL_GUEST_ID : user.id;
    saveCollectionToStorage(storageId, updated);
    set({ collection: updated });
    // Check if any milestones are newly reached
    get().checkMilestones();
  },

  checkMilestones: () => {
    const { user, collection, isLocalGuest, freeVouchers, prereleaseInvites } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const claimed = loadMilestones(storageId);
    const newVouchers = [...freeVouchers];
    const newInvites = [...prereleaseInvites];
    let changed = false;

    for (const entry of SET_PROGRESSION) {
      if (!entry.prerequisite) continue;
      const key = `${entry.name}-60`;
      if (claimed.has(key)) continue;
      const pct = setCompletionPct(entry.prerequisite, collection);
      if (pct >= VOUCHER_THRESHOLD) {
        claimed.add(key);
        if (!newVouchers.includes(entry.name)) newVouchers.push(entry.name);
        if (!newInvites.includes(entry.name)) newInvites.push(entry.name);
        changed = true;
      }
    }

    if (changed) {
      saveMilestones(storageId, claimed);
      saveVouchers(storageId, newVouchers);
      savePrereleaseInvites(storageId, newInvites);
      set({ freeVouchers: newVouchers, prereleaseInvites: newInvites });
    }
  },

  redeemVoucher: (setName: string) => {
    const { user, isLocalGuest, freeVouchers } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const updated = freeVouchers.filter(s => s !== setName);
    saveVouchers(storageId, updated);
    set({ freeVouchers: updated });
  },

  dismissLevelUp: () => set({ pendingLevelUp: null }),

  addUnopenedPacks: (setName: string, count: number) => {
    const { user, isLocalGuest, unopenedPacks } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const updated = { ...unopenedPacks, [setName]: (unopenedPacks[setName] ?? 0) + count };
    saveUnopenedPacks(storageId, updated);
    set({ unopenedPacks: updated });
  },

  consumeOnePack: (setName: string) => {
    const { user, isLocalGuest, unopenedPacks } = get();
    if (!user) return false;
    const current = unopenedPacks[setName] ?? 0;
    if (current <= 0) return false;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const updated = { ...unopenedPacks, [setName]: current - 1 };
    if (updated[setName] === 0) delete updated[setName];
    saveUnopenedPacks(storageId, updated);
    set({ unopenedPacks: updated });
    return true;
  },

  advanceOnboarding: (addPromoToCollection = false) => {
    const { user, isLocalGuest, onboardingStep, onboardingPromoCardId } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    if (addPromoToCollection && onboardingPromoCardId) {
      get().addToCollection([onboardingPromoCardId]);
    }
    const nextStep = !onboardingStep || onboardingStep >= 4 ? null : onboardingStep + 1;
    const onb = { step: nextStep, promoCardId: nextStep ? onboardingPromoCardId : null };
    saveOnboarding(storageId, onb);
    set({ onboardingStep: nextStep, ...(nextStep === null ? { onboardingPromoCardId: null } : {}) });
  },

  usePackVoucher: () => {
    const { user, isLocalGuest, packVouchers } = get();
    if (!user || packVouchers <= 0) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const next = packVouchers - 1;
    savePackVouchers(storageId, next);
    set({ packVouchers: next });
  },

  usePrereleaseInvite: (setName: string) => {
    const { user, isLocalGuest, prereleaseInvites } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    const updated = prereleaseInvites.filter(s => s !== setName);
    savePrereleaseInvites(storageId, updated);
    set({ prereleaseInvites: updated });
  },

  addEncountered: (cardIds: string[]) => {
    const { user, encountered } = get();
    if (!user) return;
    const updated = new Set(encountered);
    for (const id of cardIds) updated.add(id);
    const storageId = get().isLocalGuest ? LOCAL_GUEST_ID : user.id;
    saveEncounteredToStorage(storageId, updated);
    set({ encountered: updated });
  },

  ensureStarterDeck: () => {
    const { user, isLocalGuest } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;
    if (wasStarterGiven(storageId)) return;

    function saveDeckLocally(name: string, cardIds: string[]) {
      try {
        const key = 'pokemon-tcg-decks';
        const all: { name: string; cardIds: string[] }[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (!all.find(d => d.name === name)) {
          all.push({ name, cardIds });
          localStorage.setItem(key, JSON.stringify(all));
        }
      } catch {}
    }

    // Fists & Fire — only starter deck given on new profile (60 cards, no Machamp)
    const fistsFire = STARTER_DECKS.find(d => d.id === 'custom-fists-and-fire');
    if (fistsFire) {
      get().addToCollection(fistsFire.cardIds.filter(id => !id.startsWith('basic-')));
      saveDeckLocally(fistsFire.name, fistsFire.cardIds);
    }

    // 3 unopened Base Set packs (shown in onboarding step 2)
    const newUP = { ...get().unopenedPacks, 'Base': (get().unopenedPacks['Base'] ?? 0) + 3 };
    saveUnopenedPacks(storageId, newUP);
    set({ unopenedPacks: newUP });

    // 1 theme deck voucher (shown in onboarding step 4)
    const newVouchers = [...get().freeVouchers, 'any'];
    saveVouchers(storageId, newVouchers);
    set({ freeVouchers: newVouchers });

    // Starting promo is always Wizards Black Star Promo #1 — Pikachu
    // NOT added to collection yet; deferred to onboarding step 3
    const promoCard = ALL_CARDS.find(c => c.id === 'basep-1') ?? null;

    // Trigger onboarding modal sequence
    const onb = { step: 1, promoCardId: promoCard?.id ?? null };
    saveOnboarding(storageId, onb);
    set({ onboardingStep: 1, onboardingPromoCardId: promoCard?.id ?? null });

    markStarterGiven(storageId);
  },

  resetAccount: async () => {
    const { user, isLocalGuest, profile } = get();
    if (!user) return;
    const storageId = isLocalGuest ? LOCAL_GUEST_ID : user.id;

    saveCollectionToStorage(storageId, {});
    saveEncounteredToStorage(storageId, new Set());
    saveVouchers(storageId, []);
    savePackVouchers(storageId, 0);
    savePrereleaseInvites(storageId, []);
    saveUnopenedPacks(storageId, {});
    saveOnboarding(storageId, { step: null, promoCardId: null });
    try { localStorage.removeItem(starterGivenKey(storageId)); } catch {}
    try { localStorage.removeItem(`pokemon-tcg-milestones-${storageId}`); } catch {}

    if (isLocalGuest) {
      const reset: Profile = { ...makeGuestProfile(), display_name: profile?.display_name ?? 'Trainer' };
      saveLocalGuest(reset);
      set({ profile: reset, collection: {}, encountered: new Set(), freeVouchers: [], packVouchers: 0, prereleaseInvites: [], unopenedPacks: {}, onboardingStep: null, onboardingPromoCardId: null });
      get().ensureStarterDeck();
      return;
    }

    const supabase = createClient();
    await supabase.from('profiles').update({
      xp: 0, level: 1, credits: STARTING_CREDITS, wins: 0, losses: 0, elo: 1000,
    }).eq('id', user.id);
    set({ collection: {}, encountered: new Set(), freeVouchers: [], packVouchers: 0, prereleaseInvites: [], unopenedPacks: {}, onboardingStep: null, onboardingPromoCardId: null });
    await get().refreshProfile();
    get().ensureStarterDeck();
  },
}));
