// ============================================================
// MySargal Caisse - Journal des operations du jour
// Fusionne les transactions serveur du jour, les operations locales et la
// file d'attente hors ligne (badge "en attente").
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { OfflineBanner } from '../components/OfflineBanner';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { useAuth } from '../auth/AuthContext';
import { useAppStore } from '../store/appStore';
import { useQueue } from '../offline/queue';
import { useNetwork } from '../offline/NetworkProvider';
import { fetchTransactions } from '../api/endpoints';
import { Transaction } from '../api/types';
import { fmtPts, fmtTime, isToday } from '../utils/format';

interface Row {
  key: string;
  title: string;
  sub: string;
  pts: number;
  type: string;
  time: string;
  pending?: boolean;
}

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { merchant } = useAuth();
  const { online } = useNetwork();
  const theme = useTheme();
  const localOps = useAppStore((s) => s.localOps);
  const queue = useQueue((s) => s.items);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!merchant || !online) return;
    try {
      const rows = await fetchTransactions(merchant.id, 120);
      setTxs(rows);
    } catch {
      /* garde l'existant */
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

  const rows: Row[] = useMemo(() => {
    // File hors ligne en attente (prioritaire en tete).
    const pending: Row[] = queue.map((q) => ({
      key: q.id,
      title: q.clientName || q.cardCode,
      sub: q.type === 'credit' ? q.note || 'Achat' : q.rewardName || 'Recompense',
      pts: q.type === 'credit' ? q.pts || 0 : -(0),
      type: q.type,
      time: fmtTime(new Date(q.createdAt).toISOString()),
      pending: true,
    }));

    // Operations locales deja synchronisees (retour visuel immediat).
    const local: Row[] = localOps
      .filter((o) => !o.pending && isToday(new Date(o.at).toISOString()))
      .map((o) => ({
        key: o.id,
        title: o.clientName || o.cardCode,
        sub: o.note || (o.type === 'credit' ? 'Achat' : 'Recompense'),
        pts: o.pts,
        type: o.type,
        time: fmtTime(new Date(o.at).toISOString()),
      }));

    // Transactions serveur du jour.
    const server: Row[] = txs
      .filter((t) => isToday(t.created_at))
      .map((t, i) => ({
        key: t.id || `srv_${i}_${t.created_at}`,
        title: t.note || (t.type === 'earn' ? 'Achat' : 'Recompense'),
        sub: t.type === 'earn' ? 'Points crédités' : 'Récompense remise',
        pts: t.pts,
        type: t.type === 'earn' ? 'credit' : 'reward',
        time: fmtTime(t.created_at),
      }));

    // On evite les doublons grossiers : si des ops locales existent, le serveur
    // les recouvre au prochain chargement. On affiche pending + serveur.
    return [...pending, ...server];
  }, [queue, localOps, txs]);

  const stats = useMemo(() => {
    const credits = rows.filter((r) => r.type === 'credit');
    const rewards = rows.filter((r) => r.type === 'reward');
    const pts = credits.reduce((s, r) => s + (r.pts > 0 ? r.pts : 0), 0);
    return { credits: credits.length, rewards: rewards.length, pts };
  }, [rows]);

  return (
    <Screen scroll padded refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      <PageHeader title="Journal du jour" subtitle="Operations enregistrees aujourd'hui." />

      <OfflineBanner />

      <Card elevated style={styles.statsCard}>
        <Stat value={String(stats.credits)} label="Achats" />
        <View style={styles.vsep} />
        <Stat value={fmtPts(stats.pts)} label="Points" accent />
        <View style={styles.vsep} />
        <Stat value={String(stats.rewards)} label="Récompenses" />
      </Card>

      {rows.length ? (
        <View style={styles.list}>
          {rows.map((r, i) => (
            <AnimatedListItem key={r.key} index={i} style={styles.row}>
              <View style={[styles.iconBox, r.type === 'reward' ? styles.iconReward : [styles.iconCredit, { backgroundColor: theme.accentSoftBg }]]}>
                <Icon name={r.type === 'reward' ? 'gift' : 'plus'} size={18} color={r.type === 'reward' ? colors.gold : theme.accentDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <View style={styles.rowSubLine}>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {r.sub}
                  </Text>
                  {r.pending ? <StatusBadge label="En attente" tone="gold" small /> : null}
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text
                  style={[
                    styles.rowPts,
                    { color: r.type === 'reward' ? colors.gold : theme.accentDark },
                  ]}
                >
                  {r.type === 'reward' ? '' : '+'}
                  {r.pts !== 0 ? fmtPts(Math.abs(r.pts)) : ''}
                  {r.pts !== 0 ? ' pts' : ''}
                </Text>
                {r.time ? <Text style={styles.rowTime}>{r.time}</Text> : null}
              </View>
            </AnimatedListItem>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="file-text"
          title="Aucune operation aujourd'hui"
          message="Les achats crédités et récompenses remises apparaîtront ici."
        />
      )}
    </Screen>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, accent && { color: theme.accentDark }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backTxt: { fontFamily: fonts.bodyBold, fontSize: 16 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx, letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },
  statsCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx },
  statLbl: { fontFamily: fonts.body, fontSize: 11.5, color: colors.tx3 },
  vsep: { width: 1, height: 34, backgroundColor: colors.b1 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 12,
  },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconCredit: {},
  iconReward: { backgroundColor: colors.goldSoft },
  iconTxt: { fontSize: 16 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.tx },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, flexShrink: 1 },
  rowRight: { alignItems: 'flex-end' },
  rowPts: { fontFamily: fonts.headingBold, fontSize: 15 },
  rowTime: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.tx3, marginTop: 2 },
});
