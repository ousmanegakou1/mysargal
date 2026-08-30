// ============================================================
// MySargal Caisse - Mode d'attribution des points
// Reproduit la logique de l'app web :
//   - Mode "montant" (pts_amount_mode) : points = floor(montant / ratio)
//     ou ratio = pts_fcfa_per_point (defaut selon devise).
//   - Mode "points" : la caisse saisit directement le nombre de points.
// Le calcul se fait cote client, puis add-points est appele avec `pts`.
// ============================================================

import { Merchant } from '../api/types';

// Defaut du ratio franc CFA -> point si non configure.
const DEFAULT_RATIO = 1000;

export function isAmountMode(merchant?: Merchant | null): boolean {
  return !!merchant?.pts_amount_mode;
}

export function fcfaPerPoint(merchant?: Merchant | null): number {
  const v = Number(merchant?.pts_fcfa_per_point || 0);
  return v && v >= 1 ? v : DEFAULT_RATIO;
}

export function ptsFromAmount(amount: number, merchant?: Merchant | null): number {
  const ratio = fcfaPerPoint(merchant);
  return Math.floor((Number(amount) || 0) / ratio);
}

// Boutons rapides adaptes au mode.
export function quickValues(merchant?: Merchant | null): number[] {
  return isAmountMode(merchant) ? [1000, 2000, 5000, 10000] : [1, 2, 5, 10];
}
