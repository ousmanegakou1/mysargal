// ============================================================
// MySargal Caisse - Utilitaires de mouvement
// Respect de la preference systeme "reduire les animations".
// ============================================================

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Retourne true si l'utilisateur a active "reduire les animations" au niveau
 * du systeme. On coupe alors les animations non essentielles (glissements,
 * ressorts d'apparition, shimmer, count-up) et on affiche l'etat final direct.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduce(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
