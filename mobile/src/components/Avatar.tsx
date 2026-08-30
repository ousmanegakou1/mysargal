// ============================================================
// MySargal Caisse - Avatar par initiales
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { initials } from '../utils/format';

interface Props {
  name?: string | null;
  size?: number;
}

export function Avatar({ name, size = 54 }: Props) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={[t.accent, t.accentDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.inner, { borderRadius: size / 2 - 2 }]}>
        <Text style={[styles.txt, { fontSize: size * 0.34, color: t.accentDark }]}>{initials(name)}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  inner: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.s1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    width: '100%',
  },
  txt: { fontFamily: fonts.heading },
});
