// ============================================================
// MySargal Caisse - Contexte d'authentification
// Session sans mot de passe (OTP WhatsApp) -> JWT MySargal 30 jours glissants.
// Token stocke en zone securisee (expo-secure-store). Refresh silencieux au
// demarrage s'il reste moins de 15 jours. Verrouillage PIN optionnel.
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { STORAGE_KEYS, REFRESH_THRESHOLD_DAYS, DEVICE_APP } from '../config';
import {
  setAuthToken,
  setOnSessionExpired,
  setOnTokenRefreshed,
  refreshSession,
} from '../api/client';
import {
  sendOtp as apiSendOtp,
  verifyOtp as apiVerifyOtp,
  resolveMerchantByPhone,
  fetchMerchantById,
  registerDevice,
} from '../api/endpoints';
import { jwtDaysLeft } from '../utils/format';
import { isPinEnabled } from './pin';
import { Merchant } from '../api/types';

export type AuthStatus = 'loading' | 'unauthenticated' | 'locked' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  token: string | null;
  phone: string | null;
  merchant: Merchant | null;
}

interface AuthContextValue extends AuthState {
  sendCode: (fullPhone: string) => Promise<void>;
  verifyCode: (fullPhone: string, code: string) => Promise<Merchant>;
  logout: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  refreshMerchant: () => Promise<void>;
  switchMerchant: (id: string) => Promise<void>;
  setPushToken: (token: string, platform: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    token: null,
    phone: null,
    merchant: null,
  });
  const merchantRef = useRef<Merchant | null>(null);
  const phoneRef = useRef<string | null>(null);

  const persistToken = useCallback(async (token: string) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.token, token);
  }, []);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.phone);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.merchant);
    merchantRef.current = null;
    phoneRef.current = null;
    setState({ status: 'unauthenticated', token: null, phone: null, merchant: null });
  }, []);

  // Cablage du client HTTP : session expiree -> retour connexion ;
  // token rafraichi -> persistance.
  useEffect(() => {
    setOnSessionExpired(() => {
      clearSession();
    });
    setOnTokenRefreshed((t) => {
      persistToken(t);
    });
    return () => {
      setOnSessionExpired(null);
      setOnTokenRefreshed(null);
    };
  }, [clearSession, persistToken]);

  // Boot : restauration de session.
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
        const phone = await SecureStore.getItemAsync(STORAGE_KEYS.phone);
        const cachedMerchant = await SecureStore.getItemAsync(STORAGE_KEYS.merchant);

        if (!token || !phone) {
          setState({ status: 'unauthenticated', token: null, phone: null, merchant: null });
          return;
        }

        // Jeton expire cote horloge locale -> reconnexion obligatoire.
        const days = jwtDaysLeft(token);
        if (days !== null && days <= 0) {
          await clearSession();
          return;
        }

        let activeToken = token;
        setAuthToken(activeToken);

        // Refresh silencieux s'il reste moins de 15 jours.
        if (days !== null && days < REFRESH_THRESHOLD_DAYS) {
          const r = await refreshSession(activeToken);
          if (r && r.token) {
            activeToken = r.token;
            setAuthToken(activeToken);
            await persistToken(activeToken);
          }
        }

        let merchant: Merchant | null = cachedMerchant ? JSON.parse(cachedMerchant) : null;
        // Rafraichit le merchant en arriere-plan (logo, plan, config).
        try {
          if (merchant?.id) {
            const fresh = await fetchMerchantById(merchant.id);
            if (fresh) merchant = fresh;
          } else {
            merchant = await resolveMerchantByPhone(phone);
          }
          if (merchant) {
            await SecureStore.setItemAsync(STORAGE_KEYS.merchant, JSON.stringify(merchant));
          }
        } catch {
          // Reseau HS : on garde le cache pour ne pas bloquer.
        }

        if (!merchant) {
          await clearSession();
          return;
        }

        merchantRef.current = merchant;
        phoneRef.current = phone;

        const locked = await isPinEnabled();
        setState({
          status: locked ? 'locked' : 'authenticated',
          token: activeToken,
          phone,
          merchant,
        });
      } catch {
        setState({ status: 'unauthenticated', token: null, phone: null, merchant: null });
      }
    })();
  }, [clearSession, persistToken]);

  const sendCode = useCallback(async (fullPhone: string) => {
    await apiSendOtp(fullPhone);
  }, []);

  const verifyCode = useCallback(
    async (fullPhone: string, code: string): Promise<Merchant> => {
      const res = await apiVerifyOtp(fullPhone, code);
      const token = res.token;
      if (!token) throw new Error('Session non emise. Reessaie.');
      setAuthToken(token);

      const merchant = await resolveMerchantByPhone(res.phone || fullPhone);
      if (!merchant) {
        setAuthToken(null);
        throw new Error(
          "Aucun compte pour ce numero. Inscris ta boutique sur MySargal puis reconnecte-toi."
        );
      }

      await persistToken(token);
      await SecureStore.setItemAsync(STORAGE_KEYS.phone, res.phone || fullPhone);
      await SecureStore.setItemAsync(STORAGE_KEYS.merchant, JSON.stringify(merchant));

      merchantRef.current = merchant;
      phoneRef.current = res.phone || fullPhone;

      setState({
        status: 'authenticated',
        token,
        phone: res.phone || fullPhone,
        merchant,
      });
      return merchant;
    },
    [persistToken]
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const unlock = useCallback(() => {
    setState((s) => (s.status === 'locked' ? { ...s, status: 'authenticated' } : s));
  }, []);

  const lock = useCallback(() => {
    setState((s) => (s.status === 'authenticated' ? { ...s, status: 'locked' } : s));
  }, []);

  const refreshMerchant = useCallback(async () => {
    const id = merchantRef.current?.id;
    if (!id) return;
    try {
      const fresh = await fetchMerchantById(id);
      if (fresh) {
        merchantRef.current = fresh;
        await SecureStore.setItemAsync(STORAGE_KEYS.merchant, JSON.stringify(fresh));
        setState((s) => ({ ...s, merchant: fresh }));
      }
    } catch {
      /* silencieux */
    }
  }, []);

  // Bascule vers une autre boutique / branche (par id).
  const switchMerchant = useCallback(async (id: string) => {
    try {
      const fresh = await fetchMerchantById(id);
      if (fresh) {
        merchantRef.current = fresh;
        await SecureStore.setItemAsync(STORAGE_KEYS.merchant, JSON.stringify(fresh));
        setState((s) => ({ ...s, merchant: fresh }));
      }
    } catch {
      /* silencieux */
    }
  }, []);

  const setPushToken = useCallback(async (pushToken: string, platform: string) => {
    try {
      await registerDevice({
        token: pushToken,
        platform: platform || Platform.OS,
        merchant_id: merchantRef.current?.id || null,
        phone: phoneRef.current || null,
        app: DEVICE_APP,
      });
    } catch {
      /* non bloquant */
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    sendCode,
    verifyCode,
    logout,
    unlock,
    lock,
    refreshMerchant,
    switchMerchant,
    setPushToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit etre utilise dans AuthProvider');
  return ctx;
}
