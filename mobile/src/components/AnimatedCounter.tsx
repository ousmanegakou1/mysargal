// ============================================================
// MySargal Caisse - Compteur anime (count up)
// Anime les chiffres (points, solde, KPIs) quand la valeur change.
//
// Implementation 100% JS et sure pour la New Architecture : on anime le nombre
// via requestAnimationFrame et un simple useState, puis on rend un <Text>.
// On EVITE volontairement le pattern d'un TextInput dont on animerait le texte
// via une prop native, qui provoque un crash natif connu sur Fabric.
// Respecte "reduire les animations".
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useReduceMotion } from '../utils/motion';

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Texte ajoute apres le nombre (ex. " pts", " FCFA"). */
  suffix?: string;
  prefix?: string;
  /** Duree de l'animation (ms). */
  duration?: number;
  /** Grouper les milliers avec une espace fine. */
  group?: boolean;
}

/** Formate un entier avec separation des milliers. */
function formatInt(n: number, group: boolean): string {
  const rounded = Math.round(n);
  const neg = rounded < 0;
  let s = Math.abs(rounded).toFixed(0);
  if (group) {
    let out = '';
    let c = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      c++;
      if (c % 3 === 0 && i > 0) out = ' ' + out;
    }
    s = out;
  }
  return neg ? '-' + s : s;
}

// Adoucissement identique a l'ancien Easing.out(Easing.cubic).
function easeOutCubic(t: number): number {
  const c = t - 1;
  return c * c * c + 1;
}

export function AnimatedCounter({
  value,
  style,
  suffix = '',
  prefix = '',
  duration = 700,
  group = true,
}: Props) {
  const reduce = useReduceMotion();
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    // Annule toute animation en cours (evite d'ecrire apres un demontage).
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = fromRef.current;
    const end = value;

    if (reduce || start === end || duration <= 0) {
      fromRef.current = end;
      setDisplay(end);
      return;
    }

    const startTime = Date.now();
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const current = start + (end - start) * easeOutCubic(t);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = end;
        setDisplay(end);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, reduce, duration]);

  return (
    <Text style={[baseStyle, style]} allowFontScaling={false}>
      {prefix + formatInt(display, group) + suffix}
    </Text>
  );
}

const baseStyle = { padding: 0, margin: 0, includeFontPadding: false } as const;
