// ============================================================
// MySargal Caisse - Utilitaires de formatage
// ============================================================

export function onlyDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

// Formate un montant en franc CFA (ou devise fournie).
export function fmtMoney(amount: number, currency = 'FCFA'): string {
  const n = Math.round(Number(amount) || 0);
  const s = n.toLocaleString('fr-FR').replace(/ /g, ' ');
  return `${s} ${currency}`;
}

// Formate un nombre de points.
export function fmtPts(n: number): string {
  return (Number(n) || 0).toLocaleString('fr-FR').replace(/ /g, ' ');
}

// Premier prenom.
export function firstName(full?: string | null): string {
  return String(full || '').trim().split(/\s+/)[0] || 'Client';
}

// Initiales pour avatar.
export function initials(full?: string | null): string {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Date/heure courte fr.
export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// Vrai si l'ISO tombe aujourd'hui (heure locale).
export function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Masque un numero de telephone pour l'affichage comptoir (RGPD).
export function maskLabel(phone?: string | null): string {
  const s = String(phone || '').trim();
  if (!s) return '';
  const d = onlyDigits(s);
  if (d.length < 4) return s;
  return '••• ••• ' + d.slice(-2);
}

// Extrait un code de carte depuis un texte scanne (URL ?code=... ou code brut).
export function extractCode(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/[?&]code=([^&\s]+)/i);
  if (m) return decodeURIComponent(m[1]).toUpperCase();
  // Sinon on prend le dernier segment non vide.
  const last = s.split(/[\/\s]/).filter(Boolean).pop() || s;
  return last.toUpperCase();
}

// Extrait le nombre de jours restants d'un JWT (claim exp).
export function jwtDaysLeft(token?: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b + '='.repeat((4 - (b.length % 4)) % 4);
    const json = JSON.parse(decodeB64(pad));
    if (!json.exp) return null;
    return (json.exp * 1000 - Date.now()) / 86400000;
  } catch {
    return null;
  }
}

// Decodage base64 sans dependance (atob n'existe pas partout en RN).
function decodeB64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let out = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return out;
}
