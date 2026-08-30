// ============================================================
// MySargal Caisse - Squelettes animes (shimmer) pour les chargements
// Balayage lumineux (translateX d'un degrade) via l'API Animated de React
// Native (boucle, useNativeDriver) : proprietes GPU uniquement, 100% stable.
// Remplace les spinners sur les listes et le tableau de bord.
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  DimensionValue,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../theme';
import { useReduceMotion } from '../utils/motion';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloc squelette unitaire avec balayage shimmer. */
export function Skeleton({ width = '100%', height = 14, radius: r = 8, style }: SkeletonProps) {
  const reduce = useReduceMotion();
  const [w, setW] = React.useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce || w === 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, w, progress]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-(w || 200), w || 200],
  });

  return (
    <View
      onLayout={onLayout}
      style={[{ width, height, borderRadius: r, backgroundColor: colors.s3, overflow: 'hidden' }, style]}
    >
      {!reduce && w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Ligne squelette facon item de liste (avatar + deux lignes de texte). */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={48} height={48} radius={24} />
      <View style={styles.rowText}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={54} height={26} radius={13} />
    </View>
  );
}

/** Liste de plusieurs lignes squelette. */
export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

/** Bloc carte squelette (KPI, entete). */
export function SkeletonCard({ height = 96 }: { height?: number }) {
  return <Skeleton width="100%" height={height} radius={radius.lg} />;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: spacing.md,
  },
  rowText: { flex: 1, gap: 8 },
});
