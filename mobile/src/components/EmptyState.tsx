// ============================================================
// MySargal Caisse - Etat vide
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Icon, IconName } from './Icon';

interface Props {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction }: Props) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: t.accentSoftBg }]}>
        <Icon name={icon} size={30} color={t.accentDark} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" full={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: 8 },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.b2,
    marginBottom: 8,
  },
  title: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.tx, textAlign: 'center' },
  message: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, textAlign: 'center', lineHeight: 20 },
  action: { marginTop: spacing.md },
});
