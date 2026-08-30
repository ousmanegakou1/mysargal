// ============================================================
// MySargal Caisse - Fournisseur de theme dynamique (accent + fond)
// Source de verite = la config du marchand (merchant.reward_config.app_theme),
// reglable cote admin. Un cache local (AsyncStorage) permet un rendu instantane
// au demarrage avant que le marchand ne soit charge/rafraichi.
// Les SURFACES/texte/bordures restent geres par `colors` (theme neutre) ;
// ce provider n'expose QUE l'accent et le fond dynamiques + leurs derives.
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { EVENT_THEMES, EventTheme, getEventTheme, DEFAULT_THEME_KEY } from './events';
import {
  BackgroundPref,
  ResolvedBackground,
  resolveBackground,
  parseBackgroundPref,
} from './backgrounds';
import { useAuth } from '../auth/AuthContext';

const STORAGE_KEY = 'ms_event_theme';
const BG_STORAGE_KEY = 'ms_app_background';

export interface ThemeValue {
  key: string;
  label: string;
  accent: string;
  accentDark: string;
  accentSoftBg: string;
  bg: string;
  /** Texte pose sur l'accent plein (boutons, FAB, hero). */
  onAccent: string;
  /** Bordure d'accent discrete (elements actifs). */
  accentBorder: string;
  /** Ombre douce coloree par l'accent. */
  accentShadow: ViewStyle;
  /** Liste des presets disponibles (pour le selecteur admin). */
  presets: EventTheme[];
  /** Applique un preset immediatement + persiste en local. */
  setTheme: (key: string) => void;
  /** Preference de fond brute (defaut / palette / image). */
  backgroundPref: BackgroundPref;
  /** Fond effectivement applique (couleur + image optionnelle). */
  background: ResolvedBackground;
  /** Applique un fond immediatement + persiste en local. */
  setBackground: (pref: BackgroundPref) => void;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildTheme(
  key: string,
  bgPref: BackgroundPref,
  setTheme: (k: string) => void,
  setBackground: (p: BackgroundPref) => void
): ThemeValue {
  const t = getEventTheme(key);
  return {
    key: t.key,
    label: t.label,
    accent: t.accent,
    accentDark: t.accentDark,
    accentSoftBg: t.accentSoftBg,
    bg: t.bg,
    onAccent: '#ffffff',
    accentBorder: hexToRgba(t.accent, 0.28),
    accentShadow: {
      shadowColor: t.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 6,
    },
    presets: EVENT_THEMES,
    setTheme,
    backgroundPref: bgPref,
    background: resolveBackground(bgPref, t.bg),
    setBackground,
  };
}

// Valeur par defaut sure : useTheme() ne jette jamais, meme hors provider.
const ThemeContext = createContext<ThemeValue>(
  buildTheme(DEFAULT_THEME_KEY, { type: 'default' }, () => {}, () => {})
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { merchant } = useAuth();
  const [key, setKey] = useState<string>(DEFAULT_THEME_KEY);
  const [bgPref, setBgPref] = useState<BackgroundPref>({ type: 'default' });

  // Boot instantane depuis le cache local (accent + fond).
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && v) setKey(v);
      })
      .catch(() => {});
    AsyncStorage.getItem(BG_STORAGE_KEY)
      .then((v) => {
        if (!alive || !v) return;
        try {
          setBgPref(parseBackgroundPref(JSON.parse(v)));
        } catch {
          // valeur locale corrompue : on ignore, repli sur le defaut.
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Source de verite : config marchand (reglable cote admin).
  useEffect(() => {
    const cfg = (merchant?.reward_config || {}) as Record<string, unknown>;
    const t = cfg.app_theme;
    if (typeof t === 'string' && t) {
      setKey(t);
      AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
    }
    if (cfg.app_background !== undefined) {
      const pref = parseBackgroundPref(cfg.app_background);
      setBgPref(pref);
      AsyncStorage.setItem(BG_STORAGE_KEY, JSON.stringify(pref)).catch(() => {});
    }
  }, [merchant]);

  const setTheme = useCallback((k: string) => {
    setKey(k);
    AsyncStorage.setItem(STORAGE_KEY, k).catch(() => {});
  }, []);

  const setBackground = useCallback((p: BackgroundPref) => {
    setBgPref(p);
    AsyncStorage.setItem(BG_STORAGE_KEY, JSON.stringify(p)).catch(() => {});
  }, []);

  const value = useMemo(
    () => buildTheme(key, bgPref, setTheme, setBackground),
    [key, bgPref, setTheme, setBackground]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
