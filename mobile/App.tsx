// ============================================================
// MySargal Caisse - Point d'entree de l'application
// Chargement des polices, providers globaux (safe area, gestes, auth, reseau,
// toast) et navigateur racine.
// ============================================================

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  useFonts,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono';

import { AuthProvider } from './src/auth/AuthContext';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { NetworkProvider } from './src/offline/NetworkProvider';
import { ToastProvider } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Loading } from './src/components/Loading';
import { useAppStore } from './src/store/appStore';
import { colors } from './src/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    DMMono_500Medium,
  });

  const hydrateAppStore = useAppStore((s) => s.hydrate);
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    hydrateAppStore().finally(() => setStoreReady(true));
  }, [hydrateAppStore]);

  const ready = (fontsLoaded || fontError) && storeReady;

  if (!ready) {
    return (
      <SafeAreaProvider>
        <Loading label="Preparation de la caisse..." />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ToastProvider>
          <AuthProvider>
            <ThemeProvider>
              <NetworkProvider>
                <StatusBar style="dark" />
                <ErrorBoundary>
                  <RootNavigator />
                </ErrorBoundary>
              </NetworkProvider>
            </ThemeProvider>
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
