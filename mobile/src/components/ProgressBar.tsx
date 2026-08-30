// ============================================================
// MySargal Caisse - Barre de progression vers la recompense
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  pct: number; // 0..100
  height?: number;
  ready?: boolean;
}

export function ProgressBar({ pct, height = 12, ready }: Props) {
  const t = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, pct));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: clamped,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [clamped, anim]);

  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View style={[styles.fillWrap, { width, borderRadius: height }]}>
        <LinearGradient
          colors={ready ? [colors.gold, colors.gold2] : [t.accentDark, t.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: height }]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.s4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.b1,
  },
  fillWrap: { height: '100%' },
});
