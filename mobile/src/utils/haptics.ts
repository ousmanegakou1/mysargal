// ============================================================
// MySargal Caisse - Feedback haptique (enveloppe expo-haptics)
// Silencieux si le module n'est pas disponible (web, simulateur).
// ============================================================

import * as Haptics from 'expo-haptics';

export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function tapMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
export function tapHeavy() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}
export function notifySuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function notifyWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
export function notifyError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
