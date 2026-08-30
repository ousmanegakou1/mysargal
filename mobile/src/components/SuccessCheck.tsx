// ============================================================
// MySargal Caisse - Animation de succes (coche au ressort)
// Une coche verte apparait avec un ressort satisfaisant + halo, combinee au
// confetti existant et a un haptique de succes. Sert apres un credit, un
// encaissement, une creation. Anime via l'API Animated de React Native
// (useNativeDriver, 100% stable). Respecte "reduire les animations".
// ============================================================

import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { colors, fonts, motion, radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Confetti } from './Confetti';
import { useReduceMotion } from '../utils/motion';
import { notifySuccess } from '../utils/haptics';

interface SuccessCheckProps {
  size?: number;
}

/** Badge coche anime seul (utilisable inline). */
export function SuccessCheck({ size = 72 }: SuccessCheckProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    notifySuccess();
    if (reduce) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: motion.springBouncy.stiffness,
      damping: motion.springBouncy.damping,
      mass: motion.springBouncy.mass,
    }).start();
    Animated.timing(ring, {
      toValue: 1,
      duration: 420,
      delay: 80,
      useNativeDriver: true,
    }).start();
  }, [reduce, scale, ring]);

  const badgeStyle = { transform: [{ scale }] };
  const ringStyle = {
    transform: [
      { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
    ],
    opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, backgroundColor: theme.accent },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.accentDark,
            alignItems: 'center',
            justifyContent: 'center',
          },
          theme.accentShadow,
          badgeStyle,
        ]}
      >
        <Icon name="check" size={size * 0.5} color={colors.onColor} />
      </Animated.View>
    </View>
  );
}

interface OverlayProps {
  show: boolean;
  title?: string;
  message?: string;
  onDone?: () => void;
  confetti?: boolean;
}

/**
 * Overlay plein ecran de succes : coche au ressort + confetti + message.
 * Appeler avec show=true apres une action reussie ; onDone se declenche apres
 * l'animation (utile pour fermer/naviguer).
 */
export function SuccessOverlay({ show, title, message, onDone, confetti = true }: OverlayProps) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (show) {
      if (reduce) {
        opacity.setValue(1);
      } else {
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.duration.fast,
          useNativeDriver: true,
        }).start();
      }
    } else {
      opacity.setValue(0);
    }
  }, [show, reduce, opacity]);

  if (!show) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      {confetti ? <Confetti show={show} onDone={onDone} /> : null}
      <View style={styles.card}>
        <SuccessCheck />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246,248,247,0.72)',
    zIndex: 2000,
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    borderRadius: radius.xl,
    backgroundColor: colors.s2,
    ...shadow.card,
    minWidth: 220,
  },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx, textAlign: 'center', marginTop: spacing.sm },
  message: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, textAlign: 'center', lineHeight: 20 },
});
