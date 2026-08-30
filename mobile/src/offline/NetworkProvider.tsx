// ============================================================
// MySargal Caisse - Etat reseau (NetInfo) + rejeu automatique de la file
// Expose l'etat en ligne/hors ligne et declenche le replay des operations
// en attente des que la connexion revient.
// ============================================================

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueue } from './queue';

interface NetworkContextValue {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  syncNow: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue>({
  online: true,
  syncing: false,
  pendingCount: 0,
  syncNow: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const items = useQueue((s) => s.items);
  const syncing = useQueue((s) => s.syncing);
  const hydrate = useQueue((s) => s.hydrate);
  const replay = useQueue((s) => s.replay);
  const wasOffline = useRef(false);

  // Hydrate la file au montage.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOn = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(isOn);
      // Transition hors ligne -> en ligne : on rejoue la file.
      if (isOn && wasOffline.current) {
        replay();
      }
      wasOffline.current = !isOn;
    });
    // Etat initial + rejeu si des operations attendent deja.
    NetInfo.fetch().then((state) => {
      const isOn = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(isOn);
      wasOffline.current = !isOn;
      if (isOn) replay();
    });
    return () => unsub();
  }, [replay]);

  const syncNow = async () => {
    if (online) await replay();
  };

  return (
    <NetworkContext.Provider
      value={{ online, syncing, pendingCount: items.length, syncNow }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
