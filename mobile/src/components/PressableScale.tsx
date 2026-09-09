// ============================================================
// MySargal Caisse - Pressable anime reutilisable
// Effet d'enfoncement (scale + legere opacite) au ressort + retour haptique.
// IMPORTANT : on utilise le Pressable NATIF de React Native (pas gesture-handler),
// car les gestes gesture-handler ne fonctionnent pas dans un <Modal> sur Android
// (fenetre native separee du GestureHandlerRootView). Le Pressable natif, lui,
// marche partout, modals inclus. Animation via Animated (useNativeDriver).
// ============================================================

import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  ViewStyle,
  AccessibilityRole,
} from 'react-native';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

  return (
    <AnimatedPressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={
        disabled
          ? undefined
          : () => {
              fireHaptic();
              onPress?.();
            }
      }
      onLongPress={
        disabled || !onLongPress
          ? undefined
          : () => {
              tapMedium();
              onLongPress();
            }
      }
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        style,
        { transform: [{ scale }], opacity: disabled ? 0.45 : opacity },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
