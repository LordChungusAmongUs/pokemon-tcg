export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string;
          avatar_url: string | null;
          wins: number;
          losses: number;
          elo: number;
          xp: number;
          level: number;
          credits: number;
          is_guest: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          wins?: number;
          losses?: number;
          elo?: number;
          xp?: number;
          level?: number;
          credits?: number;
          is_guest?: boolean;
        };
        Update: {
          username?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          wins?: number;
          losses?: number;
          elo?: number;
          xp?: number;
          level?: number;
          credits?: number;
          is_guest?: boolean;
        };
        Relationships: [];
      };
      decks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          card_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; name: string; card_ids: string[] };
        Update: { name?: string; card_ids?: string[] };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          player1_id: string;
          player2_id: string | null;
          player1_deck_id: string;
          player2_deck_id: string | null;
          state: Json | null;
          status: 'waiting' | 'in_progress' | 'finished';
          winner_id: string | null;
          seed: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          player1_id: string;
          player1_deck_id: string;
          seed: number;
          status?: 'waiting' | 'in_progress' | 'finished';
        };
        Update: {
          player2_id?: string;
          player2_deck_id?: string;
          state?: Json;
          status?: 'waiting' | 'in_progress' | 'finished';
          winner_id?: string;
        };
        Relationships: [];
      };
      lobby_messages: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          message: string;
          created_at: string;
        };
        Insert: { user_id: string; display_name: string; message: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      matchmaking_queue: {
        Row: {
          id: string;
          user_id: string;
          deck_id: string;
          status: 'waiting' | 'matched';
          matched_game_id: string | null;
          created_at: string;
        };
        Insert: { user_id: string; deck_id: string };
        Update: { status?: 'waiting' | 'matched'; matched_game_id?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Deck = Database['public']['Tables']['decks']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type LobbyMessage = Database['public']['Tables']['lobby_messages']['Row'];
export type MatchmakingEntry = Database['public']['Tables']['matchmaking_queue']['Row'];
