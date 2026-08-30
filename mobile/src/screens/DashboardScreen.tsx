// ============================================================
// MySargal Caisse - Tableau de bord
// Statistiques par periode (7 / 30 / 90 j), activite par jour, top clients,
// carte Boost (points x2), journal d'activite serveur, cout WhatsApp,
// export CSV des operations. Reproduit renderDashboard() de l'app web.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useToast } from '../components/Toast';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { SkeletonCard } from '../components/Skeleton';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { colors, fonts, radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { useReduceMotion } from '../utils/motion';

import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import {
  fetchTransactions,
  fetchCards,
  fetchGiftCards,
  fetchJournal,
  fetchWaUsage,
  updateMerchant,
} from '../api/endpoints';
import { Transaction, LoyaltyCardRow, GiftCardRow, JournalRow, WaUsageRow } from '../api/types';
import { fmtPts, fmtDate } from '../utils/format';
import { fmtAmount, deviseInfo } from '../utils/currency';
import { WA_TARIF, WA_USD_FCFA } from '../utils/push';
import { WA_MESSAGES, openWhatsApp } from '../utils/wa';
import { buildCSV, exportCSV } from '../utils/csv';

const PERIODS = [
  { key: '7', label: '7 jours' },
  { key: '30', label: '30 jours' },
  { key: '90', label: '90 jours' },
];

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const { merchant, refreshMerchant } = useAuth();
  const { online } = useNetwork();
  const { toast } = useToast();

  const [period, setPeriod] = useState('7');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<LoyaltyCardRow[]>([]);
  const [gifts, setGifts] = useState<GiftCardRow[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [wa, setWa] = useState<WaUsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boostBusy, setBoostBusy] = useState(false);

  const load = useCallback(async () => {
    if (!merchant || !online) return;
    try {
      const [t, c, g] = await Promise.all([
        fetchTransactions(merchant.id, 1000),
        fetchCards(merchant.id),
        fetchGiftCards(merchant.id),
      ]);
      setTxs(t);
      setCards(c);
      setGifts(g);
      fetchJournal(merchant.id, 30, 200).then(setJournal).catch(() => {});
      fetchWaUsage(merchant.id, 6).then(setWa).catch(() => {});
    } catch {
      /* garde l'existant */
    }
  }, [merchant, online]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const days = parseInt(period, 10);

  const stats = useMemo(() => {
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const prevCutoff = cutoff - days * 86400000;
    const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
    const periodTxs = txs.filter((t) => ms(t.created_at) >= cutoff);
    const prevTxs = txs.filter((t) => ms(t.created_at) >= prevCutoff && ms(t.created_at) < cutoff);
    const earn = periodTxs.filter((t) => t.type === 'earn');
    const prevEarn = prevTxs.filter((t) => t.type === 'earn');
    const clientsSet = new Set(periodTxs.map((t) => t.card_id).filter(Boolean));
    const ptsSum = earn.reduce((s, t) => s + (t.pts || 0), 0);
    const rewards = periodTxs.filter((t) => t.type === 'reward').length;
    const delta = prevEarn.length ? Math.round(((earn.length - prevEarn.length) / prevEarn.length) * 100) : null;
    // Activite par jour (buckets).
    const buckets: number[] = Array.from({ length: days > 30 ? 12 : days }, () => 0);
    const span = days > 30 ? Math.ceil(days / 12) : 1;
    earn.forEach((t) => {
      const d = Math.floor((now - ms(t.created_at)) / 86400000);
      const idx = buckets.length - 1 - Math.min(buckets.length - 1, Math.floor(d / span));
      if (idx >= 0 && idx < buckets.length) buckets[idx]++;
    });
    // Top clients par nombre de scans.
    const byClient: Record<string, number> = {};
    earn.forEach((t) => {
      if (t.card_id) byClient[t.card_id] = (byClient[t.card_id] || 0) + 1;
    });
    const top = Object.entries(byClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cid, n]) => {
        const card = cards.find((c) => c.id === cid);
        return { name: card?.client_name || 'Client', code: card?.code || '', n };
      });
    const activeGifts = gifts.filter((g) => g.status === 'active').length;
    // Nouveaux clients : cartes creees sur la periode.
    const newClients = cards.filter((c) => ms(c.created_at) >= cutoff).length;
    // CA fidelise estime : points donnes converti via le ratio de la boutique.
    const ratio = merchant?.pts_fcfa_per_point || deviseInfo(merchant?.currency).ratio || 1;
    const caFidelise = Math.round(ptsSum * ratio);
    return { scans: earn.length, clients: clientsSet.size, ptsSum, rewards, delta, buckets, top, activeGifts, newClients, caFidelise };
  }, [txs, cards, gifts, days, merchant]);

  const waCost = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    let cost = 0;
    let count = 0;
    wa.forEach((r) => {
      if (r.statut !== 'sent') return;
      if (r.mois && !String(r.mois).startsWith(month)) return;
      const tarif = WA_TARIF[String(r.categorie || 'autre')] ?? WA_TARIF.autre;
      cost += (r.n || 0) * tarif;
      count += r.n || 0;
    });
    return { fcfa: Math.round(cost * WA_USD_FCFA), count };
  }, [wa]);

  const boost = useMemo(() => {
    const cfg = (merchant?.reward_config || {}) as any;
    const until = cfg.boost_until ? new Date(cfg.boost_until).getTime() : 0;
    const active = until > Date.now();
    return { active, until, x: cfg.boost_x || 2 };
  }, [merchant]);

  const setBoost = async (nDays: number) => {
    if (!merchant) return;
    setBoostBusy(true);
    try {
      const cfg = { ...((merchant.reward_config || {}) as any) };
      if (nDays <= 0) {
        delete cfg.boost_until;
        delete cfg.boost_x;
      } else {
        cfg.boost_x = 2;
        cfg.boost_until = new Date(Date.now() + nDays * 86400000).toISOString();
      }
      await updateMerchant(merchant.id, { reward_config: cfg });
      await refreshMerchant();
      toast(nDays <= 0 ? 'Boost arrete.' : `Boost points x2 active ${nDays === 1 ? '24 h' : nDays + ' jours'}.`, 'success');
    } catch (e: any) {
      toast(e?.message || 'Boost impossible', 'error');
    } finally {
      setBoostBusy(false);
    }
  };

  const announceBoost = () => {
    const date = boost.until ? fmtDate(new Date(boost.until).toISOString()) : '';
    openWhatsApp(null, WA_MESSAGES.boost(merchant?.name || 'notre boutique', boost.x, date));
  };

  const doExport = async () => {
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const rows = txs
      .filter((t) => (t.created_at ? new Date(t.created_at).getTime() >= cutoff : false))
      .map((t) => {
        const card = cards.find((c) => c.id === t.card_id);
        return [
          t.created_at || '',
          t.type === 'earn' ? 'Credit' : t.type === 'reward' ? 'Recompense' : t.type,
          card?.client_name || '',
          card?.code || '',
          t.pts ?? 0,
          t.note || '',
        ];
      });
    if (!rows.length) {
      toast('Aucune operation a exporter sur la période.', 'warn');
      return;
    }
    try {
      const csv = buildCSV(['Date', 'Type', 'Client', 'Code', 'Points', 'Note'], rows);
      const name = `${(merchant?.name || 'boutique').replace(/\s+/g, '_')}_operations_${period}j.csv`;
      await exportCSV(name, csv);
    } catch (e: any) {
      toast(e?.message || 'Export impossible', 'error');
    }
  };

  // Libelles des jours (initiales) pour la periode 7 jours uniquement.
  const dayLabels = useMemo(() => {
    if (days !== 7) return undefined;
    const L = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      out.push(L[d.getDay()]);
    }
    return out;
  }, [days]);

  return (
    <Screen scroll padded refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      <PageHeader title="Tableau de bord" />

      <OfflineBanner />

      <Segmented items={PERIODS} value={period} onChange={setPeriod} />

      {loading && !txs.length ? (
        <View style={{ gap: spacing.lg }}>
          <SkeletonCard height={92} />
          <SkeletonCard height={150} />
          <SkeletonCard height={130} />
        </View>
      ) : (
        <>
          {/* Carte hero : chiffre d'affaires fidelise (estime) */}
          <View style={[styles.hero, { backgroundColor: theme.accent }, theme.accentShadow]}>
            <Text style={styles.heroCap}>Chiffre d'affaires fidelise</Text>
            <View style={styles.heroNumRow}>
              <AnimatedCounter value={stats.caFidelise} style={styles.heroBig} group />
              <Text style={styles.heroUnit}>{deviseInfo(merchant?.currency).symbol}</Text>
            </View>
            <Text style={styles.heroSub}>
              {stats.clients} client{stats.clients > 1 ? 's' : ''} actif{stats.clients > 1 ? 's' : ''} sur la periode
            </Text>
            {stats.delta != null ? (
              <View style={styles.heroChip}>
                <Icon name={stats.delta >= 0 ? 'trending-up' : 'trending-down'} size={13} color={colors.onColor} />
                <Text style={styles.heroChipTxt}>
                  {stats.delta >= 0 ? '+' : ''}
                  {stats.delta}% vs periode precedente
                </Text>
              </View>
            ) : null}
          </View>

          {/* KPI (compteurs) */}
          <View style={styles.kpiGrid}>
            <Kpi num={stats.ptsSum} label="Points distribues" accent />
            <Kpi num={stats.newClients} label="Nouveaux clients" prefix="+" />
            <Kpi num={stats.scans} label="Achats credites" delta={stats.delta} />
            <Kpi num={stats.rewards} label="Recompenses" />
          </View>

          {/* Achats credites (barres qui poussent, meilleur jour en accent) */}
          <View style={styles.chartCard}>
            <View style={styles.chartHead}>
              <Text style={styles.cardTitle}>Achats credites</Text>
              <Text style={styles.chartHint}>{days} derniers jours</Text>
            </View>
            <BarChart buckets={stats.buckets} labels={dayLabels} accent={theme.accent} soft={theme.accentSoftBg} />
          </View>

          {/* Boost */}
          <Card style={[styles.card, boost.active && { borderColor: theme.accentBorder, backgroundColor: theme.accentSoftBg }]}>
            <View style={styles.boostHead}>
              <Text style={styles.cardTitle}>Boost points x2</Text>
              {boost.active ? (
                <Text style={[styles.boostBadge, { color: theme.accentDark }]}>
                  Actif jusqu'au {fmtDate(new Date(boost.until).toISOString())}
                </Text>
              ) : null}
            </View>
            <Text style={styles.boostSub}>
              Doublez les points pendant quelques jours pour dynamiser la boutique.
            </Text>
            <View style={styles.boostRow}>
              <Pressable style={styles.boostBtn} disabled={boostBusy} onPress={() => setBoost(1)}>
                <Text style={styles.boostBtnTxt}>24 h</Text>
              </Pressable>
              <Pressable style={styles.boostBtn} disabled={boostBusy} onPress={() => setBoost(3)}>
                <Text style={styles.boostBtnTxt}>3 jours</Text>
              </Pressable>
              <Pressable style={styles.boostBtn} disabled={boostBusy} onPress={() => setBoost(7)}>
                <Text style={styles.boostBtnTxt}>7 jours</Text>
              </Pressable>
            </View>
            {boost.active ? (
              <View style={{ gap: 8 }}>
                <Button label="Annoncer le boost par WhatsApp" icon="send" variant="secondary" onPress={announceBoost} />
                <Button label="Arreter le boost" variant="ghost" onPress={() => setBoost(0)} loading={boostBusy} />
              </View>
            ) : null}
          </Card>

          {/* Top clients */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Meilleurs clients</Text>
            {stats.top.length ? (
              stats.top.map((c, i) => (
                <AnimatedListItem key={c.code + i} index={i} style={styles.topRow}>
                  <Text style={[styles.topRank, { color: theme.accentDark }]}>{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.topN}>{c.n} achats</Text>
                </AnimatedListItem>
              ))
            ) : (
              <Text style={styles.emptyLine}>Aucune activite sur la période.</Text>
            )}
          </Card>

          {/* Cartes cadeaux + WhatsApp */}
          <View style={styles.kpiGrid}>
            <Kpi num={stats.activeGifts} label="Cartes cadeaux actives" />
            <Kpi value={fmtAmount(waCost.fcfa, merchant?.currency)} label={`Cout WhatsApp (${waCost.count})`} />
          </View>

          <Button label="Exporter les operations (CSV)" icon="download" variant="secondary" onPress={doExport} />

          {/* Journal */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Journal d'activite</Text>
            {journal.length ? (
              journal.slice(0, 40).map((j, i) => (
                <AnimatedListItem key={i} index={i} style={styles.jrnRow}>
                  <View style={[styles.jrnDot, jrnColor(j.categorie, theme.accent)]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jrnDetail} numberOfLines={1}>
                      {j.detail || j.categorie || 'Operation'}
                    </Text>
                    <Text style={styles.jrnMeta}>
                      {j.qui || 'Caisse'}
                      {j.quand ? ` · ${fmtDate(j.quand)}` : ''}
                    </Text>
                  </View>
                </AnimatedListItem>
              ))
            ) : (
              <EmptyState icon="file-text" title="Journal vide" message="Les operations apparaîtront ici." />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Kpi({ value, num, label, accent, delta, prefix }: { value?: string; num?: number; label: string; accent?: boolean; delta?: number | null; prefix?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.kpi}>
      {num != null ? (
        <AnimatedCounter
          value={num}
          prefix={prefix}
          style={[styles.kpiVal, accent ? { color: theme.accent } : null]}
          group
        />
      ) : (
        <Text style={[styles.kpiVal, accent && { color: theme.accent }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.kpiLbl}>{label}</Text>
      {delta != null ? (
        <View style={styles.kpiDeltaRow}>
          <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={12} color={delta >= 0 ? theme.accentDark : colors.red} />
          <Text style={[styles.kpiDelta, { color: delta >= 0 ? theme.accentDark : colors.red }]}>
            {Math.abs(delta)}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Barres qui poussent a l'ouverture (Animated height). Le meilleur jour est
// peint en accent plein, les autres en fond d'accent doux.
function BarChart({
  buckets,
  labels,
  accent,
  soft,
}: {
  buckets: number[];
  labels?: string[];
  accent: string;
  soft: string;
}) {
  const reduce = useReduceMotion();
  const max = Math.max(1, ...buckets);
  const bestIdx = buckets.reduce((best, v, i) => (v > buckets[best] ? i : best), 0);
  const anims = useRef(buckets.map(() => new Animated.Value(reduce ? 1 : 0))).current;

  // Recree les valeurs animees si le nombre de barres change (7/30/90 j).
  const bars = useRef<Animated.Value[]>(anims);
  if (bars.current.length !== buckets.length) {
    bars.current = buckets.map(() => new Animated.Value(reduce ? 1 : 0));
  }

  useEffect(() => {
    if (reduce) {
      bars.current.forEach((v) => v.setValue(1));
      return;
    }
    const seq = bars.current.map((v, i) =>
      Animated.timing(v, { toValue: 1, duration: 700, delay: i * 60, useNativeDriver: false })
    );
    bars.current.forEach((v) => v.setValue(0));
    const group = Animated.stagger(0, seq);
    group.start();
    return () => group.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, reduce]);

  return (
    <View style={styles.bars}>
      {buckets.map((v, i) => {
        const target = 8 + (v / max) * 122;
        const hot = i === bestIdx && v > 0;
        const height = bars.current[i].interpolate({ inputRange: [0, 1], outputRange: [0, target] });
        return (
          <View key={i} style={styles.barCol}>
            <Animated.View
              style={[styles.bar, { height, backgroundColor: hot ? accent : soft }]}
            />
            {labels ? (
              <Text style={[styles.barLabel, hot && { color: accent, fontFamily: fonts.bodyBold }]}>{labels[i]}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function jrnColor(cat: string | null | undefined, accent: string) {
  const c = String(cat || '');
  if (/recompense|récompense/i.test(c)) return { backgroundColor: colors.gold };
  if (/numero|numéro/i.test(c)) return { backgroundColor: colors.violet2 };
  return { backgroundColor: accent };
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 120 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.b1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },

  // Hero
  hero: { borderRadius: 26, padding: 22 },
  heroCap: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' },
  heroNumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 },
  heroBig: { fontFamily: fonts.heading, fontSize: 42, color: colors.onColor, letterSpacing: -1 },
  heroUnit: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.onColor, paddingBottom: 5 },
  heroSub: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 3 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: 14,
  },
  heroChipTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.onColor },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.s2,
    borderRadius: 20,
    padding: 16,
    gap: 3,
    ...shadow.card,
  },
  kpiVal: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx },
  kpiLbl: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2 },
  kpiDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  kpiDelta: { fontFamily: fonts.bodyBold, fontSize: 11 },
  card: { gap: 12 },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.tx },

  // Graphique en barres
  chartCard: { backgroundColor: colors.s2, borderRadius: 24, padding: 20, gap: 4, ...shadow.card },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150, marginTop: 16, gap: 9 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 9, height: '100%' },
  bar: { width: '100%', borderRadius: 8, minHeight: 4 },
  barLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3 },
  chartHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2 },
  boostOn: {},
  boostHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  boostBadge: { fontFamily: fonts.bodySemi, fontSize: 11 },
  boostSub: { fontFamily: fonts.body, fontSize: 13, color: colors.tx2, lineHeight: 19 },
  boostRow: { flexDirection: 'row', gap: 8 },
  boostBtn: { flex: 1, backgroundColor: colors.s3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b2, paddingVertical: 14, alignItems: 'center' },
  boostBtnTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  topRank: { fontFamily: fonts.heading, fontSize: 16, width: 20 },
  topName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  topN: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx2 },
  emptyLine: { fontFamily: fonts.body, fontSize: 13, color: colors.tx3 },
  jrnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  jrnDot: { width: 8, height: 8, borderRadius: 4 },
  jrnDetail: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.tx },
  jrnMeta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.tx3, marginTop: 2 },
});
