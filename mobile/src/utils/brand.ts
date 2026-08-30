// ============================================================
// MySargal Caisse - Presets de marque (couleurs carte)
// Valeurs identiques a BRAND_PRESETS de l'app web.
// ============================================================

export interface BrandPreset {
  name: string;
  bg1: string;
  bg2: string;
  accent: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  { name: 'MySargal', bg1: '#06210f', bg2: '#16a34a', accent: '#22c55e' },
  { name: 'Rose Gold', bg1: '#7a463d', bg2: '#b87a6b', accent: '#e7b4a7' },
  { name: 'Nuit', bg1: '#1a1a2e', bg2: '#0f3460', accent: '#4cc9f0' },
  { name: 'Or', bg1: '#3a2c0a', bg2: '#b8860b', accent: '#f5c842' },
  { name: 'Rubis', bg1: '#3a0a14', bg2: '#9b1c31', accent: '#ff6b81' },
  { name: 'Violet', bg1: '#2a1a4a', bg2: '#7c3aed', accent: '#c084fc' },
  { name: 'Ocean', bg1: '#06283a', bg2: '#1d8ca8', accent: '#5ad1e6' },
  { name: 'Ardoise', bg1: '#0f172a', bg2: '#334155', accent: '#94a3b8' },
  { name: 'Rose', bg1: '#3a0a2a', bg2: '#db2777', accent: '#fb7eb8' },
];

// Assombrit / eclaircit une couleur hex (pct negatif = plus sombre).
export function shadeHex(hex: string, pct: number): string {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full || '000000', 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// Degrades de cartes cadeaux (apercu), cles = design.
export const GIFT_GRADIENTS: Record<string, [string, string]> = {
  violet: ['#7c3aed', '#4c1d95'],
  gold: ['#b8860b', '#3a2c0a'],
  teal: ['#0d9488', '#134e4a'],
  rose: ['#db2777', '#831843'],
  blue: ['#2563eb', '#1e3a8a'],
  noir: ['#1f2937', '#030712'],
  nuit: ['#0f3460', '#1a1a2e'],
  foret: ['#166534', '#052e16'],
  green: ['#16a34a', '#06210f'],
};

export function giftGradient(design?: string | null): [string, string] {
  return GIFT_GRADIENTS[String(design || 'violet')] || GIFT_GRADIENTS.violet;
}
