// ============================================================
// MySargal Caisse - Icone vectorielle (famille unique Feather)
// Une seule famille pour toute l'app -> rendu premium et coherent,
// aligne sur les pictogrammes fins de la plateforme web marchande.
// ============================================================

import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 20, color = colors.tx, style }: Props) {
  return <Feather name={name} size={size} color={color} style={style} />;
}
