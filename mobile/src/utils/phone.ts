// ============================================================
// MySargal Caisse - Gestion des numeros de telephone
// Indicatifs courants Afrique de l'Ouest, defaut Senegal (+221).
// ============================================================

import { onlyDigits } from './format';

export interface Country {
  code: string; // indicatif avec +
  iso: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: '+221', iso: 'SN', name: 'Senegal' },
  { code: '+225', iso: 'CI', name: "Cote d'Ivoire" },
  { code: '+223', iso: 'ML', name: 'Mali' },
  { code: '+226', iso: 'BF', name: 'Burkina Faso' },
  { code: '+224', iso: 'GN', name: 'Guinee' },
  { code: '+229', iso: 'BJ', name: 'Benin' },
  { code: '+228', iso: 'TG', name: 'Togo' },
  { code: '+227', iso: 'NE', name: 'Niger' },
  { code: '+222', iso: 'MR', name: 'Mauritanie' },
  { code: '+33', iso: 'FR', name: 'France' },
  { code: '+1', iso: 'US', name: 'USA' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

// Construit le numero complet international a partir de l'indicatif + saisie.
export function buildFullPhone(country: Country, local: string): string {
  const d = onlyDigits(local);
  return country.code + d;
}

// Formate la saisie locale par blocs pour la lisibilite.
export function formatLocal(local: string): string {
  const d = onlyDigits(local);
  return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

// Masque un numero pour affichage (garde indicatif + 2 derniers).
export function maskPhone(full?: string | null): string {
  const d = onlyDigits(full);
  if (d.length < 4) return full || '';
  return '••• ••• ' + d.slice(-2);
}
