// ============================================================
// MySargal Caisse - Carte / conteneur de section
// ============================================================

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, spacing, shadow } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated }: Props) {
  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        elevated && shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  padded: { padding: spacing.lg },
});
