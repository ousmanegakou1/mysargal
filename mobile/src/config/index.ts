// ============================================================
// MySargal Caisse - Configuration publique
// La cle anon Supabase est PUBLIQUE (role anon). Elle sert d'apikey et de
// Bearer par defaut avant l'ouverture de session. Aucun secret ici.
// ============================================================

export const SB_URL = 'https://iiocxlvcuoqafzlisqwd.supabase.co';

export const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2N4bHZjdW9xYWZ6bGlzcXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTgwODIsImV4cCI6MjA5MDkzNDA4Mn0.o-dRdHDGc5_IwCGhK5Ri67CCtZRj6J4evsxgBkMgvao';

export const FUNCTIONS_BASE = `${SB_URL}/functions/v1`;
export const REST_BASE = `${SB_URL}/rest/v1`;

// Application declaree cote register-device (le web utilise "merchant").
export const DEVICE_APP = 'merchant';

// Renouvellement silencieux de session : on rafraichit s'il reste moins de
// 15 jours sur les 30 jours glissants.
export const REFRESH_THRESHOLD_DAYS = 15;

// Lien de la carte client (pour partage eventuel).
export const CARD_BASE_URL = 'https://mysargal.com/c/';

// Cles de stockage securise / local.
export const STORAGE_KEYS = {
  token: 'ms_token',
  phone: 'ms_phone',
  merchant: 'ms_merchant',
  pinHash: 'ms_pin_hash',
  pinEnabled: 'ms_pin_enabled',
  offlineQueue: 'ms_offline_queue',
  clientsCache: 'ms_clients_cache',
  inbox: 'ms_inbox',
} as const;
