// ============================================================
// MySargal Caisse - Navigateur racine
// Aiguille selon l'etat d'authentification : chargement, connexion, verrou
// PIN, ou application. Enregistre le device push une fois connecte.
// ============================================================

import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { RootStackParamList } from './types';
import { colors } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { Loading } from '../components/Loading';
import { Tabs } from './Tabs';
import { LoginScreen } from '../screens/LoginScreen';
import { PinLockScreen } from '../screens/PinLockScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { ClientScreen } from '../screens/ClientScreen';
import { KioskScreen } from '../screens/KioskScreen';
import { NewClientScreen } from '../screens/NewClientScreen';
import { PushScreen } from '../screens/PushScreen';
import { SummitScreen } from '../screens/SummitScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { GiftCardsScreen } from '../screens/GiftCardsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { registerForPush, addNotificationListener } from '../push/notifications';
import { useAppStore } from '../store/appStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status, setPushToken } = useAuth();
  const theme = useTheme();

  const navTheme = React.useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.bg,
        card: colors.s1,
        text: colors.tx,
        primary: theme.accent,
        border: colors.b2,
      },
    }),
    [theme.bg, theme.accent]
  );

  // Enregistrement push une seule fois par session active (evite toute boucle
  // d'effet si setPushToken change d'identite entre les rendus).
  const pushDone = React.useRef(false);
  useEffect(() => {
    if (status !== 'authenticated') {
      pushDone.current = false;
      return;
    }
    if (pushDone.current) return;
    pushDone.current = true;
    let sub: { remove: () => void } | undefined;
    (async () => {
      const reg = await registerForPush();
      if (reg) await setPushToken(reg.token, reg.platform);
      // Chaque notification recue est archivee dans la boite de reception.
      sub = addNotificationListener((n) => {
        const content = n?.request?.content;
        const title = content?.title || 'Notification';
        const body = content?.body || '';
        useAppStore.getState().addInbox({ title, body });
      });
    })();
    return () => sub?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading') {
    return <Loading label="Ouverture de la caisse..." />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: 'slide_from_right',
        }}
      >
        {status === 'unauthenticated' ? (
          <Stack.Screen name="Tabs" component={LoginScreen} />
        ) : status === 'locked' ? (
          <Stack.Screen name="Tabs" component={PinLockScreen} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Kiosk"
              component={KioskScreen}
              options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen name="Client" component={ClientScreen} />
            <Stack.Screen
              name="NewClient"
              component={NewClientScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="GiftCards" component={GiftCardsScreen} />
            <Stack.Screen name="More" component={MoreScreen} />
            <Stack.Screen name="Push" component={PushScreen} />
            <Stack.Screen name="Summit" component={SummitScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
