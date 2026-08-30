// ============================================================
// MySargal Caisse - Conteneur d'ecran (fond degrade + safe area)
// ============================================================

import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { AppBackground } from './AppBackground';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
}

export function Screen({
  children,
  scroll,
  refreshing,
  onRefresh,
  padded = true,
  edges = ['top'],
  contentStyle,
  keyboardAvoiding,
}: Props) {
  const theme = useTheme();
  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[padded && styles.padded, styles.grow, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  // Fond de l'app (uni doux du theme, palette sobre, ou image discrete avec
  // voile blanc) pose derriere le contenu ; les cartes restent lisibles.
  return (
    <View style={styles.flex}>
      <AppBackground />
      <SafeAreaView style={styles.flex} edges={edges}>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {inner}
          </KeyboardAvoidingView>
        ) : (
          inner
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: spacing.lg },
});
