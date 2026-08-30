// ============================================================
// MySargal Caisse - Badge de statut (tier, etat, en attente...)
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, IconName } from './Icon';

type Tone = 'green' | 'gold' | 'red' | 'neutral' | 'violet';

interface Props {
  label: string;
  tone?: Tone;
  icon?: IconName;
  small?: boolean;
}

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  green: { bg: colors.greenSoft, fg: colors.green3, border: colors.b3 },
  gold: { bg: colors.goldSoft, fg: colors.gold, border: 'rgba(245,200,66,0.35)' },
  red: { bg: colors.redSoft, fg: colors.red, border: 'rgba(239,68,68,0.35)' },
  violet: { bg: 'rgba(167,139,250,0.14)', fg: colors.violet, border: 'rgba(167,139,250,0.35)' },
  neutral: { bg: colors.s3, fg: colors.tx2, border: colors.b2 },
};

export function StatusBadge({ label, tone = 'neutral', icon, small }: Props) {
  const theme = useTheme();
  const t =
    tone === 'green'
      ? { bg: theme.accentSoftBg, fg: theme.accentDark, border: theme.accentBorder }
      : TONES[tone];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.bg, borderColor: t.border },
        small && styles.small,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 12 : 13} color={t.fg} /> : null}
      <Text style={[styles.txt, { color: t.fg }, small && styles.txtSmall]}>{label}</Text>
    </View>
  );
}

const TIER_LABELS: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  bronze: { label: 'Bronze', tone: 'gold', icon: 'award' },
  silver: { label: 'Argent', tone: 'neutral', icon: 'award' },
  gold: { label: 'Or', tone: 'gold', icon: 'award' },
  platinum: { label: 'Platine', tone: 'violet', icon: 'award' },
};

export function TierBadge({ tier }: { tier?: string | null }) {
  const key = String(tier || 'bronze').toLowerCase();
  const conf = TIER_LABELS[key] || { label: tier || 'Membre', tone: 'neutral' as Tone, icon: 'award' as IconName };
  return <StatusBadge label={conf.label} tone={conf.tone} icon={conf.icon} small />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 9, paddingVertical: 4 },
  txt: { fontFamily: fonts.bodyBold, fontSize: 12.5 },
  txtSmall: { fontSize: 11 },
});
