// ============================================================
// MySargal Caisse - Fonds d'application (background reglable)
// Le fond par defaut suit l'evenement (teinte tres legere = theme.bg).
// L'utilisateur peut choisir un fond uni sobre dans une petite palette,
// ou importer une image affichee tres discretement derriere le contenu
// (voile blanc pour garder les cartes parfaitement lisibles).
// Persistance : reward_config.app_background (updateMerchant) + AsyncStorage.
// ============================================================

/** Preference de fond telle que stockee (config marchand + cache local). */
export type BackgroundPref =
  | { type: 'default' }
  | { type: 'palette'; key: string }
  | { type: 'image'; uri: string };

export interface BackgroundPalette {
  key: string;
  label: string;
  color: string;
}

/** Petite palette de fonds unis sobres (jamais criards). */
export const BACKGROUND_PALETTES: BackgroundPalette[] = [
  { key: 'blanc', label: 'Blanc', color: '#FFFFFF' },
  { key: 'ivoire', label: 'Ivoire', color: '#FBF9F4' },
  { key: 'sable', label: 'Sable', color: '#F5F1EA' },
  { key: 'brume', label: 'Brume', color: '#F1F4F6' },
  { key: 'menthe', label: 'Menthe', color: '#F0F5F2' },
  { key: 'lin', label: 'Lin', color: '#F4F2EE' },
];

/** Fond effectivement applique (couleur de base + image optionnelle). */
export interface ResolvedBackground {
  /** Couleur unie de base (sert aussi de socle sous une image). */
  color: string;
  /** Image de fond optionnelle (affichee tres discretement, voile blanc). */
  imageUri?: string;
}

/** Voile blanc pose sur une image de fond pour garder la lisibilite. */
export const BACKGROUND_IMAGE_VEIL = 'rgba(255,255,255,0.86)';

/** Opacite de l'image de fond elle-meme (discrete). */
export const BACKGROUND_IMAGE_OPACITY = 0.5;

/** Convertit une preference en fond concret, en repli sur le fond du theme. */
export function resolveBackground(pref: BackgroundPref | null | undefined, themeBg: string): ResolvedBackground {
  if (pref && pref.type === 'image' && pref.uri) {
    return { color: '#FFFFFF', imageUri: pref.uri };
  }
  if (pref && pref.type === 'palette') {
    const p = BACKGROUND_PALETTES.find((x) => x.key === pref.key);
    return { color: p ? p.color : themeBg };
  }
  return { color: themeBg };
}

/** Parse defensif d'une valeur venue du stockage/config marchand. */
export function parseBackgroundPref(raw: unknown): BackgroundPref {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r.type === 'image' && typeof r.uri === 'string' && r.uri) return { type: 'image', uri: r.uri };
    if (r.type === 'palette' && typeof r.key === 'string' && r.key) return { type: 'palette', key: r.key };
  }
  return { type: 'default' };
}
