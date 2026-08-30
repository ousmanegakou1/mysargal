// ============================================================
// MySargal Caisse - Pressable anime reutilisable
// Effet d'enfoncement (scale + legere opacite) au ressort + retour haptique.
// Anime uniquement transform/opacity via l'API Animated integree de React
// Native (useNativeDriver) -> fluide et 100% stable, aucun module natif a
// aligner. Respecte "reduire les animations".
// ============================================================

import React, { useCallback, useRef } from 'react';
import {
  Animated,
  StyleProp,
  ViewStyle,
  AccessibilityRole,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { motion } from '../theme';
import { useReduceMotion } from '../utils/motion';
import { tapLight, tapMedium } from '../utils/haptics';

type Haptic = 'light' | 'medium' | 'none';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Facteur d'echelle a l'enfoncement (defaut 0.96). */
  scaleTo?: number;
  haptic?: Haptic;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  hitSlop?: number;
}

/**
 * Remplace Pressable/TouchableOpacity partout ou l'on veut un feedback tactile
 * premium (boutons, cartes, lignes de liste, puces).
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  scaleTo = motion.pressScale,
  haptic = 'light',
  accessibilityRole = 'button',
  accessibilityLabel,
  hitSlop,
}: Props) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const fireHaptic = useCallback(() => {
    if (haptic === 'light') tapLight();
    else if (haptic === 'medium') tapMedium();
  }, [haptic]);

  const setPressed = useCallback(
    (pressed: boolean) => {
      if (reduce) {
        opacity.setValue(pressed ? 0.75 : 1);
        return;
      }
      Animated.spring(scale, {
        toValue: pressed ? scaleTo : 1,
        useNativeDriver: true,
        stiffness: motion.press.stiffness,
        damping: motion.press.damping,
        mass: motion.press.mass,
      }).start();
      Animated.spring(opacity, {
        toValue: pressed ? 0.88 : 1,
        useNativeDriver: true,
        stiffness: motion.press.stiffness,
        damping: motion.press.damping,
        mass: motion.press.mass,
      }).start();
    },
    [reduce, scale, opacity, scaleTo]
  );

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(10000)
    .onBegin(() => {
      setPressed(true);
    })
    .onFinalize(() => {
      setPressed(false);
    })
    .onEnd(() => {
      fireHaptic();
      onPress?.();
    });

  const long = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(450)
    .onStart(() => {
      tapMedium();
      onLongPress?.();
    });

  const gesture = Gesture.Simultaneous(tap, long);

  const animatedStyle = {
    transform: [{ scale }],
    opacity: disabled ? 0.45 : opacity,
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[style, animatedStyle]}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        hitSlop={hitSlop}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
