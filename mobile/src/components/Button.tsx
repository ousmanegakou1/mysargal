// ============================================================
// MySargal Caisse - Bouton tactile (grand format comptoir)
// Enfoncement anime au ressort (scale + opacite) + haptique via PressableScale.
// ============================================================

import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, fonts, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  large?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  full = true,
  style,
  large,
}: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? theme.accent : colors.onColor} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={large ? 20 : 18} color={textColor(variant).color} /> : null}
          <Text style={[styles.label, textColor(variant), large && styles.labelLarge]}>
            {label}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'primary') {
    return (
      <PressableScale
        onPress={onPress}
        disabled={isDisabled}
        accessibilityLabel={label}
        style={[full && styles.full, styles.base, large && styles.baseLarge, theme.accentShadow, style]}
      >
        <LinearGradient
          colors={[theme.accent, theme.accentDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, large && styles.baseLarge]}
        >
          {content}
        </LinearGradient>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      style={[
        full && styles.full,
        styles.base,
        styles.baseInner,
        large && styles.baseLarge,
        variantStyle(variant),
        style,
      ]}
    >
      {content}
    </PressableScale>
  );
}

function textColor(variant: Variant) {
  switch (variant) {
    case 'primary':
      return { color: colors.onColor };
    case 'gold':
      return { color: '#2a1e00' };
    case 'danger':
      return { color: colors.red };
    case 'ghost':
      return { color: colors.tx2 };
    default:
      return { color: colors.tx };
  }
}

function variantStyle(variant: Variant): ViewStyle {
  switch (variant) {
    case 'secondary':
      return { backgroundColor: colors.s3, borderWidth: 1, borderColor: colors.b2 };
    case 'ghost':
      return { backgroundColor: 'transparent' };
    case 'danger':
      return { backgroundColor: colors.redSoft, borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)' };
    case 'gold':
      return { backgroundColor: colors.gold, ...shadow.gold };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  base: {
    borderRadius: radius.md,
    overflow: 'hidden',
    minHeight: 54,
  },
  baseInner: { alignItems: 'center', justifyContent: 'center' },
  baseLarge: { minHeight: 64, borderRadius: radius.lg },
  gradient: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  label: { fontFamily: fonts.bodyBold, fontSize: 16 },
  labelLarge: { fontSize: 18 },
  icon: { fontSize: 18 },
});
