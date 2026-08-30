// ============================================================
// MySargal Caisse - File d'attente hors ligne
// Les operations de credit (add-points) et de recompense (redeem-reward)
// realisees sans reseau sont mises en file, persistees (AsyncStorage), et
// rejouees automatiquement au retour du reseau. Les points etant additifs,
// il n'y a aucun conflit a resoudre : on rejoue simplement dans l'ordre.
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { addPoints, redeemReward } from '../api/endpoints';
import { AddPointsParams } from '../api/endpoints';

export type QueueItemType = 'credit' | 'reward';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  createdAt: number;
  clientName?: string;
  cardCode: string;
  merchantId: string;
  // credit
  pts?: number;
  amountFcfa?: number;
  note?: string;
  source?: string;
  cashierId?: string | null;
  // reward
  rewardId?: string | null;
  rewardName?: string | null;
  // suivi
  attempts: number;
  lastError?: string;
}

interface QueueState {
  items: QueueItem[];
  syncing: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  enqueue: (item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts'>) => QueueItem;
  remove: (id: string) => void;
  clear: () => void;
  replay: () => Promise<{ done: number; failed: number }>;
}

function persist(items: QueueItem[]) {
  AsyncStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(items)).catch(() => {});
}

function genId(): string {
  return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  syncing: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.offlineQueue);
      const items: QueueItem[] = raw ? JSON.parse(raw) : [];
      set({ items, hydrated: true });
    } catch {
      set({ items: [], hydrated: true });
    }
  },

  enqueue: (partial) => {
    const item: QueueItem = {
      ...partial,
      id: genId(),
      createdAt: Date.now(),
      attempts: 0,
    };
    const items = [...get().items, item];
    set({ items });
    persist(items);
    return item;
  },

  remove: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    set({ items });
    persist(items);
  },

  clear: () => {
    set({ items: [] });
    persist([]);
  },

  replay: async () => {
    if (get().syncing) return { done: 0, failed: 0 };
    const pending = get().items;
    if (!pending.length) return { done: 0, failed: 0 };

    set({ syncing: true });
    let done = 0;
    let failed = 0;
    const survivors: QueueItem[] = [];

    for (const item of pending) {
      try {
        if (item.type === 'credit') {
          const params: AddPointsParams = {
            card_code: item.cardCode,
            merchant_id: item.merchantId,
            note: item.note || 'Achat',
            source: item.source || 'manual',
            cashier_id: item.cashierId || null,
          };
          if (item.pts != null) params.pts = item.pts;
          if (item.amountFcfa != null) params.amount_fcfa = item.amountFcfa;
          await addPoints(params);
        } else {
          await redeemReward(item.cardCode, item.merchantId, item.rewardId || null);
        }
        done++;
      } catch (e: any) {
        // Erreur metier definitive (400/404/402) : on abandonne pour ne pas
        // boucler indefiniment. Erreur reseau (0) : on garde pour plus tard.
        const status = e?.status;
        if (status && status !== 0 && status !== 429 && status < 500) {
          failed++;
          // on retire l'item (echec metier), il n'aboutira jamais.
        } else {
          survivors.push({ ...item, attempts: item.attempts + 1, lastError: e?.message });
        }
      }
    }

    set({ items: survivors, syncing: false });
    persist(survivors);
    return { done, failed };
  },
}));
