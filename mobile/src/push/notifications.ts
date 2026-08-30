// ============================================================
// MySargal Caisse - Notifications push (expo-notifications)
// Demande la permission, recupere le token Expo/natif et le renvoie pour
// enregistrement via register-device.
// ============================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

// Dans Expo Go (SDK 53+), le push distant a ete retire : on ne tente rien pour
// eviter les avertissements en boucle et toute instabilite. Le push reel marche
// dans un build de developpement / production.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Affichage des notifications au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface PushRegistration {
  token: string;
  platform: string;
}

export async function registerForPush(): Promise<PushRegistration | null> {
  // Pas de push dans Expo Go (retire du client) ni sur simulateur.
  if (isExpoGo || !Device.isDevice) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MySargal',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22c55e',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return { token: tokenData.data, platform: Platform.OS };
  } catch {
    return null;
  }
}

export function addNotificationListener(cb: (n: Notifications.Notification) => void) {
  return Notifications.addNotificationReceivedListener(cb);
}
