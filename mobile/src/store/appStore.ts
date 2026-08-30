// ============================================================
// MySargal Caisse - Store applicatif (Zustand)
// - Cache des derniers clients scannes (lookup possible hors ligne)
// - Journal local des operations (retour visuel immediat, meme hors ligne)
// - Cache des recompenses configurables
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { CardLookup, Reward } from '../api/types';

export interface LocalOp {
  id: string;
  cardCode: string;
  clientName?: string;
  type: 'credit' | 'reward';
  pts: number; // positif credit, negatif recompense
  note?: string;
  at: number;
  pending: boolean;
}

// Notification push recue par le marchand (boite de reception).
export interface InboxItem {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

interface AppState {
  clients: Record<string, CardLookup>; // clef = code carte
  recentCodes: string[]; // ordre d'apparition, plus recent en tete
  localOps: LocalOp[];
  rewards: Reward[];
  inbox: InboxItem[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  cacheClient: (card: CardLookup) => void;
  getCachedClient: (code: string) => CardLookup | undefined;
  updateClientPts: (code: string, pts: number, lifetime?: number) => void;
  addLocalOp: (op: Omit<LocalOp, 'id' | 'at'>) => void;
  markOpsSynced: () => void;
  setRewards: (rewards: Reward[]) => void;
  addInbox: (item: Omit<InboxItem, 'id' | 'at' | 'read'>) => void;
  markInboxRead: () => void;
  clearInbox: () => void;
}

const MAX_CACHE = 40;
const MAX_LOCAL_OPS = 60;

function persistClients(clients: Record<string, CardLookup>, recent: string[]) {
  AsyncStorage.setItem(
    STORAGE_KEYS.clientsCache,
    JSON.stringify({ clients, recent })
  ).catch(() => {});
}

export const useAppStore = create<AppState>((set, get) => ({
  clients: {},
  recentCodes: [],
  localOps: [],
  rewards: [],
  inbox: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.clientsCache);
      let inbox: InboxItem[] = [];
      try {
        const rawInbox = await AsyncStorage.getItem(STORAGE_KEYS.inbox);
        if (rawInbox) inbox = JSON.parse(rawInbox) || [];
      } catch {
        /* inbox indisponible */
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          clients: parsed.clients || {},
          recentCodes: parsed.recent || [],
          inbox,
          hydrated: true,
        });
      } else {
        set({ inbox, hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  cacheClient: (card) => {
    const clients = { ...get().clients, [card.code]: card };
    let recent = [card.code, ...get().recentCodes.filter((c) => c !== card.code)];
    if (recent.length > MAX_CACHE) {
      const dropped = recent.slice(MAX_CACHE);
      recent = recent.slice(0, MAX_CACHE);
      dropped.forEach((c) => delete clients[c]);
    }
    set({ clients, recentCodes: recent });
    persistClients(clients, recent);
  },

  getCachedClient: (code) => get().clients[code],

  updateClientPts: (code, pts, lifetime) => {
    const existing = get().clients[code];
    if (!existing) return;
    const threshold = existing.merchant?.threshold || 10;
    const updated: CardLookup = {
      ...existing,
      pts,
      lifetime_pts: lifetime != null ? lifetime : existing.lifetime_pts,
      remaining_pts: Math.max(0, threshold - pts),
      progress_pct: Math.min(100, Math.round((pts / threshold) * 100)),
      reward_ready: pts >= threshold,
    };
    const clients = { ...get().clients, [code]: updated };
    set({ clients });
    persistClients(clients, get().recentCodes);
  },

  addLocalOp: (op) => {
    const full: LocalOp = {
      ...op,
      id: 'op_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
    };
    const localOps = [full, ...get().localOps].slice(0, MAX_LOCAL_OPS);
    set({ localOps });
  },

  markOpsSynced: () => {
    set({ localOps: get().localOps.map((o) => ({ ...o, pending: false })) });
  },

  setRewards: (rewards) => set({ rewards }),

  addInbox: (item) => {
    const full: InboxItem = {
      ...item,
      id: 'nx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      read: false,
    };
    const inbox = [full, ...get().inbox].slice(0, 100);
    set({ inbox });
    AsyncStorage.setItem(STORAGE_KEYS.inbox, JSON.stringify(inbox)).catch(() => {});
  },

  markInboxRead: () => {
    const inbox = get().inbox.map((n) => ({ ...n, read: true }));
    set({ inbox });
    AsyncStorage.setItem(STORAGE_KEYS.inbox, JSON.stringify(inbox)).catch(() => {});
  },

  clearInbox: () => {
    set({ inbox: [] });
    AsyncStorage.setItem(STORAGE_KEYS.inbox, JSON.stringify([])).catch(() => {});
  },
}));
