// ============================================================
// MySargal Caisse - Numeros de membre, codes cartes, niveaux
// ============================================================

// Numero de membre Summit ('MRZ-' + 6 chiffres), comme l'app web.
export function genMemberNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return 'MRZ-' + n;
}

// Code de carte cadeau local ('GC-' + 6 alphanum).
export function genGiftCode(): string {
  return 'GC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Code de carte de fidelite local (repli si RPC indisponible).
export function genCardCode(): string {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return 'LC-' + s;
}

// Niveau (tier) deduit du cumul de points, comme msTierFromLifetime.
export function tierFromLifetime(life: number): string {
  const l = Number(life) || 0;
  if (l >= 500) return 'platinum';
  if (l >= 200) return 'gold';
  if (l >= 50) return 'silver';
  return 'bronze';
}

// Familles de recompenses Summit Club (icone Feather, coherente premium).
import type { IconName } from '../components/Icon';

export const SC_FAMILIES: { key: string; label: string; icon: IconName }[] = [
  { key: 'cadeaux_exclusifs', label: 'Cadeaux exclusifs', icon: 'gift' },
  { key: 'evenements_exclusifs', label: 'Evenements exclusifs', icon: 'calendar' },
  { key: 'experiences_uniques', label: 'Experiences uniques', icon: 'star' },
  { key: 'services_personnalises', label: 'Services personnalises', icon: 'bell' },
  { key: 'points_echangeables', label: 'Points echangeables', icon: 'refresh-cw' },
];

// Niveaux par defaut a l'activation du programme (editables ensuite, charte verte).
export const SC_DEFAULT_TIERS = [
  {
    name: 'Membre',
    min_points: 0,
    max_points: 99,
    min_spend_year: 0,
    color_hex: '#4ade80',
    priority: 1,
    benefits_json: ['Bienvenue dans le programme', 'Cumul de points a chaque achat', 'Offres reservees'],
  },
  {
    name: 'Privilège',
    min_points: 100,
    max_points: 199,
    min_spend_year: 1000000,
    color_hex: '#22c55e',
    priority: 2,
    benefits_json: ['Cadeau anniversaire', 'Acces avant-premieres', 'Livraison offerte'],
  },
  {
    name: 'Prestige',
    min_points: 200,
    max_points: null as number | null,
    min_spend_year: 2000000,
    color_hex: '#16a34a',
    priority: 3,
    benefits_json: ['Conciergerie', 'Invitations VIP', 'Experiences uniques', 'Cadeau fin d annee'],
  },
];

// Nom d'affichage du programme de fidelite, configurable par boutique
// via merchant.reward_config.program_name. Repli : "Club Privileges".
export function programName(
  merchant?: { reward_config?: Record<string, unknown> | null } | null,
): string {
  const cfg = (merchant?.reward_config as Record<string, unknown> | null) || {};
  const n = cfg && (cfg.program_name as unknown);
  return typeof n === 'string' && n.trim() ? n : 'Club Privilèges';
}

// Masque un numero en gardant les 4 derniers chiffres.
export function maskLast4(phone?: string | null): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return phone || '';
  return '••• ' + d.slice(-4);
}
