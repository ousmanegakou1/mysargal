// ============================================================
// MySargal Caisse - En-tete de page reutilisable
// Un bouton retour rond (cercle blanc, bordure discrete, ombre douce, icone
// Feather chevron-left) a gauche, un titre optionnel (+ sous-titre) a cote, et
// un emplacement optionnel a droite pour une action. Style clair et doux,
// coherent sur tous les ecrans pousses du stack. Le retour appelle goBack()
// (repli sur l'ecran racine si aucune pile de retour). Retour au toucher via
// PressableScale. Aucune dependance a reanimated.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { colors, fonts, shadow, spacing } from '../theme';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  /** Titre de la page (optionnel). */
  title?: string;
  /** Sous-titre discret sous le titre (optionnel). */
  subtitle?: string;
  /** Emplacement d'action a droite (optionnel). */
  right?: React.ReactNode;
  /** Icone du bouton retour (defaut chevron-left). */
  backIcon?: IconName;
  /** Surcharge du comportement retour (defaut navigation.goBack()). */
  onBack?: () => void;
  /** Masque le bouton retour si besoin (defaut affiche). */
  showBack?: boolean;
  /** Style additionnel du conteneur. */
  style?: StyleProp<ViewStyle>;
}

/**
 * En-tete uniforme place en haut des ecrans pousses (non-onglets).
 * Remplace les boutons retour/entetes heterogenes par un composant unique.
 */
export function PageHeader({
  title,
  subtitle,
  right,
  backIcon = 'chevron-left',
  onBack,
  showBack = true,
  style,
}: Props) {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={[styles.header, style]}>
      {showBack ? (
        <PressableScale
          onPress={handleBack}
          haptic="light"
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.backBtn}
          hitSlop={8}
        >
          <Icon name={backIcon} size={22} color={colors.tx} />
        </PressableScale>
      ) : null}

      {title || subtitle ? (
        <View style={styles.titleWrap}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.titleWrap} />
      )}

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  titleWrap: { flex: 1, justifyContent: 'center' },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.tx,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.tx2,
    marginTop: 2,
  },
  right: { marginLeft: spacing.sm },
});
