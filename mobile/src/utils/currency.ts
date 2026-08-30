// ============================================================
// MySargal Caisse - Devises et ratios points
// Reprend la logique multi-devise de l'app web (symbole, decimales, ratio par
// defaut montant/point, montant minimum de recharge carte cadeau).
// ============================================================

export interface DeviseInfo {
  symbol: string;
  decimals: number;
  before: boolean; // symbole avant le montant ?
  ratio: number; // franc / point par defaut
  ratioMin: number; // ratio minimum autorise
  rechargeMin: number; // montant minimum de recharge
}

export const DEVISES: Record<string, DeviseInfo> = {
  XOF: { symbol: 'FCFA', decimals: 0, before: false, ratio: 1000, ratioMin: 100, rechargeMin: 500 },
  XAF: { symbol: 'FCFA', decimals: 0, before: false, ratio: 1000, ratioMin: 100, rechargeMin: 500 },
  EUR: { symbol: '€', decimals: 2, before: true, ratio: 2, ratioMin: 1, rechargeMin: 5 },
  USD: { symbol: '$', decimals: 2, before: true, ratio: 2, ratioMin: 1, rechargeMin: 5 },
  MAD: { symbol: 'DH', decimals: 2, before: false, ratio: 20, ratioMin: 1, rechargeMin: 20 },
  GNF: { symbol: 'FG', decimals: 0, before: false, ratio: 10000, ratioMin: 1000, rechargeMin: 5000 },
  NGN: { symbol: '₦', decimals: 0, before: true, ratio: 1000, ratioMin: 100, rechargeMin: 500 },
  GHS: { symbol: '₵', decimals: 2, before: true, ratio: 10, ratioMin: 1, rechargeMin: 10 },
};

export function deviseInfo(code?: string | null): DeviseInfo {
  const c = String(code || 'XOF').toUpperCase();
  return DEVISES[c] || DEVISES.XOF;
}

// Symbole d'affichage (FCFA par defaut).
export function deviseSymbol(code?: string | null): string {
  return deviseInfo(code).symbol;
}

// Formate un montant selon la devise de la boutique.
export function fmtAmount(amount: number, code?: string | null): string {
  const info = deviseInfo(code);
  const n = Number(amount) || 0;
  const s = n.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimals,
  });
  return info.before ? `${info.symbol} ${s}` : `${s} ${info.symbol}`;
}

// Montants predefinis de carte cadeau selon la devise.
export function giftPresets(code?: string | null): number[] {
  const info = deviseInfo(code);
  if (info.decimals >= 2) return [10, 25, 50, 100, 200];
  if ((info.symbol || '').includes('FG')) return [10000, 25000, 50000, 100000, 200000];
  return [5000, 10000, 25000, 50000, 100000];
}
