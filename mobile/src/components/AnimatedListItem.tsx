// ============================================================
// MySargal Caisse - Entree animee d'item de liste
// Apparition en fondu + leger glissement vers le haut, en cascade (stagger)
// selon l'index. Clients, recompenses, cartes cadeaux, journal.
// Anime opacity/transform via l'API Animated de React Native (useNativeDriver,
// 100% stable). Respecte "reduire les animations".
// ============================================================

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../theme';
import { useReduceMotion } from '../utils/motion';

interface Props {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  /** Plafond du decalage pour ne pas trop retarder les longues listes. */
  maxIndex?: number;
}

export function AnimatedListItem({ children, index = 0, style, maxIndex = 12 }: Props) {
  const reduce = useReduceMotion();
  const i = Math.min(index, maxIndex);
  const delay = i * motion.stagger;
  const progress = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduce, delay, progress]);

  if (reduce) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/** Variante fondu simple (sans glissement), pour les blocs de dashboard. */
export function FadeInView({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduce, delay, progress]);

  if (reduce) return <Animated.View style={style}>{children}</Animated.View>;

  return (
    <Animated.View style={[style, { opacity: progress }]}>{children}</Animated.View>
  );
}
