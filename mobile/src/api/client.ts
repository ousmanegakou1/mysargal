// ============================================================
// MySargal Caisse - Client HTTP type
// Reproduit exactement les en-tetes de l'app marchande web :
//   - Edge Functions "points" (sbEdge)  : Authorization: Bearer <token>
//   - REST PostgREST (authH)             : apikey + Authorization: Bearer <token>
//   - Envoi/verif OTP                    : apikey uniquement (pas de session)
// Gestion 401 : tentative de refresh-session unique, sinon session expiree.
// ============================================================

import { SB_URL, SB_ANON, FUNCTIONS_BASE, REST_BASE } from '../config';
import { ApiError, RefreshSessionResponse } from './types';

// --- Etat d'authentification partage (pilote par AuthContext) ---
let authToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let onTokenRefreshed: ((token: string) => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}
export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}
export function setOnTokenRefreshed(cb: ((token: string) => void) | null) {
  onTokenRefreshed = cb;
}

function bearer(): string {
  return authToken || SB_ANON;
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function looksLikeSessionError(data: any): boolean {
  const msg = String((data && (data.error || data.message)) || '');
  return /session/i.test(msg) || /jeton/i.test(msg) || /jwt/i.test(msg) || /expir/i.test(msg);
}

// Refresh silencieux : renvoie un nouveau token ou null.
async function tryRefresh(): Promise<string | null> {
  if (!authToken) return null;
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/refresh-session`, {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const d = (await parseJson(res)) as RefreshSessionResponse;
    if (d && d.token) {
      authToken = d.token;
      onTokenRefreshed?.(d.token);
      return d.token;
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Appel Edge Function (fonctions "points" : add-points, get-points, ...)
// ------------------------------------------------------------
export async function edge<T = any>(
  fn: string,
  body?: unknown,
  opts: { method?: string; withApiKey?: boolean; retried?: boolean } = {}
): Promise<T> {
  const method = opts.method || 'POST';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer()}`,
  };
  if (opts.withApiKey) headers.apikey = SB_ANON;

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError('Pas de connexion. Verifie ton reseau.', 0);
  }

  const data = await parseJson(res);

  if (res.status === 401 && !opts.retried) {
    if (looksLikeSessionError(data)) {
      const fresh = await tryRefresh();
      if (fresh) return edge<T>(fn, body, { ...opts, retried: true });
      onSessionExpired?.();
      throw new ApiError('Session expiree. Reconnecte-toi avec ton numero.', 401);
    }
  }

  if (!res.ok || (data && data.error)) {
    throw new ApiError(
      (data && (data.error || data.message)) || 'Erreur inattendue',
      res.status,
      data && data.tentatives_restantes
    );
  }
  return data as T;
}

// ------------------------------------------------------------
// Appels PostgREST (lecture / ecriture directe des tables)
// ------------------------------------------------------------
function restHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SB_ANON,
    Authorization: `Bearer ${bearer()}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function restGet<T = any>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${REST_BASE}${path}`, { headers: restHeaders() });
  } catch {
    throw new ApiError('Pas de connexion. Verifie ton reseau.', 0);
  }
  const data = await parseJson(res);
  if (res.status === 401) {
    const fresh = await tryRefresh();
    if (fresh) {
      const retry = await fetch(`${REST_BASE}${path}`, { headers: restHeaders() });
      return (await parseJson(retry)) as T;
    }
    onSessionExpired?.();
    throw new ApiError('Session expiree. Reconnecte-toi.', 401);
  }
  if (!res.ok) throw new ApiError((data && data.message) || 'Erreur de lecture', res.status);
  return data as T;
}

export async function restPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${REST_BASE}${path}`, {
    method: 'POST',
    headers: restHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new ApiError((data && data.message) || 'Erreur ecriture', res.status);
  return data as T;
}

// PATCH direct d'une ou plusieurs lignes (PostgREST).
export async function restPatch<T = any>(
  path: string,
  body: unknown,
  opts: { minimal?: boolean } = {}
): Promise<T> {
  const res = await fetch(`${REST_BASE}${path}`, {
    method: 'PATCH',
    headers: restHeaders({ Prefer: opts.minimal ? 'return=minimal' : 'return=representation' }),
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new ApiError((data && data.message) || 'Erreur de mise a jour', res.status);
  return data as T;
}

// DELETE direct (PostgREST).
export async function restDelete(path: string): Promise<void> {
  const res = await fetch(`${REST_BASE}${path}`, {
    method: 'DELETE',
    headers: restHeaders({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new ApiError((data && data.message) || 'Suppression impossible', res.status);
  }
}

// Appel RPC PostgREST (/rest/v1/rpc/<fn>). Retourne le corps (souvent un
// scalaire, un objet ou un tableau selon la fonction Postgres).
export async function rpc<T = any>(fn: string, body: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${REST_BASE}/rpc/${fn}`, {
      method: 'POST',
      headers: restHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Pas de connexion. Verifie ton reseau.', 0);
  }
  const data = await parseJson(res);
  if (res.status === 401) {
    const fresh = await tryRefresh();
    if (fresh) {
      const retry = await fetch(`${REST_BASE}/rpc/${fn}`, {
        method: 'POST',
        headers: restHeaders(),
        body: JSON.stringify(body),
      });
      return (await parseJson(retry)) as T;
    }
    onSessionExpired?.();
    throw new ApiError('Session expiree. Reconnecte-toi.', 401);
  }
  if (!res.ok || (data && data.error)) {
    throw new ApiError((data && (data.error || data.message)) || 'Operation impossible', res.status);
  }
  return data as T;
}

// Envoi d'un fichier binaire vers Supabase Storage (upsert). Renvoie l'URL
// publique. Utilise pour le logo de la boutique (bucket "merchants").
export async function storageUpload(
  objectPath: string,
  bytes: Blob | ArrayBuffer,
  contentType: string
): Promise<string> {
  const res = await fetch(`${SB_URL}/storage/v1/object/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${bearer()}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes as any,
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new ApiError((data && (data.error || data.message)) || 'Envoi du fichier impossible', res.status);
  }
  return `${SB_URL}/storage/v1/object/public/${objectPath}`;
}

// ------------------------------------------------------------
// Envoi / verification OTP (apikey uniquement, aucune session)
// ------------------------------------------------------------
export async function edgePublic<T = any>(fn: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Pas de connexion. Verifie ton reseau.', 0);
  }
  const data = await parseJson(res);
  if (!res.ok || (data && data.error)) {
    throw new ApiError(
      (data && (data.error || data.message)) || 'Erreur',
      res.status,
      data && data.tentatives_restantes
    );
  }
  return data as T;
}

// Refresh expose (utilise au demarrage par AuthContext)
export async function refreshSession(token: string): Promise<RefreshSessionResponse | null> {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/refresh-session`, {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await parseJson(res)) as RefreshSessionResponse;
  } catch {
    return null;
  }
}
