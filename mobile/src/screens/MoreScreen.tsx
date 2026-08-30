// ============================================================
// MySargal Caisse - Menu "Plus"
// Regroupe les fonctions secondaires (Recompenses, Notifications, Summit Club,
// Journal, Reglages) pour garder la barre d'onglets legere en caisse.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { OfflineBanner } from '../components/OfflineBanner';
import { Icon, IconName } from '../components/Icon';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import { tapLight } from '../utils/haptics';
import { programName } from '../utils/member';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Item {
  icon: IconName;
  label: string;
  sub: string;
  to: keyof RootStackParamList;
}

const ITEMS: Item[] = [
  { icon: 'bar-chart-2', label: 'Dashboard', sub: 'Statistiques et analytics', to: 'Dashboard' },
  { icon: 'send', label: 'Notifications', sub: 'Campagnes push, WhatsApp, email', to: 'Push' },
  { icon: 'award', label: 'Club Privilèges', sub: 'Niveaux, membres, statuts', to: 'Summit' },
  { icon: 'gift', label: 'Cartes cadeaux', sub: 'Creer et gerer les cartes', to: 'GiftCards' },
  { icon: 'monitor', label: 'Mode kiosque', sub: 'Borne libre-service client', to: 'Kiosk' },
  { icon: 'file-text', label: 'Journal', sub: 'Operations du jour', to: 'History' },
];

export function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const { merchant } = useAuth();
  const { pendingCount } = useNetwork();
  const theme = useTheme();

  return (
    <Screen scroll padded contentStyle={styles.content}>
      <PageHeader title="Plus d'outils" subtitle="Fonctions avancees de votre boutique." />

      <OfflineBanner />

      <Card style={styles.shopCard}>
        <View style={styles.shopHead}>
          <View style={[styles.shopAvatar, { backgroundColor: theme.accentSoftBg }]}>
            <Icon name="shopping-bag" size={22} color={theme.accentDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shopName} numberOfLines={1}>
              {merchant?.name || 'Ma boutique'}
            </Text>
            <Text style={styles.shopMeta} numberOfLines={1}>
              {typeof merchant?.brand === 'string' && merchant.brand ? merchant.brand : 'MySargal'}
            </Text>
          </View>
          {merchant?.plan ? <StatusBadge label={String(merchant.plan).toUpperCase()} tone="green" small /> : null}
        </View>
      </Card>

      <View style={styles.list}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.to}
            style={styles.item}
            onPress={() => {
              tapLight();
              navigation.navigate(it.to as any);
            }}
          >
            <View style={styles.itemIcon}>
              <Icon name={it.icon} size={22} color={theme.accentDark} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemLabel} numberOfLines={1}>{it.to === 'Summit' ? programName(merchant) : it.label}</Text>
                {it.to === 'History' && pendingCount > 0 ? (
                  <StatusBadge label={`${pendingCount} en attente`} tone="gold" small />
                ) : null}
              </View>
              <Text style={styles.itemSub} numberOfLines={1}>{it.sub}</Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.tx3} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx, letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },
  shopCard: {},
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shopAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.b2,
  },
  shopName: { fontFamily: fonts.heading, fontSize: 18, color: colors.tx },
  shopMeta: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.tx3, marginTop: 2 },
  list: { gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 16,
  },
  itemIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.s3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconTxt: { fontSize: 22 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemLabel: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.tx },
  itemSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx3, marginTop: 2 },
  chevron: { fontFamily: fonts.heading, fontSize: 24, color: colors.tx3 },
});
