// ============================================================
// MySargal Caisse - Fond d'application reutilisable
// Rend le fond choisi (uni doux par defaut du theme, palette sobre, ou image
// discrete avec voile blanc). Pose en absoluteFill DERRIERE le contenu, sans
// nuire a la lisibilite des cartes. Utilise par Screen et par les ecrans qui
// gerent leur propre conteneur (fiche client, nouvelle carte).
// ============================================================

import React from 'react';
import { View, StyleSheet, ImageBackground } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { BACKGROUND_IMAGE_VEIL, BACKGROUND_IMAGE_OPACITY } from '../theme/backgrounds';

export function AppBackground() {
  const { background } = useTheme();

  if (background.imageUri) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: background.color }]} pointerEvents="none">
        <ImageBackground
          source={{ uri: background.imageUri }}
          style={StyleSheet.absoluteFill}
          imageStyle={{ opacity: BACKGROUND_IMAGE_OPACITY }}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BACKGROUND_IMAGE_VEIL }]} />
      </View>
    );
  }

  return <View style={[StyleSheet.absoluteFill, { backgroundColor: background.color }]} pointerEvents="none" />;
}
