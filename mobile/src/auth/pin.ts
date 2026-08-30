// ============================================================
// MySargal Caisse - Code PIN local (4 chiffres)
// Permet de rouvrir vite l'app entre vendeurs sans repasser par l'OTP.
// Le PIN n'est JAMAIS stocke en clair : seul son hash salte est conserve
// en zone securisee (expo-secure-store). L'OTP reste requis pour l'activer.
// ============================================================

import * as SecureStore from 'expo-secure-store';
import { sha256 } from '../utils/sha256';
import { STORAGE_KEYS } from '../config';

const SALT = 'mysargal.caisse.pin.v1';

function hashPin(pin: string): string {
  return sha256(SALT + ':' + pin);
}

export async function setPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.pinHash, hashPin(pin));
  await SecureStore.setItemAsync(STORAGE_KEYS.pinEnabled, '1');
}

export async function disablePin(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.pinHash);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.pinEnabled);
}

export async function isPinEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_KEYS.pinEnabled);
  return v === '1';
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.pinHash);
  if (!stored) return false;
  return stored === hashPin(pin);
}

// --- Code PIN de sortie du mode kiosque (libre service) ---
const KIOSK_KEY = 'ms_kiosk_pin_hash';

export async function hasKioskPin(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KIOSK_KEY);
  return !!v;
}
export async function setKioskPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(KIOSK_KEY, hashPin('kiosk:' + pin));
}
export async function verifyKioskPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(KIOSK_KEY);
  if (!stored) return false;
  return stored === hashPin('kiosk:' + pin);
}
