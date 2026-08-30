// ============================================================
// MySargal Caisse - Indicateur de chargement plein ecran
// ============================================================

import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={[colors.bg, colors.bg2, colors.bg]} style={StyleSheet.absoluteFill} />
      <ActivityIndicator size="large" color={t.accent} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.tx2 },
});
