// ============================================================
// MySargal Caisse - Confetti (retour visuel de succes)
// Reproduit l'effet confetti + haptique de l'app web apres un scan reussi.
// Rendu leger : 24 pieces animees qui tombent puis disparaissent.
// ============================================================

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions } from 'react-native';

const COLORS = ['#22c55e', '#16a34a', '#f5c842', '#4ade80', '#a78bfa'];
const COUNT = 24;

interface Props {
  show: boolean;
  onDone?: () => void;
}

export function Confetti({ show, onDone }: Props) {
  const { width, height } = Dimensions.get('window');
  const anim = useRef(new Animated.Value(0)).current;

  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }).map(() => ({
        left: Math.random() * width,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 250,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    [width, show]
  );

  useEffect(() => {
    if (!show) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 1600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDone?.());
  }, [show, anim, onDone]);

  if (!show) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, height * 0.9],
        });
        const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
        const rotate = anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.rotate + 360}deg`],
        });
        const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: p.left,
              width: p.size,
              height: p.size * 1.4,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
