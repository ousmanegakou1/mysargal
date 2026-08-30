// ============================================================
// MySargal Caisse - Themes evenementiels (accent + fond)
// Presets reglables cote admin (Octobre Rose, Novembre Bleu, Noel...).
// Les SURFACES restent blanches : seuls l'ACCENT et le FOND changent.
// Pour ajouter un evenement : ajouter une entree ci-dessous (cle unique,
// libelle FR, couleur d'apercu, et les 4 couleurs de la palette).
// ============================================================

export interface EventTheme {
  /** Cle stockee dans merchant.reward_config.app_theme et en local. */
  key: string;
  /** Libelle affiche dans le selecteur (FR). */
  label: string;
  /** Couleur d'apercu pour la pastille du selecteur (= accent). */
  preview: string;
  /** Accent principal (boutons pleins, onglet actif, FAB, badges...). */
  accent: string;
  /** Accent fonce (degrades, contraste texte sur clair). */
  accentDark: string;
  /** Fond doux d'accent (pastilles d'icone, puces actives). */
  accentSoftBg: string;
  /** Fond d'application (chaud et clair). */
  bg: string;
}

export const EVENT_THEMES: EventTheme[] = [
  {
    key: 'default',
    label: 'MySargal (vert)',
    preview: '#12A150',
    accent: '#12A150',
    accentDark: '#0E7A3D',
    accentSoftBg: '#E8F6EE',
    bg: '#F5F7F4',
  },
  {
    key: 'octobre_rose',
    label: 'Octobre Rose',
    preview: '#E85A9B',
    accent: '#E85A9B',
    accentDark: '#B23A75',
    accentSoftBg: '#FCE9F2',
    bg: '#FBF5F8',
  },
  {
    key: 'novembre_bleu',
    label: 'Novembre Bleu',
    preview: '#2E7BD6',
    accent: '#2E7BD6',
    accentDark: '#1C5AA6',
    accentSoftBg: '#E7F0FB',
    bg: '#F4F7FB',
  },
  {
    key: 'noel',
    label: 'Noel',
    preview: '#C0392B',
    accent: '#C0392B',
    accentDark: '#8E2A20',
    accentSoftBg: '#FBEAE7',
    bg: '#F7F4F2',
  },
  {
    key: 'saint_valentin',
    label: 'Saint-Valentin',
    preview: '#E23E6B',
    accent: '#E23E6B',
    accentDark: '#B02A50',
    accentSoftBg: '#FCE7EC',
    bg: '#FBF4F6',
  },
];

export const DEFAULT_THEME_KEY = 'default';

/** Retourne le preset correspondant a la cle (defaut si absent/inconnu). */
export function getEventTheme(key?: string | null): EventTheme {
  return EVENT_THEMES.find((t) => t.key === key) || EVENT_THEMES[0];
}
