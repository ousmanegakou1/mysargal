// ============================================================
// MySargal Caisse - Messages et partages WhatsApp / SMS / lien
// L'app web ouvre wa.me / sms: / clipboard. En natif on utilise Linking
// (WhatsApp, SMS, telephone, paiement Wave) et le partage systeme + presse
// papiers pour les liens de carte.
// ============================================================

import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { onlyDigits, firstName } from './format';
import { fmtAmount } from './currency';
import { CARD_BASE_URL } from '../config';

// Lien public d'une carte de fidelite.
export function cardUrl(code: string): string {
  return `${CARD_BASE_URL}?code=${encodeURIComponent(code)}`;
}
// Lien d'ouverture d'une carte cadeau.
export function giftUrl(code: string): string {
  return `https://mysargal.com/giftcard.html?code=${encodeURIComponent(code)}`;
}
// Lien de consultation de solde d'une carte cadeau.
export function giftBalanceUrl(code: string): string {
  return `https://mysargal.com/solde?c=${encodeURIComponent(code)}`;
}

// Messages types (fr) alignes sur MS_MSG de l'app web.
export const WA_MESSAGES = {
  bienvenue: (nom: string, boutique: string, lien: string) =>
    `Bonjour ${nom} ! Bienvenue chez ${boutique}. Voici votre carte de fidelite : ${lien}. A chaque achat, cumulez des points et gagnez des recompenses.`,
  carte: (nom: string, boutique: string, lien: string) =>
    `Bonjour ${nom}, voici votre carte de fidelite ${boutique} : ${lien}. Presentez-la a chaque passage pour cumuler vos points.`,
  presque: (nom: string, reste: number, boutique: string) =>
    `Bonjour ${nom}, plus que ${reste} point(s) pour debloquer votre recompense chez ${boutique} !`,
  recompense: (nom: string, boutique: string) =>
    `Felicitations ${nom} ! Votre recompense est prete chez ${boutique}. Passez la recuperer.`,
  relance: (nom: string, boutique: string) =>
    `Bonjour ${nom}, cela fait un moment qu'on ne vous a pas vu chez ${boutique}. Vos points vous attendent, on vous revoit bientot ?`,
  cadeau: (qui: string, montant: string, boutique: string, lien: string) =>
    `${qui} vous offre une carte cadeau de ${montant} a utiliser chez ${boutique}. Ouvrez-la ici : ${lien}`,
  boost: (boutique: string, x: number, date: string) =>
    `Points x${x} chez ${boutique} jusqu'au ${date} ! Profitez-en : chaque achat rapporte ${x} fois plus de points.`,
};

// Ouvre WhatsApp vers un numero (ou diffusion si vide), message pre rempli.
export async function openWhatsApp(phone: string | null | undefined, message: string): Promise<void> {
  const d = onlyDigits(phone);
  const url = d
    ? `https://wa.me/${d}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
  } catch {
    /* WhatsApp absent : on ignore */
  }
}

// Ouvre l'app SMS avec le message.
export async function openSMS(phone: string | null | undefined, message: string): Promise<void> {
  const d = onlyDigits(phone);
  const url = `sms:${d}?body=${encodeURIComponent(message)}`;
  await Linking.openURL(url).catch(() => {});
}

// Appel telephonique.
export async function callPhone(phone: string): Promise<void> {
  await Linking.openURL(`tel:${onlyDigits(phone)}`).catch(() => {});
}

// Ouvre un lien externe (Wave, site, etc.).
export async function openUrl(url: string): Promise<void> {
  await Linking.openURL(url).catch(() => {});
}

// Copie un texte dans le presse papiers.
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text).catch(() => {});
}

// Partage systeme d'un texte / lien.
export async function shareText(message: string, title?: string): Promise<void> {
  try {
    await Share.share({ message, title });
  } catch {
    /* annule */
  }
}

// Helper : premier prenom pour les messages.
export { firstName };
export { fmtAmount };
