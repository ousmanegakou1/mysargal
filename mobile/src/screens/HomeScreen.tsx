// ============================================================
// MySargal Caisse - Accueil (design premium clair et doux)
// Porte fidelement la maquette MySargal-Accueil-Anime :
//   en-tete (logo + salutation + cloche), carte "Points aujourd'hui" avec grand
//   compteur qui monte, bouton plein "Scanner une carte" qui respire, cartes de
//   navigation (Clients / Recompenses / Cartes cadeaux / Tableau de bord),
//   section "Activite recente" (vraies transactions).
// Entree en cascade (fondu + glissement). Accent + fond dynamiques via useTheme.
// Aucun endpoint modifie : memes appels (transactions, cartes, cartes cadeaux).
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { Icon, IconName } from '../components/Icon';
import { OfflineBanner } from '../components/OfflineBanner';
import { PressableScale } from '../components/PressableScale';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { SkeletonList } from '../components/Skeleton';
import { colors, fonts, radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthContext';
import { useAppStore } from '../store/appStore';
import { useNetwork } from '../offline/NetworkProvider';
import { fetchTransactions, fetchCards, fetchGiftCards } from '../api/endpoints';
import { Transaction, LoyaltyCardRow, GiftCardRow } from '../api/types';
import { isToday, fmtPts, fmtTime } from '../utils/format';
import { useReduceMotion } from '../utils/motion';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAY = 86400000;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const goTab = (screen: 'Home' | 'Clients' | 'Rewards' | 'Account') =>
    (navigation as any).navigate('Tabs', { screen });
  const { merchant } = useAuth();
  const { online } = useNetwork();
  const localOps = useAppStore((s) => s.localOps);
  const inbox = useAppStore((s) => s.inbox);
  const unreadNotifs = inbox.reduce((n, x) => (x.read ? n : n + 1), 0);

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<LoyaltyCardRow[]>([]);
  const [gifts, setGifts] = useState<GiftCardRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!merchant) return;
    try {
      const rows = await fetchTransactions(merchant.id, 1000);
      setTxs(rows);
    } catch {
      /* hors ligne : on garde ce qu'on a */
    } finally {
      setLoaded(true);
    }
    if (online) {
      fetchCards(merchant.id).then(setCards).catch(() => {});
      fetchGiftCards(merchant.id).then(setGifts).catch(() => {});
    }
  }, [merchant, online]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const threshold = merchant?.threshold || 10;

  // Statistiques du jour + agregats (memes calculs qu'avant, memes appels).
  const stats = useMemo(() => {
    const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYest = startToday - DAY;

    const earns = txs.filter((t) => t.type === 'earn');
    const earnsToday = earns.filter((t) => isToday(t.created_at));
    const ptsToday = earnsToday.reduce((s, t) => s + (t.pts || 0), 0);
    const ptsYesterday = earns
      .filter((t) => ms(t.created_at) >= startYest && ms(t.created_at) < startToday)
      .reduce((s, t) => s + (t.pts || 0), 0);

    const localToday = localOps.filter((o) => isToday(new Date(o.at).toISOString()));
    const localCredits = localToday.filter((o) => o.type === 'credit');
    const localPts = localCredits.reduce((s, o) => s + (o.pts || 0), 0);

    const ptsGiven = ptsToday + localPts;
    const delta =
      ptsYesterday > 0 ? Math.round(((ptsGiven - ptsYesterday) / ptsYesterday) * 100) : null;

    const totalClients = cards.length;
    const readyCount = cards.filter((c) => (c.pts || 0) >= threshold).length;
    const activeGifts = gifts.filter((g) => g.status === 'active').length;

    return {
      credits: earnsToday.length + localCredits.length,
      ptsGiven,
      delta,
      totalClients,
      readyCount,
      activeGifts,
    };
  }, [txs, cards, gifts, localOps, threshold]);

  const nameByCard = useMemo(() => {
    const map: Record<string, string> = {};
    cards.forEach((c) => {
      if (c.id) map[c.id] = c.client_name || 'Client';
    });
    return map;
  }, [cards]);

  const recentActivity = useMemo(() => txs.slice(0, 6), [txs]);

  const shopInitial = (merchant?.name || 'M').trim().charAt(0).toUpperCase() || 'M';

  return (
    <Screen scroll padded refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      {/* En-tete : logo + salutation + cloche */}
      <AnimatedListItem index={0}>
        <View style={styles.head}>
          {merchant?.logo_url ? (
            <View style={[styles.logo, { overflow: 'hidden', backgroundColor: colors.s3 }, theme.accentShadow]}>
              <Image source={{ uri: merchant.logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
          ) : (
            <View style={[styles.logo, { backgroundColor: theme.accent }, theme.accentShadow]}>
              <Text style={styles.logoTxt}>{shopInitial}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Bonjour</Text>
            <Text style={styles.shopName} numberOfLines={1}>
              {merchant?.name || 'Ma boutique'}
            </Text>
          </View>
          <Pressable
            style={styles.bell}
            onPress={() => navigation.navigate('Push')}
            accessibilityLabel="Campagnes et notifications"
          >
            <Icon name="bell" size={19} color={colors.tx} />
            {unreadNotifs > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeTxt}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
              </View>
            ) : stats.readyCount > 0 ? (
              <View style={[styles.bellDot, { backgroundColor: theme.accent }]} />
            ) : null}
          </Pressable>
        </View>
      </AnimatedListItem>

      <OfflineBanner />

      {/* Carte Points aujourd'hui */}
      <AnimatedListItem index={1}>
        <View style={styles.card}>
          <Text style={styles.cap}>Points aujourd'hui</Text>
          <View style={styles.numRow}>
            <AnimatedCounter value={stats.ptsGiven} style={styles.bigNum} group />
            <Text style={[styles.ptsUnit, { color: theme.accent }]}>pts</Text>
          </View>
          <View style={styles.pills}>
            {stats.delta != null ? (
              <View style={[styles.pill, { backgroundColor: theme.accentSoftBg }]}>
                <Icon
                  name={stats.delta >= 0 ? 'trending-up' : 'trending-down'}
                  size={13}
                  color={theme.accentDark}
                />
                <Text style={[styles.pillTxt, { color: theme.accentDark }]}>
                  {stats.delta >= 0 ? '+' : ''}
                  {stats.delta}% vs hier
                </Text>
              </View>
            ) : null}
            <View style={[styles.pill, styles.pillGray]}>
              <Text style={[styles.pillTxt, { color: colors.tx2 }]}>
                {stats.credits} ticket{stats.credits > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
      </AnimatedListItem>

      {/* Bouton Scanner une carte (respire doucement) */}
      <AnimatedListItem index={2}>
        <BreathingScan onPress={() => navigation.navigate('Scan')} accent={theme.accent} shadow={theme.accentShadow} />
      </AnimatedListItem>

      {/* Cartes de navigation */}
      <AnimatedListItem index={3}>
        <View style={styles.list}>
          <NavRow
            icon="users"
            title="Clients"
            sub={`${stats.totalClients} fidele${stats.totalClients > 1 ? 's' : ''}`}
            onPress={() => goTab('Clients')}
            accentSoftBg={theme.accentSoftBg}
            accentDark={theme.accentDark}
          />
          <NavRow
            icon="star"
            title="Recompenses"
            sub={`${stats.readyCount} prete${stats.readyCount > 1 ? 's' : ''} a remettre`}
            badge={stats.readyCount}
            onPress={() => goTab('Rewards')}
            accentSoftBg={theme.accentSoftBg}
            accentDark={theme.accentDark}
            badgeColor={theme.accent}
          />
          <NavRow
            icon="gift"
            title="Cartes cadeaux"
            sub={`${stats.activeGifts} active${stats.activeGifts > 1 ? 's' : ''}`}
            onPress={() => navigation.navigate('GiftCards')}
            accentSoftBg={theme.accentSoftBg}
            accentDark={theme.accentDark}
          />
          <NavRow
            icon="bar-chart-2"
            title="Tableau de bord"
            sub="Stats et analytics"
            onPress={() => navigation.navigate('Dashboard')}
            accentSoftBg={theme.accentSoftBg}
            accentDark={theme.accentDark}
            last
          />
        </View>
      </AnimatedListItem>

      {/* Activite recente */}
      <AnimatedListItem index={4}>
        <View style={styles.seeHead}>
          <Text style={styles.seeHeadCap}>Activite recente</Text>
          <Pressable onPress={() => navigation.navigate('History')} accessibilityLabel="Tout voir">
            <Text style={[styles.seeHeadV, { color: theme.accent }]}>Tout voir</Text>
          </Pressable>
        </View>
      </AnimatedListItem>

      {!loaded && !recentActivity.length ? (
        <SkeletonList count={4} />
      ) : recentActivity.length ? (
        <View style={styles.list}>
          {recentActivity.map((t, i) => {
            const reward = t.type === 'reward';
            const name = nameByCard[t.card_id || ''] || 'Client';
            const initials = name
              .split(' ')
              .map((w) => w.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase();
            return (
              <AnimatedListItem key={t.id || i} index={i}>
                <View style={[styles.act, i > 0 && styles.actBorder]}>
                  <View style={[styles.avatar, { backgroundColor: theme.accentSoftBg }]}>
                    <Text style={[styles.avatarTxt, { color: theme.accentDark }]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.actNote} numberOfLines={1}>
                      {reward ? 'Recompense remise' : 'Achat credite'} - {fmtTime(t.created_at)}
                    </Text>
                  </View>
                  {reward ? (
                    <View style={styles.rewardTag}>
                      <Text style={styles.rewardTagTxt}>Recompense</Text>
                    </View>
                  ) : (
                    <Text style={[styles.plus, { color: theme.accent }]}>+{fmtPts(Math.abs(t.pts || 0))} pts</Text>
                  )}
                </View>
              </AnimatedListItem>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIco}>
            <Icon name="clipboard" size={26} color={colors.tx3} />
          </View>
          <Text style={styles.emptyTitle}>Aucune activite</Text>
          <Text style={styles.emptySub}>Les scans et points de tes clients apparaitront ici.</Text>
          <PressableScale
            style={[styles.emptyBtn, { backgroundColor: theme.accent }, theme.accentShadow]}
            onPress={() => navigation.navigate('Scan')}
            haptic="medium"
            accessibilityLabel="Scanner un client"
          >
            <Icon name="camera" size={18} color={colors.onColor} />
            <Text style={styles.emptyBtnTxt}>Scanner un client</Text>
          </PressableScale>
        </View>
      )}
    </Screen>
  );
}

// Bouton plein qui "respire" (scale doux en boucle) + retour tactile (scale).
function BreathingScan({
  onPress,
  accent,
  shadow: accentShadow,
}: {
  onPress: () => void;
  accent: string;
  shadow: any;
}) {
  const reduce = useReduceMotion();
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1700, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });

  return (
    <PressableScale onPress={onPress} haptic="medium" scaleTo={0.97} accessibilityLabel="Scanner une carte">
      <Animated.View
        style={[styles.scan, { backgroundColor: accent }, accentShadow, { transform: [{ scale }] }]}
      >
        <Icon name="maximize" size={21} color={colors.onColor} />
        <Text style={styles.scanTxt}>Scanner une carte</Text>
      </Animated.View>
    </PressableScale>
  );
}

function NavRow({
  icon,
  title,
  sub,
  badge,
  onPress,
  accentSoftBg,
  accentDark,
  badgeColor,
  last,
}: {
  icon: IconName;
  title: string;
  sub: string;
  badge?: number;
  onPress: () => void;
  accentSoftBg: string;
  accentDark: string;
  badgeColor?: string;
  last?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={title} scaleTo={0.985} style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.rowIco, { backgroundColor: accentSoftBg }]}>
        <Icon name={icon} size={21} color={accentDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {badge && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeTxt}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={19} color={colors.tx3} />
      )}
    </PressableScale>
  );
}

const CARD_RADIUS = 26;

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: 120 },

  // En-tete
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  logo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoTxt: { fontFamily: fonts.heading, fontSize: 19, color: colors.onColor },
  hello: { fontFamily: fonts.body, fontSize: 13.5, color: colors.tx2 },
  shopName: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.tx, marginTop: 1 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.b1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.s1,
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.s1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeTxt: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.white },

  // Carte generique blanche coins doux
  card: {
    backgroundColor: colors.s2,
    borderRadius: CARD_RADIUS,
    padding: 22,
    ...shadow.card,
  },
  cap: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.tx3,
  },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  bigNum: { fontFamily: fonts.heading, fontSize: 58, color: colors.tx, letterSpacing: -1.5, lineHeight: 60 },
  ptsUnit: { fontFamily: fonts.heading, fontSize: 20, paddingBottom: 9 },
  pills: { flexDirection: 'row', gap: 9, marginTop: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  pillGray: { backgroundColor: colors.s3 },
  pillTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5 },

  // Bouton Scanner
  scan: {
    minHeight: 62,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanTxt: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.onColor },

  // Liste (cartes nav + activite)
  list: {
    backgroundColor: colors.s2,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.b1 },
  rowIco: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.tx },
  rowSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2, marginTop: 2 },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  badgeTxt: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onColor },

  // Entete "Activite recente"
  seeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 2 },
  seeHeadCap: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.tx3 },
  seeHeadV: { fontFamily: fonts.bodyBold, fontSize: 13 },

  // Lignes d'activite
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  actBorder: { borderTopWidth: 1, borderTopColor: colors.b1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: fonts.bodyBold, fontSize: 14 },
  actName: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.tx },
  actNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2, marginTop: 2 },
  plus: { fontFamily: fonts.bodyBold, fontSize: 15 },
  rewardTag: { backgroundColor: '#FBF3E0', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  rewardTagTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.goldDeep },

  // Etat vide
  empty: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: colors.s2,
    borderRadius: CARD_RADIUS,
    ...shadow.card,
  },
  emptyIco: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.s3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.tx2 },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.tx3, textAlign: 'center', maxWidth: 240, lineHeight: 19 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 10,
  },
  emptyBtnTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onColor },
});
