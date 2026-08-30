// ============================================================
// MySargal Caisse - Feuille d'action (bottom sheet)
// Feuille glissante basee sur le composant Modal de React Native + l'API
// Animated integree : glisse depuis le bas, backdrop assombri, poignee
// glissable (drag vers le bas pour fermer). Aucun module natif a aligner,
// 100% stable partout. Pilotee par une prop `visible` pour se cabler
// simplement sur l'etat existant des ecrans, sans changer la logique metier.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, motion, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Conserve pour compatibilite d'API ; la feuille s'ajuste a son contenu. */
  snapPoints?: (string | number)[];
}

export function ActionSheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  // On garde la Modal montee pendant l'animation de sortie.
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(600)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        stiffness: motion.springSoft.stiffness,
        damping: motion.springSoft.damping,
        mass: motion.springSoft.mass,
      }),
      Animated.timing(backdrop, {
        toValue: 1,
        duration: motion.duration.base,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdrop]);

  const animateOut = useCallback(
    (done?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 600,
          duration: motion.duration.base,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: motion.duration.fast,
          useNativeDriver: true,
        }),
      ]).start(() => done?.());
    },
    [translateY, backdrop]
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(600);
      backdrop.setValue(0);
      // Laisse la Modal se monter avant d'animer l'entree.
      requestAnimationFrame(() => animateIn());
    } else if (mounted) {
      animateOut(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Poignee glissable : drag vers le bas pour fermer.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.8) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: motion.springSoft.stiffness,
            damping: motion.springSoft.damping,
            mass: motion.springSoft.mass,
          }).start();
        }
      },
    })
  ).current;

  if (!mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handleZone} {...panResponder.panHandlers}>
            <View style={styles.indicator} />
          </View>
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.s1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handleZone: { alignItems: 'center', paddingVertical: spacing.sm },
  indicator: { backgroundColor: colors.b2, width: 44, height: 5, borderRadius: 3 },
  header: { paddingBottom: spacing.sm },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.tx },
});
